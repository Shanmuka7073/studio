
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { useFirebase } from '@/firebase';
import { getStores, getMasterProducts, getProductPrice } from '@/lib/data';
import type { Store, Product, ProductPrice, ProductVariant, CartItem } from '@/lib/types';
import { calculateSimilarity } from '@/lib/calculate-similarity';
import { useCart } from '@/lib/cart';
import { useProfileFormStore } from '@/lib/store';
import { ProfileFormValues } from '@/app/dashboard/customer/my-profile/page';
import { useCheckoutStore } from '@/app/checkout/page';
import { getCommands } from '@/app/actions';
import { t } from '@/lib/locales';

export interface Command {
  command: string;
  action: () => void;
  display: string;
  reply: string;
}

interface VoiceCommanderProps {
  enabled: boolean;
  onStatusUpdate: (status: string) => void;
  onSuggestions: (suggestions: Command[]) => void;
  onOpenCart: () => void;
  onCloseCart: () => void;
  isCartOpen: boolean;
  cartItems: CartItem[]; // Receive cart items as a prop
}

let recognition: SpeechRecognition | null = null;
if (typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
}

export function VoiceCommander({
  enabled,
  onStatusUpdate,
  onSuggestions,
  onOpenCart,
  onCloseCart,
  isCartOpen,
  cartItems, // Use the prop
}: VoiceCommanderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const { firestore, user } = useFirebase();
  const { addItem: addItemToCart, updateQuantity, activeStoreId, setActiveStoreId } = useCart();
  const { form: profileForm } = useProfileFormStore();
  const { placeOrderBtnRef } = useCheckoutStore();

  const isSpeakingRef = useRef(false);
  const isEnabledRef = useRef(enabled);
  const commandsRef = useRef<Command[]>([]);
  const storesRef = useRef<Store[]>([]);
  const masterProductsRef = useRef<Product[]>([]);
  const productPricesRef = useRef<Record<string, ProductPrice>>({});
  const commandActionsRef = useRef<any>({});
  const fileCommandsRef = useRef<any>({});
  
  const formFieldToFillRef = useRef<keyof ProfileFormValues | null>(null);
  const [isWaitingForStoreName, setIsWaitingForStoreName] = useState(false);
  const [clarificationStores, setClarificationStores] = useState<Store[]>([]);
  const hasSpokenCheckoutPrompt = useRef(false);

  const [isWaitingForQuantity, setIsWaitingForQuantity] = useState(false);
  const itemToUpdateSkuRef = useRef<string | null>(null);


  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);
  
  useEffect(() => {
    isEnabledRef.current = enabled;
    if (recognition) {
      if (enabled) {
        try {
          recognition.start();
        } catch (e) {
            // Already started
        }
      } else {
        recognition.abort();
      }
    }
  }, [enabled]);

  const speak = useCallback((text: string, onEndCallback?: () => void) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      if (onEndCallback) onEndCallback();
      return;
    }
    
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();
    
    isSpeakingRef.current = true;
    recognition?.stop(); // Stop listening while speaking

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.pitch = 1;
    utterance.rate = 1.1;
    utterance.lang = 'en-US';

    utterance.onend = () => {
      isSpeakingRef.current = false;
      if (onEndCallback) {
        onEndCallback();
      }
      if (isEnabledRef.current) {
        try {
          recognition?.start();
        } catch(e) {
          // ignore
        }
      }
    };
    
    utterance.onerror = (e) => {
      console.error("Speech synthesis error:", e);
      isSpeakingRef.current = false;
      if (onEndCallback) onEndCallback();
    };

    window.speechSynthesis.speak(utterance);
  }, []);

  // Proactive prompt on checkout page
  useEffect(() => {
    if (pathname !== '/checkout' || !hasMounted) {
      hasSpokenCheckoutPrompt.current = false;
      setIsWaitingForStoreName(false);
      return;
    }

    if (enabled && !hasSpokenCheckoutPrompt.current) {
      const speakTimeout = setTimeout(() => {
        const actionAlert = document.getElementById('action-required-alert');
        if (actionAlert) {
          speak(`Action required. Please select a store to continue, or tell me the store name.`);
          setIsWaitingForStoreName(true);
        } else {
          const totalAmountEl = document.getElementById('final-total-amount');
          if (totalAmountEl) {
            const totalText = totalAmountEl.innerText;
            speak(`Your total is ${totalText}. Please say "place order" to confirm.`);
          }
          setIsWaitingForStoreName(false);
        }
        hasSpokenCheckoutPrompt.current = true;
      }, 1500);

      return () => clearTimeout(speakTimeout);
    }
  }, [pathname, enabled, speak, hasMounted]);


  const findProductAndVariant = useCallback(async (productName: string, desiredWeight?: string): Promise<{ product: Product | null, variant: ProductVariant | null }> => {
    const lowerProductName = productName.toLowerCase();

    const productMatch = masterProductsRef.current.find(p => {
        const translation = t(p.name.toLowerCase().replace(/ /g, '-'));
        const parts = translation.split(' / ');
        const englishName = parts[0]?.trim().toLowerCase();
        const teluguName = parts[1]?.trim();

        if (englishName === lowerProductName) return true;
        if (teluguName && teluguName === lowerProductName) return true;
        
        return false;
    });

    if (!productMatch) return { product: null, variant: null };
    
    const finalProduct = { ...productMatch }; 

    let priceData = productPricesRef.current[productMatch.name.toLowerCase()];
    if (!priceData && firestore) {
        priceData = await getProductPrice(firestore, productMatch.name.toLowerCase());
        if (priceData) {
            productPricesRef.current[productMatch.name.toLowerCase()] = priceData;
        }
    }
    
    if (priceData?.variants?.length > 0) {
        if (desiredWeight) {
            const lowerDesiredWeight = desiredWeight.replace(/\s/g, '').toLowerCase();
            const variantMatch = priceData.variants.find(v => v.weight.replace(/\s/g, '').toLowerCase() === lowerDesiredWeight);
            if (variantMatch) return { product: finalProduct, variant: variantMatch };
        }
        
        if (!desiredWeight || desiredWeight === 'one') {
          const onePieceVariant = priceData.variants.find(v => v.weight.replace(/\s/g, '').toLowerCase() === '1pc');
          if (onePieceVariant) return { product: finalProduct, variant: onePieceVariant };

           const firstVariant = priceData.variants.sort((a,b) => a.price - b.price)[0];
           if (firstVariant) return { product: finalProduct, variant: firstVariant };
        }

        return { product: finalProduct, variant: priceData.variants[0] };
    }
    
    return { product: null, variant: null };
  }, [firestore]);


  const handleProfileFormInteraction = useCallback(() => {
    if (!profileForm) {
      speak("I can't seem to access the profile form right now.");
      return;
    }
    const fields: { name: keyof ProfileFormValues; label: string }[] = [
      { name: 'firstName', label: 'first name' },
      { name: 'lastName', label: 'last name' },
      { name: 'phone', label: 'phone number' },
      { name: 'address', label: 'full address' },
    ];
    const formValues = profileForm.getValues();
    const firstEmptyField = fields.find(f => !formValues[f.name]);
    
    if (firstEmptyField) {
      formFieldToFillRef.current = firstEmptyField.name;
      speak(`What is your ${firstEmptyField.label}?`);
    } else {
      formFieldToFillRef.current = null;
      speak("Your profile looks complete! You can say 'save changes' to submit.");
    }
  }, [profileForm, speak]);

  useEffect(() => {
    if (!recognition) {
        onStatusUpdate("⚠️ Voice recognition not supported in this browser.");
        return;
    }
    
    const handleCommand = async (commandText: string) => {
        onStatusUpdate(`Processing: "${commandText}"`);
        try {
            if (!firestore || !user) return;

             // Priority 0: Handle quantity clarification
            if (isWaitingForQuantity && itemToUpdateSkuRef.current) {
                const quantityRegex = /^(\d+|one|two|three|four|five|six|seven|eight|nine|ten)/i;
                const match = commandText.match(quantityRegex);
                if (match) {
                    let quantity = 1;
                    const numStr = match[1].toLowerCase();
                    const wordToNum = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
                    quantity = wordToNum[numStr] || parseInt(numStr, 10);
                    
                    updateQuantity(itemToUpdateSkuRef.current, quantity);
                    speak(`Okay, updated to ${quantity}.`);
                } else {
                    speak("Sorry, I didn't catch a valid quantity. Please state a number.");
                }
                setIsWaitingForQuantity(false);
                itemToUpdateSkuRef.current = null;
                onSuggestions([]);
                return;
            }


            // Priority 1: Check for a perfect match with simple action commands first.
            const perfectMatch = commandsRef.current.find((c) => commandText === c.command);
            if (perfectMatch) {
                speak(perfectMatch.reply);
                perfectMatch.action();
                onSuggestions([]);
                return;
            }

            // Priority 2: Check if it's an "order item" command.
            const orderItemTemplate = fileCommandsRef.current.orderItem;
            if (orderItemTemplate) {
              for (const alias of orderItemTemplate.aliases) {
                  // Find the longest alias that is a prefix of the command
                  if (commandText.startsWith(alias)) {
                      const remainingText = commandText.substring(alias.length).trim();
                      // This alias could be a full product name itself (e.g. "add chicken")
                      // Or it could be a prefix to a product name (e.g. "add" for "add apples")
                      const product = remainingText || alias.replace(/add|get|buy|i want/g, '').trim();

                      if (product) {
                        // A simplified quantity check
                        const quantityRegex = /^(one|two|three|four|five|six|seven|eight|nine|ten|[\d\.]+)\s*(kg|kilo|kilos|gram|grams|gm|g)?/i;
                        const quantityMatch = product.match(quantityRegex);
                        let finalProduct = product;
                        let quantity;

                        if (quantityMatch) {
                           quantity = quantityMatch[0].trim();
                           finalProduct = product.substring(quantity.length).trim();
                        }

                        await commandActionsRef.current.orderItem({ product: finalProduct, quantity });
                        onSuggestions([]);
                        return;
                      }
                  }
              }
            }


            // Handle multi-store clarification
            if (clarificationStores.length > 0) {
                const chosenIndex = parseInt(commandText.replace(/[^0-9]/g, ''), 10) - 1;
                let chosenStore: Store | undefined = clarificationStores[chosenIndex];

                if (!chosenStore) {
                    const bestMatch = clarificationStores
                        .map(store => ({ ...store, similarity: calculateSimilarity(commandText, store.address.toLowerCase()) }))
                        .sort((a, b) => b.similarity - a.similarity)[0];
                    if (bestMatch && bestMatch.similarity > 0.6) {
                        chosenStore = bestMatch;
                    }
                }
                
                if (chosenStore) {
                    speak(`Okay, navigating to ${chosenStore.name} at ${chosenStore.address}.`);
                    router.push(`/stores/${chosenStore.id}`);
                } else {
                    speak(`Sorry, I didn't understand that. Please say the address or number of the store you want.`);
                }
                setClarificationStores([]);
                return;
            }

            // Handle store selection on checkout page
            if (isWaitingForStoreName) {
                const spokenStoreName = commandText.toLowerCase();
                const bestMatch = storesRef.current
                    .map(store => ({ ...store, similarity: calculateSimilarity(spokenStoreName, store.name.toLowerCase()) }))
                    .sort((a, b) => b.similarity - a.similarity)[0];

                if (bestMatch && bestMatch.similarity > 0.7) {
                    setIsWaitingForStoreName(false);
                    speak(`Okay, ordering from ${bestMatch.name}.`);
                    setActiveStoreId(bestMatch.id);
                    setTimeout(() => {
                        placeOrderBtnRef?.current?.click();
                    }, 500);
                } else {
                    speak(`Sorry, I couldn't find a store named ${commandText}. Please try again.`);
                }
                return;
            }

            // Handle filling out the profile form
            if (formFieldToFillRef.current && profileForm) {
                profileForm.setValue(formFieldToFillRef.current, commandText, { shouldValidate: true });
                formFieldToFillRef.current = null;
                handleProfileFormInteraction();
                return;
            }
            
            // Priority 3: Fuzzy matching for suggestions if no direct match is found.
            const potentialMatches = commandsRef.current
              .map((c) => ({ ...c, similarity: calculateSimilarity(commandText, c.command) }))
              .filter((c) => c.similarity > 0.7)
              .sort((a, b) => b.similarity - a.similarity)
              .filter((value, index, self) => self.findIndex((v) => v.display === value.display) === index)
              .slice(0, 3);
      
            if (potentialMatches.length > 0) {
              speak("I'm not sure. Did you mean one of these?");
              onSuggestions(potentialMatches);
            } else {
              speak(`Sorry, I don't recognize the command "${commandText}".`);
              toast({
                  variant: 'destructive',
                  title: 'Command Not Recognized',
                  description: `I heard "${commandText}", but I don't know what to do.`,
              });
              onSuggestions([]);
            }
      } catch(e) {
          console.error("Voice command execution failed:", e);
          onStatusUpdate(`⚠️ Action failed. Please try again.`);
          speak("Sorry, I couldn't do that. Please check your connection and try again.");
          onSuggestions([]);
      }
    };

    commandActionsRef.current = {
      home: () => router.push('/'),
      stores: () => router.push('/stores'),
      dashboard: () => router.push('/dashboard'),
      cart: () => router.push('/cart'),
      orders: () => router.push('/dashboard/customer/my-orders'),
      deliveries: () => router.push('/dashboard/delivery/deliveries'),
      myStore: () => router.push('/dashboard/owner/my-store'),
      checkout: () => {
        onCloseCart();
        router.push('/checkout');
      },
      placeOrder: () => {
        if (placeOrderBtnRef?.current) {
            placeOrderBtnRef.current.click();
            return;
        }
        
        if (cartItems.length > 0) {
            speak("Okay, taking you to checkout.");
            router.push('/checkout');
            return;
        }
        
        speak("Your cart is empty. Please add some items first.");
      },
      saveChanges: () => {
        if (pathname === '/dashboard/customer/my-profile' && profileForm) {
          const formElement = document.querySelector('form');
          if (formElement) formElement.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        } else {
          speak("There are no changes to save on this page.");
        }
      },
      refresh: () => window.location.reload(),
      orderItem: async ({ product, quantity }: { product: string, quantity?: string }) => {
        const { product: foundProduct, variant } = await findProductAndVariant(product, quantity);
        if (foundProduct && variant) {
          addItemToCart(foundProduct, variant, 1); // Always add 1 initially
          onOpenCart();
          
          if (!quantity) {
             // If no quantity was spoken, ask for it.
             itemToUpdateSkuRef.current = variant.sku;
             setIsWaitingForQuantity(true);
             speak(`Added. What quantity would you like?`);
          } else {
             // If quantity was spoken, just confirm.
             speak(`Added ${variant.weight} of ${t(foundProduct.name.toLowerCase().replace(/ /g, '-')).split(' / ')[0]} to your cart.`);
          }
        } else {
          speak(`Sorry, I could not find ${product} in the store.`);
        }
      },
    };
    
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-IN';

    recognition.onstart = () => {
      onStatusUpdate('🎧 Listening...');
    };

    recognition.onresult = (event) => {
        const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase().trim();
        handleCommand(transcript);
    };

    recognition.onerror = (event) => {
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        console.error('Speech recognition error', event.error);
        onStatusUpdate(`⚠️ Error: ${event.error}`);
      }
    };
    
    recognition.onend = () => {
      if (isEnabledRef.current && !isSpeakingRef.current) {
        setTimeout(() => {
          try {
            recognition?.start();
          } catch (e) {}
        }, 100);
      }
    };

    if (firestore && user) {
      Promise.all([ getStores(firestore), getMasterProducts(firestore), getCommands() ])
        .then(([stores, masterProducts, fileCommands]) => {
          storesRef.current = stores;
          masterProductsRef.current = masterProducts;
          fileCommandsRef.current = fileCommands;

          let builtCommands: Command[] = [];

          stores.forEach((store) => {
            if (store.name === 'LocalBasket') return;
            const coreName = store.name.toLowerCase().replace(/shop|store|kirana/g, '').trim();
            const variations = [...new Set([
              store.name.toLowerCase(), coreName, `go to ${store.name.toLowerCase()}`, `open ${store.name.toLowerCase()}`,
            ])];
            variations.forEach(variation => {
              builtCommands.push({
                command: variation,
                display: `Go to ${store.name}`,
                action: () => {
                  const matchingStores = stores.filter(s => s.name.toLowerCase() === store.name.toLowerCase());
                  if (matchingStores.length > 1) {
                      setClarificationStores(matchingStores);
                      let prompt = `I found ${matchingStores.length} stores named ${store.name}. `;
                      matchingStores.forEach((s, i) => {
                          prompt += `Number ${i + 1} is at ${s.address}. `;
                      });
                      prompt += "Which one would you like?";
                      speak(prompt);
                  } else {
                      router.push(`/stores/${store.id}`);
                  }
                },
                reply: `Navigating to ${store.name}.`
              });
            });
          });

          Object.entries(fileCommands).forEach(([key, { display, aliases, reply }]: [string, any]) => {
             // Exclude template item orders as they are handled differently
            if (key !== 'orderItem') {
              const action = commandActionsRef.current[key];
              if (action) {
                aliases.forEach((alias: string) => {
                  builtCommands.push({ command: alias, display, action, reply });
                });
              }
            }
          });

          commandsRef.current = builtCommands;
        }).catch(console.error);
    }
    
    return () => {
      if (recognition) {
        recognition.onend = null;
        recognition.abort();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firestore, user, cartItems, profileForm, isWaitingForStoreName, activeStoreId, placeOrderBtnRef, enabled, pathname, findProductAndVariant, handleProfileFormInteraction, speak, toast, router, onSuggestions, onStatusUpdate, onCloseCart, onOpenCart, setActiveStoreId, clarificationStores, isWaitingForQuantity, updateQuantity]);

  return null;
}

    