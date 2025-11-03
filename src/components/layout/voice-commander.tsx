

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
import { doc, getDoc, serverTimestamp, addDoc, collection } from 'firebase/firestore';

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
  const { stores, masterProducts, productPrices, fetchInitialData, fetchProductPrices, language, setLanguage } = useAppStore();

  const { form: profileForm } = useProfileFormStore();
  const { placeOrderBtnRef, setIsWaitingForQuickOrderConfirmation, isWaitingForQuickOrderConfirmation } = useCheckoutStore();

  const isSpeakingRef = useRef(false);
  const isEnabledRef = useRef(enabled);
  const commandsRef = useRef<Command[]>([]);
  const commandActionsRef = useRef<any>({});
  const fileCommandsRef = useRef<any>({});
  
  const formFieldToFillRef = useRef<keyof ProfileFormValues | null>(null);
  const [isWaitingForStoreName, setIsWaitingForStoreName] = useState(false);
  const [isWaitingForVoiceOrder, setIsWaitingForVoiceOrder] = useState(false);
  const [clarificationStores, setClarificationStores] = useState<Store[]>([]);
  const hasSpokenCheckoutPrompt = useRef(false);
  const hasSpokenProfilePrompt = useRef(false);

  const [isWaitingForQuantity, setIsWaitingForQuantity] = useState(false);
  const itemToUpdateSkuRef = useRef<string | null>(null);

  const userProfileRef = useRef<User | null>(null);

  const [hasMounted, setHasMounted] = useState(false);
  
  const [speechSynthesisVoices, setSpeechSynthesisVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    setHasMounted(true);
    if(firestore) {
      fetchInitialData(firestore);
    }
    // Populate voices
    const getVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        setSpeechSynthesisVoices(voices);
      }
    };
    getVoices();
    // Voices are loaded asynchronously, so we might need this event listener.
    window.speechSynthesis.onvoiceschanged = getVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
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

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.pitch = 1;
    utterance.rate = 1.1;

    // --- Safer Voice Selection ---
    // Find a voice that matches the language. Fallback to the first available voice.
    const desiredVoice = speechSynthesisVoices.find(voice => voice.lang === language);
    if (desiredVoice) {
        utterance.voice = desiredVoice;
    } else {
        // If no specific voice, just set the lang property. The browser will use its default.
        utterance.lang = language;
    }

    utterance.onend = () => {
        isSpeakingRef.current = false;
        if (onEndCallback) onEndCallback();
        if (isEnabledRef.current) {
            try {
                recognition?.start();
            } catch(e) {
                // ignore if already started
            }
        }
    };

    utterance.onerror = (e) => {
        console.error("Speech synthesis error:", e);
        isSpeakingRef.current = false;
        if (onEndCallback) onEndCallback();
    };

    // --- Safer Speaking Logic ---
    const speakNow = () => {
        // Cancel any ongoing speech before starting a new one.
        window.speechSynthesis.cancel();
        isSpeakingRef.current = true;
        recognition?.stop();
        window.speechSynthesis.speak(utterance);
    };

    // If the speech synthesis engine is already speaking, wait a tiny bit.
    if (window.speechSynthesis.speaking) {
        setTimeout(speakNow, 100);
    } else {
        speakNow();
    }
  }, [language, speechSynthesisVoices]);

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
    
    let bestMatch: { product: Product, alias: string, similarity: number } | null = null;

    for (const p of masterProducts) {
        if (!p.name) continue;
        
        // --- FIX: Include the product's own name in the list of aliases to check ---
        const aliasesToCheck = [p.name.toLowerCase()];
        const allAliasValues = Object.values(getAllAliases(p.name.toLowerCase().replace(/ /g, '-'))).flat().map(name => name.toLowerCase());
        aliasesToCheck.push(...allAliasValues);
        
        const uniqueAliases = [...new Set(aliasesToCheck)];

        for (const alias of uniqueAliases) {
             if (lowerProductName.includes(alias) || alias.includes(lowerProductName)) {
                const similarity = calculateSimilarity(lowerProductName, alias);
                if (!bestMatch || similarity > bestMatch.similarity) {
                    bestMatch = { product: p, alias: alias, similarity: similarity };
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
        onStatusUpdate("Listening...");
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
                setIsWaitingForVoiceOrder(false);
            };

            // --- Language Detection ---
            let detectedLang = 'en';
            if (/[అ-హ]/.test(commandText)) detectedLang = 'te';
            else if (/[क-ह]/.test(commandText)) detectedLang = 'hi';
            
            if (detectedLang !== language.split('-')[0]) {
              setLanguage(`${detectedLang}-IN`);
            }

            if (isWaitingForVoiceOrder) {
              await commandActionsRef.current.createVoiceOrder(commandText);
              resetContext();
              return;
            }

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
            
            // --- PASS 1: Exact match on general commands ---
             for (const key in fileCommandsRef.current) {
                const commandGroup = fileCommandsRef.current[key];
                
                const allLangAliases = (commandGroup.aliases || []).map(a => a.toLowerCase());
                
                if (allLangAliases.includes(commandText.toLowerCase())) {
                    const action = commandActionsRef.current[key];
                    if (typeof action === 'function') {
                        const reply = commandGroup.reply || `Executing ${key}`;
                        speak(reply);
                        action();
                        resetContext();
                        return;
                    }
                }
            }
            
            // --- PASS 2: Template-based commands ---
            const templates = [
              { key: 'quickOrder', template: fileCommandsRef.current.quickOrder },
              { key: 'orderItem', template: fileCommandsRef.current.orderItem },
            ];
            for (const { key, template } of templates) {
                if (template) {
                    for (const alias of template.aliases) {
                        const aliasParts = alias.split(/(\{product\}|\{quantity\}|\{store\})/g).filter(Boolean);
                        const isTemplate = aliasParts.some(p => p.startsWith('{') && p.endsWith('}'));
                        if (isTemplate) {
                            const regexString = alias.replace(/\{quantity\}/g, '(.*?)').replace(/\{product\}/g, '(.*?)').replace(/\{store\}/g, '(.*)');
                            const regex = new RegExp(`^${regexString}$`, 'i');
                            const match = commandText.match(regex);
                            if (match) {
                                const extracted: Record<string, string | undefined> = {};
                                let matchIndex = 1;
                                for (const part of aliasParts) {
                                    if (part === '{quantity}') extracted.quantity = match[matchIndex++]?.trim();
                                    else if (part === '{product}') extracted.product = match[matchIndex++]?.trim();
                                    else if (part === '{store}') extracted.store = match[matchIndex++]?.trim();
                                }
                                if (extracted.product) {
                                    await commandActionsRef.current[key](extracted);
                                    resetContext();
                                    return; // Command handled
                                }
                            }
                        }
                    }
                }
            }

            // --- PASS 3 (Fallback): Assume the whole command is a product ---
            const productAsCommandMatch = await findProductAndVariant(commandText);
            if (productAsCommandMatch.product && productAsCommandMatch.variant) {
                await commandActionsRef.current.orderItem({ product: commandText });
                resetContext();
                return;
            }
            
            // If we're here, no match was found.
            speak(`Sorry, I could not find ${commandText} in the store.`);
            onSuggestions([]);

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
      recordOrder: () => {
        speak("I'm ready. Please list the items you need for your order.");
        setIsWaitingForVoiceOrder(true);
      },
      createVoiceOrder: async (list: string) => {
        if (!firestore || !user || !userProfileRef.current) {
          speak("I can't create an order without your user profile information.");
          return;
        }

        const voiceOrderData = {
          userId: user.uid,
          orderDate: serverTimestamp(),
          status: 'Pending' as 'Pending',
          deliveryAddress: userProfileRef.current.address,
          translatedList: list,
          customerName: `${userProfileRef.current.firstName} ${userProfileRef.current.lastName}`,
          phone: userProfileRef.current.phoneNumber,
          email: user.email,
          totalAmount: 0, // Store owner will fill this in
          items: [],
        };
        
        try {
          const colRef = collection(firestore, 'orders');
          await addDoc(colRef, voiceOrderData);
          speak("I've sent your list to the local stores. You'll be notified when a store accepts your order.");
          router.push('/dashboard/customer/my-orders');
        } catch (e) {
          console.error("Error creating voice order:", e);
          speak("Sorry, I failed to create your voice order. Please try again.");
          const permissionError = new FirestorePermissionError({
            path: 'orders',
            operation: 'create',
            requestResourceData: voiceOrderData,
          });
          errorEmitter.emit('permission-error', permissionError);
        }
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
      quickOrder: async ({ product, quantity, store: storeName }: { product: string, quantity?: string, store?: string }) => {
        if (!storeName) {
            speak("You need to specify a store for a quick order. For example, say 'order 1kg potatoes from Fresh Produce'.");
            return;
        }

        const { product: foundProduct, variant } = await findProductAndVariant(product, quantity);
        if (!foundProduct || !variant) {
            speak(`Sorry, I could not find ${product}.`);
            return;
        }
        
        const spokenStoreName = storeName.toLowerCase();
        const bestMatch = stores
            .map(s => ({ ...s, similarity: calculateSimilarity(spokenStoreName, s.name.toLowerCase()) }))
            .sort((a, b) => b.similarity - a.similarity)[0];

        if (!bestMatch || bestMatch.similarity < 0.7) {
            speak(`Sorry, I couldn't find a store named ${storeName}. Please try again.`);
            return;
        }

        const qty = quantity || '1';
        speak(`Okay, starting a quick order for ${qty} of ${product} from ${bestMatch.name}.`);
        
        // Perform actions
        clearCart();
        addItemToCart(foundProduct, variant, 1);
        setActiveStoreId(bestMatch.id);
        
        setIsWaitingForQuickOrderConfirmation(true);
        // Wait a moment for state to update, then navigate
        setTimeout(() => {
            router.push('/checkout');
        }, 500);

        // After another delay, click the final button
        setTimeout(() => {
            if (placeOrderBtnRef?.current) {
                placeOrderBtnRef.current.click();
            }
        }, 3000); // 3-second delay to allow checkout page to load
      },
    };
    
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      onStatusUpdate(`Listening...`);
    };

    recognition.onresult = (event) => {
        const transcript = event.results[event.results.length - 1][0].transcript.trim();
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
  }, [firestore, user, cartItems, profileForm, isWaitingForStoreName, activeStoreId, placeOrderBtnRef, enabled, pathname, findProductAndVariant, handleProfileFormInteraction, speak, toast, router, onSuggestions, onStatusUpdate, onCloseCart, onOpenCart, setActiveStoreId, clarificationStores, isWaitingForQuantity, updateQuantity, isWaitingForQuickOrderConfirmation, clearCart, setIsWaitingForQuickOrderConfirmation, stores, masterProducts, language, isWaitingForVoiceOrder, setLanguage]);

  return null;
}
