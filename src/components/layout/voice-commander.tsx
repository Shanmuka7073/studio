

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
  const { addItem: addItemToCart, activeStoreId, setActiveStoreId } = useCart();
  const { form: profileForm } = useProfileFormStore();
  const { placeOrderBtnRef } = useCheckoutStore();

  const isSpeakingRef = useRef(false);
  const isEnabledRef = useRef(enabled);
  const commandsRef = useRef<Command[]>([]);
  const storesRef = useRef<Store[]>([]);
  const masterProductsRef = useRef<Product[]>([]);
  const productPricesRef = useRef<Record<string, ProductPrice>>({});
  const commandActionsRef = useRef<Record<string, Function>>({});
  const fileCommandsRef = useRef<any>({});
  
  const formFieldToFillRef = useRef<keyof ProfileFormValues | null>(null);
  const [isWaitingForStoreName, setIsWaitingForStoreName] = useState(false);
  const hasSpokenCheckoutPrompt = useRef(false);

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
      // The main `onend` handler for recognition will restart it
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
    // Reset the flag when navigating away from checkout
    if (pathname !== '/checkout') {
      hasSpokenCheckoutPrompt.current = false;
      return;
    }

    // Only speak once per page visit and if voice is enabled
    if (enabled && !hasSpokenCheckoutPrompt.current) {
      // Use a timeout to ensure the DOM is ready for querying
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
        hasSpokenCheckoutPrompt.current = true; // Mark as spoken
      }, 1500); // 1.5-second delay

      return () => clearTimeout(speakTimeout);
    }
  }, [pathname, enabled, speak]);


  const findProductAndVariant = useCallback(async (productName: string, desiredWeight?: string): Promise<{ product: Product | null, variant: ProductVariant | null, storeId: string | null }> => {
    if (!activeStoreId) {
        speak("Please go to a specific store's page before adding items to your cart.");
        router.push('/stores');
        return { product: null, variant: null, storeId: null };
    }
    
    const lowerProductName = productName.toLowerCase();
    const productMatch = masterProductsRef.current.find(p => p.name.toLowerCase() === lowerProductName);

    if (!productMatch) return { product: null, variant: null, storeId: null };
    
    const finalProduct = { ...productMatch }; 

    let priceData = productPricesRef.current[lowerProductName];
    if (!priceData && firestore) {
        priceData = await getProductPrice(firestore, lowerProductName);
        if (priceData) {
            productPricesRef.current[lowerProductName] = priceData;
        }
    }
    
    if (priceData?.variants?.length > 0) {
        if (desiredWeight) {
            const lowerDesiredWeight = desiredWeight.replace(/\s/g, '').toLowerCase();
            const variantMatch = priceData.variants.find(v => v.weight.replace(/\s/g, '').toLowerCase() === lowerDesiredWeight);
            if (variantMatch) return { product: finalProduct, variant: variantMatch, storeId: activeStoreId };
        }
        
        if (!desiredWeight || desiredWeight === 'one') {
          const onePieceVariant = priceData.variants.find(v => v.weight.replace(/\s/g, '').toLowerCase() === '1pc');
          if (onePieceVariant) return { product: finalProduct, variant: onePieceVariant, storeId: activeStoreId };

           const firstVariant = priceData.variants.sort((a,b) => a.price - b.price)[0];
           if (firstVariant) return { product: finalProduct, variant: firstVariant, storeId: activeStoreId };
        }

        return { product: finalProduct, variant: priceData.variants[0], storeId: activeStoreId };
    }
    
    return { product: null, variant: null, storeId: null };
  }, [activeStoreId, firestore, router, speak]);


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
    
    const handleCommand = async (command: string) => {
        onStatusUpdate(`Processing: "${command}"`);
        try {
            if (!firestore || !user) return;

            if (isWaitingForStoreName) {
                const spokenStoreName = command.toLowerCase();
                const bestMatch = storesRef.current
                    .map(store => ({ ...store, similarity: calculateSimilarity(spokenStoreName, store.name.toLowerCase()) }))
                    .sort((a, b) => b.similarity - a.similarity)[0];

                if (bestMatch && bestMatch.similarity > 0.7) {
                    setIsWaitingForStoreName(false);
                    speak(`Okay, ordering from ${bestMatch.name}.`);
                    setActiveStoreId(bestMatch.id);
                    // Use a short delay to allow React state to update before clicking
                    setTimeout(() => {
                        placeOrderBtnRef?.current?.click();
                    }, 500);
                } else {
                    speak(`Sorry, I couldn't find a store named ${command}. Please try again.`);
                }
                return;
            }

            if (formFieldToFillRef.current && profileForm) {
                profileForm.setValue(formFieldToFillRef.current, command, { shouldValidate: true });
                formFieldToFillRef.current = null;
                handleProfileFormInteraction();
                return;
            }
            
            const orderItemTemplate = fileCommandsRef.current.orderItem;
            if (orderItemTemplate) {
                for (const alias of orderItemTemplate.aliases) {
                    const pattern = alias.replace(/{quantity}/g, '(.+)').replace(/{product}/g, '(.+)');
                    const regex = new RegExp(`^${pattern}$`, 'i');
                    const match = command.match(regex);
                    
                    if (match) {
                        const quantity = match[1]?.trim();
                        const product = match[2]?.trim();

                        if(product) {
                           commandActionsRef.current.orderItem({ product, quantity });
                           onSuggestions([]);
                           return; 
                        }
                    }
                }
            }

            const perfectMatch = commandsRef.current.find((c) => command === c.command);
            if (perfectMatch) {
                speak(perfectMatch.reply);
                perfectMatch.action();
                onSuggestions([]);
                return;
            }
            
            const potentialMatches = commandsRef.current
              .map((c) => ({ ...c, similarity: calculateSimilarity(command, c.command) }))
              .filter((c) => c.similarity > 0.7)
              .sort((a, b) => b.similarity - a.similarity)
              .filter((value, index, self) => self.findIndex((v) => v.display === value.display) === index)
              .slice(0, 3);
      
            if (potentialMatches.length > 0) {
              speak("I'm not sure. Did you mean one of these?");
              onSuggestions(potentialMatches);
            } else {
              speak(`Sorry, I don't recognize the command "${command}".`);
              toast({
                  variant: 'destructive',
                  title: 'Command Not Recognized',
                  description: `I heard "${command}", but I don't know what to do.`,
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
          speak(`Added ${variant.weight} of ${product} to your cart.`);
          onOpenCart();
        } else {
            // The findProductAndVariant function will speak the error message
        }
      },
    };

    recognition.continuous = false; // Set to false to allow onend to fire reliably
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
      // Ensure we only restart listening if the feature is still enabled by the user
      // and we are not currently trying to speak.
      if (isEnabledRef.current && !isSpeakingRef.current) {
        setTimeout(() => {
          try {
            recognition?.start();
          } catch (e) {
            // This can happen if start() is called while it's already starting.
            // console.error('Could not restart recognition service: ', e);
          }
        }, 250); // Add a short delay before restarting
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
            const coreName = store.name.toLowerCase().replace(/shop|store|kirana/g, '').trim();
            const variations = [...new Set([
              store.name.toLowerCase(), coreName, `go to ${store.name.toLowerCase()}`, `open ${store.name.toLowerCase()}`,
              `visit ${store.name.toLowerCase()}`, `show ${store.name.toLowerCase()}`
            ])];
            variations.forEach(variation => {
              builtCommands.push({
                command: variation,
                display: `Go to ${store.name}`,
                action: () => {
                  setActiveStoreId(store.id);
                  router.push(`/stores/${store.id}`);
                },
                reply: `Navigating to ${store.name}.`
              });
            });
          });

          Object.entries(fileCommands).forEach(([key, { display, aliases, reply }]: [string, any]) => {
            if (key !== 'orderItem') { // Exclude template item orders
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
        recognition.onend = null; // Prevent restart on component unmount
        recognition.abort();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firestore, user, cartItems, profileForm, isWaitingForStoreName, activeStoreId, placeOrderBtnRef, enabled, pathname]);

  return null;
}
