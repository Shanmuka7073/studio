

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { useFirebase, errorEmitter } from '@/firebase';
import { getProductPrice } from '@/lib/data';
import type { Store, Product, ProductPrice, ProductVariant, CartItem, User } from '@/lib/types';
import { calculateSimilarity } from '@/lib/calculate-similarity';
import { useCart } from '@/lib/cart';
import { useAppStore, useProfileFormStore } from '@/lib/store';
import { ProfileFormValues } from '@/app/dashboard/customer/my-profile/page';
import { useCheckoutStore } from '@/app/checkout/page';
import { getCommands } from '@/app/actions';
import { t, getAllAliases } from '@/lib/locales';
import { doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { quickOrderFlow, QuickOrderFlowResponse } from '@/ai/flows/quick-order-flow';

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

const DELIVERY_FEE = 30;

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
  const { clearCart, addItem: addItemToCart, updateQuantity, activeStoreId, setActiveStoreId } = useCart();
  
  // Get data from the central Zustand store
  const { stores, masterProducts, productPrices, fetchInitialData, fetchProductPrices, language } = useAppStore();

  const { form: profileForm } = useProfileFormStore();
  const { placeOrderBtnRef, setIsWaitingForQuickOrderConfirmation, isWaitingForQuickOrderConfirmation } = useCheckoutStore();

  const isSpeakingRef = useRef(false);
  const isEnabledRef = useRef(enabled);
  const commandsRef = useRef<Command[]>([]);
  const commandActionsRef = useRef<any>({});
  const fileCommandsRef = useRef<any>({});
  
  const formFieldToFillRef = useRef<keyof ProfileFormValues | null>(null);
  const [isWaitingForStoreName, setIsWaitingForStoreName] = useState(false);
  const [clarificationStores, setClarificationStores] = useState<Store[]>([]);
  const hasSpokenCheckoutPrompt = useRef(false);
  const hasSpokenProfilePrompt = useRef(false);

  const [isWaitingForQuantity, setIsWaitingForQuantity] = useState(false);
  const itemToUpdateSkuRef = useRef<string | null>(null);

  const userProfileRef = useRef<User | null>(null);

  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
    if(firestore) {
      fetchInitialData(firestore);
    }
  }, [firestore, fetchInitialData]);
  
  useEffect(() => {
    isEnabledRef.current = enabled;
    if (recognition) {
      if (enabled) {
        recognition.lang = language;
        try {
          recognition.start();
        } catch (e) {
            // Already started
        }
      } else {
        recognition.abort();
      }
    }
  }, [enabled, language]);

  const speak = useCallback((text: string, onEndCallback?: () => void) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      if (onEndCallback) onEndCallback();
      return;
    }
    
    window.speechSynthesis.cancel();
    
    isSpeakingRef.current = true;
    recognition?.stop();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.pitch = 1;
    utterance.rate = 1.1;
    utterance.lang = language; // Use the dynamic language

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
  }, [language]);

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

  // Proactive prompt on checkout page
  useEffect(() => {
    if (pathname !== '/checkout' || !hasMounted) {
      hasSpokenCheckoutPrompt.current = false;
      setIsWaitingForStoreName(false);
      return;
    }

    if (enabled && !hasSpokenCheckoutPrompt.current) {
      const speakTimeout = setTimeout(() => {
        if (isWaitingForQuickOrderConfirmation) {
            const totalAmountEl = document.getElementById('final-total-amount');
            if (totalAmountEl) {
                const totalText = totalAmountEl.innerText;
                speak(`Your total is ${totalText}. Please say "confirm order" to place your order.`);
            }
        } else {
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
            }
        }
        hasSpokenCheckoutPrompt.current = true;
      }, 1500);

      return () => clearTimeout(speakTimeout);
    }
  }, [pathname, enabled, speak, hasMounted, isWaitingForQuickOrderConfirmation]);

  // Proactive prompt on profile page
  useEffect(() => {
    if (pathname !== '/dashboard/customer/my-profile' || !hasMounted) {
      hasSpokenProfilePrompt.current = false;
      formFieldToFillRef.current = null;
      return;
    }

    if (enabled && !hasSpokenProfilePrompt.current && profileForm) {
      const speakTimeout = setTimeout(() => {
        handleProfileFormInteraction();
        hasSpokenProfilePrompt.current = true;
      }, 1500);

      return () => clearTimeout(speakTimeout);
    }
  }, [pathname, enabled, profileForm, hasMounted, handleProfileFormInteraction]);


  const findProductAndVariant = useCallback(async (productName: string, desiredWeight?: string): Promise<{ product: Product | null, variant: ProductVariant | null }> => {
    const lowerProductName = productName.toLowerCase();
    
    let bestMatch: { product: Product, alias: string } | null = null;

    for (const p of masterProducts) {
        if (!p.name) continue;
        const allAliasValues = Object.values(getAllAliases(p.name.toLowerCase().replace(/ /g, '-'))).flat().map(name => name.toLowerCase());

        for (const alias of allAliasValues) {
            if (lowerProductName.includes(alias)) {
                if (!bestMatch || alias.length > bestMatch.alias.length) {
                    bestMatch = { product: p, alias: alias };
                }
            }
        }
    }

    if (!bestMatch) return { product: null, variant: null };
    
    const productMatch = bestMatch.product;
    const finalProduct = { ...productMatch }; 

    let priceData = productPrices[productMatch.name.toLowerCase()];
    if (priceData === undefined && firestore) {
        await fetchProductPrices(firestore, [productMatch.name]);
        priceData = useAppStore.getState().productPrices[productMatch.name.toLowerCase()];
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
  }, [firestore, masterProducts, productPrices, fetchProductPrices]);


  useEffect(() => {
    if (!recognition) {
        onStatusUpdate("⚠️ Voice recognition not supported in this browser.");
        return;
    }
    
    const handleCommand = async (commandText: string) => {
        onStatusUpdate(`Processing: "${commandText}"`);
        try {
            if (!firestore || !user) return;
            
            const resetContext = () => {
                setIsWaitingForQuantity(false);
                itemToUpdateSkuRef.current = null;
                setIsWaitingForStoreName(false);
                setClarificationStores([]);
                onSuggestions([]);
                setIsWaitingForQuickOrderConfirmation(false);
            };

            if (isWaitingForQuickOrderConfirmation) {
                const confirmAliases = fileCommandsRef.current.quickOrderConfirm?.aliases || [];
                if (confirmAliases.includes(commandText.toLowerCase())) {
                    placeOrderBtnRef?.current?.click();
                } else {
                    speak("Okay, cancelling the order.");
                    clearCart();
                    router.push('/stores');
                }
                resetContext();
                return;
            }

            if (isWaitingForQuantity && itemToUpdateSkuRef.current) {
                const wordToNum: Record<string, number> = { one: 1, to: 2, two: 2, three: 3, four: 4, for: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
                const parts = commandText.toLowerCase().split(' ');
                let quantity: number | null = null;

                const firstWordAsNum = wordToNum[parts[0]];
                if (firstWordAsNum) {
                    quantity = firstWordAsNum;
                } else {
                    const parsedNum = parseInt(commandText.replace(/[^0-9]/g, ''), 10);
                    if (!isNaN(parsedNum)) {
                        quantity = parsedNum;
                    }
                }

                if (quantity !== null) {
                    updateQuantity(itemToUpdateSkuRef.current, quantity);
                    speak(`Okay, updated to ${quantity}.`);
                } else {
                    speak("Sorry, I didn't catch a valid quantity. Please state a number.");
                }
                
                resetContext();
                return;
            }

            if (isWaitingForStoreName && pathname === '/checkout') {
                const spokenStoreName = commandText.toLowerCase();
                const bestMatch = stores
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
                resetContext();
                return;
            }

            if (formFieldToFillRef.current && profileForm) {
                profileForm.setValue(formFieldToFillRef.current, commandText, { shouldValidate: true });
                formFieldToFillRef.current = null;
                handleProfileFormInteraction();
                return;
            }
            
            const perfectMatch = commandsRef.current.find((c) => c.command === commandText);
            if (perfectMatch) {
                speak(perfectMatch.reply);
                perfectMatch.action();
                resetContext();
                return;
            }
            
            const quickOrderTemplate = fileCommandsRef.current.quickOrder;
            if(quickOrderTemplate) {
                 const isQuickOrder = quickOrderTemplate.aliases.some(alias => {
                    const simpleAlias = alias.replace(/\{.*\}/g, '').trim();
                    return commandText.includes(simpleAlias);
                 });

                 if(isQuickOrder) {
                    await commandActionsRef.current.quickOrder({ commandText });
                    resetContext();
                    return;
                 }
            }

            const orderItemTemplate = fileCommandsRef.current.orderItem;
            if (orderItemTemplate) {
                let parsed = false;
                 for (const alias of orderItemTemplate.aliases) {
                    if(parsed) break;

                    const aliasParts = alias.split(/(\{product\}|\{quantity\})/g).filter(Boolean);
                    const isTemplate = aliasParts.some(p => p === '{product}' || p === '{quantity}');
                    
                    if (isTemplate) {
                        const regexString = alias
                            .replace(/\{quantity\}/g, '([\\w\\s\\d]+?)')
                            .replace(/\{product\}/g, '([\\w\\s]+)');
                        
                        const regex = new RegExp(`^${regexString}$`, 'i');
                        const match = commandText.match(regex);

                        if (match) {
                            let quantity: string | undefined = undefined;
                            let product: string | undefined = undefined;
                            let quantityIndex = alias.indexOf('{quantity}');
                            let productIndex = alias.indexOf('{product}');

                            let matchIndex = 1;
                            if (quantityIndex !== -1 && productIndex !== -1) {
                                if(quantityIndex < productIndex) {
                                    quantity = match[matchIndex++];
                                    product = match[matchIndex];
                                } else {
                                    product = match[matchIndex++];
                                    quantity = match[matchIndex];
                                }
                            } else if (quantityIndex !== -1) {
                                quantity = match[matchIndex];
                            } else if (productIndex !== -1) {
                                product = match[matchIndex];
                            }

                            if (product) {
                                await commandActionsRef.current.orderItem({ product: product.trim(), quantity: quantity?.trim() });
                                resetContext();
                                parsed = true;
                            }
                        }
                    } else {
                         if (commandText === alias) {
                            const productFromAlias = alias.replace(/add|i want|get|buy|oka|naaku/i, '').replace(/kavali/i, '').trim();
                            await commandActionsRef.current.orderItem({ product: productFromAlias });
                            resetContext();
                            parsed = true;
                        }
                    }
                }
                if(parsed) return;
            }

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
                resetContext();
                return;
            }
            
            const productAsCommandMatch = await findProductAndVariant(commandText);
            if (productAsCommandMatch.product && productAsCommandMatch.variant) {
                await commandActionsRef.current.orderItem({ product: commandText });
                resetContext();
                return;
            }
            
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
          addItemToCart(foundProduct, variant, 1);
          onOpenCart();
          
          if (!quantity) {
             itemToUpdateSkuRef.current = variant.sku;
             setIsWaitingForQuantity(true);
             speak(`Added. What quantity would you like?`);
          } else {
             const productName = t(foundProduct.name.toLowerCase().replace(/ /g, '-')).split(' / ')[0];
             speak(`Added ${variant.weight} of ${productName} to your cart.`);
          }
        } else {
          speak(`Sorry, I could not find ${product} in the store.`);
        }
      },
      quickOrder: async ({ commandText }: { commandText: string }) => {
        if (!userProfileRef.current) {
            speak("I need your profile information before placing a quick order. Please complete your profile first.");
            router.push('/dashboard/customer/my-profile');
            return;
        }

        const response: QuickOrderFlowResponse = await quickOrderFlow({ command: commandText });

        if ('error' in response) {
            speak(response.error);
        } else {
            clearCart();
            addItemToCart(response.product, response.variant, 1);
            setActiveStoreId(response.store.id);
            
            setIsWaitingForQuickOrderConfirmation(true);
            router.push('/checkout');
        }
      },
    };
    
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-IN'; // Listen in English

    recognition.onstart = () => {
      onStatusUpdate(`🎧 Listening...`);
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
      const userDocRef = doc(firestore, 'users', user.uid);
      getDoc(userDocRef).then(docSnap => {
          if (docSnap.exists()) {
              userProfileRef.current = docSnap.data() as User;
          }
      });
      
      getCommands().then((fileCommands) => {
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
                if (pathname === '/checkout') {
                  setIsWaitingForStoreName(false);
                  speak(`Okay, ordering from ${store.name}.`);
                  setActiveStoreId(store.id);
                  setTimeout(() => {
                      placeOrderBtnRef?.current?.click();
                  }, 500);
                  return;
                }

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
          if (key !== 'orderItem' && key !== 'quickOrder' && key !== 'quickOrderConfirm') {
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
  }, [firestore, user, cartItems, profileForm, isWaitingForStoreName, activeStoreId, placeOrderBtnRef, enabled, pathname, findProductAndVariant, handleProfileFormInteraction, speak, toast, router, onSuggestions, onStatusUpdate, onCloseCart, onOpenCart, setActiveStoreId, clarificationStores, isWaitingForQuantity, updateQuantity, isWaitingForQuickOrderConfirmation, clearCart, setIsWaitingForQuickOrderConfirmation, stores, masterProducts, language]);

  return null;
}

    
    
