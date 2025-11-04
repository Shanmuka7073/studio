
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { useFirebase, errorEmitter } from '@/firebase';
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
  const { stores, masterProducts, productPrices, fetchInitialData, fetchProductPrices } = useAppStore();

  const { form: profileForm } = useProfileFormStore();
  const { placeOrderBtnRef, setIsWaitingForQuickOrderConfirmation, isWaitingForQuickOrderConfirmation, homeAddressBtnRef, currentLocationBtnRef } = useCheckoutStore();

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
  const [isWaitingForAddressType, setIsWaitingForAddressType] = useState(false);

  const [isWaitingForQuantity, setIsWaitingForQuantity] = useState(false);
  const itemToUpdateSkuRef = useRef<string | null>(null);

  const userProfileRef = useRef<User | null>(null);

  const [hasMounted, setHasMounted] = useState(false);
  
  const [speechSynthesisVoices, setSpeechSynthesisVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [currentLanguage, setCurrentLanguage] = useState('en-IN');


  useEffect(() => {
    setHasMounted(true);
    if(firestore) {
      fetchInitialData(firestore);
    }
    // Populate voices
    const getVoices = () => {
        const allVoices = window.speechSynthesis.getVoices();
        if (allVoices.length > 0) {
            setSpeechSynthesisVoices(allVoices);
        }
    };
    
    // Voices may load asynchronously.
    if ('onvoiceschanged' in window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = getVoices;
    }
    getVoices(); // Also call it directly in case they are already loaded.

    return () => {
      if ('onvoiceschanged' in window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    }
  }, [firestore, fetchInitialData]);
  
  useEffect(() => {
    isEnabledRef.current = enabled;
    if (recognition) {
      if (enabled) {
        recognition.lang = currentLanguage;
        try {
          recognition.start();
        } catch (e) {
            // Already started
        }
      } else {
        recognition.abort();
      }
    }
  }, [enabled, currentLanguage]);

  const speak = useCallback((text: string, onEndCallback?: () => void) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
        if (onEndCallback) onEndCallback();
        return;
    }

    // Cancel any ongoing speech first
    window.speechSynthesis.cancel();
    isSpeakingRef.current = false;
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.pitch = 1;
    utterance.rate = 1.1;
    utterance.lang = currentLanguage;

    const desiredVoice = speechSynthesisVoices.find(voice => voice.lang === currentLanguage && voice.localService);
    if (desiredVoice) {
        utterance.voice = desiredVoice;
    } else {
        // Fallback to a generic voice for the language if a specific one isn't found
        const langVoices = speechSynthesisVoices.filter(v => v.lang.startsWith(currentLanguage.split('-')[0]));
        if (langVoices.length > 0) {
            utterance.voice = langVoices[0];
        }
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
        console.error("Speech synthesis error:", e.error || 'Unknown speech error');
        isSpeakingRef.current = false;
        if (onEndCallback) onEndCallback();
         if (isEnabledRef.current) {
            try {
                recognition?.start();
            } catch(e) {}
        }
    };
    
    isSpeakingRef.current = true;
    recognition?.stop();
    window.speechSynthesis.speak(utterance);

  }, [currentLanguage, speechSynthesisVoices]);

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
      setIsWaitingForAddressType(false);
      return;
    }
  
    if (enabled && !hasSpokenCheckoutPrompt.current) {
      const speakTimeout = setTimeout(() => {
        const addressValue = (document.querySelector('input[name="deliveryAddress"]') as HTMLInputElement)?.value;
        const storeActionAlert = document.getElementById('action-required-alert');
  
        if (isWaitingForQuickOrderConfirmation) {
          const totalAmountEl = document.getElementById('final-total-amount');
          if (totalAmountEl) {
            const totalText = totalAmountEl.innerText;
            speak(`Your total is ${totalText}. Please say "confirm order" to place your order.`);
          }
        } else if (!addressValue) {
          speak("Should I deliver to your home address or current location?");
          setIsWaitingForAddressType(true);
        } else if (!activeStoreId && storeActionAlert) {
          speak(`Action required. Please select a store to continue, or tell me the store name.`);
          setIsWaitingForStoreName(true);
        } else if (activeStoreId && addressValue) {
          const totalAmountEl = document.getElementById('final-total-amount');
          if (totalAmountEl) {
            const totalText = totalAmountEl.innerText;
            speak(`Your total is ${totalText}. Please say "place order" to confirm.`);
          }
        }
        hasSpokenCheckoutPrompt.current = true;
      }, 1500);
  
      return () => clearTimeout(speakTimeout);
    }
  }, [pathname, enabled, speak, hasMounted, isWaitingForQuickOrderConfirmation, activeStoreId]);

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


  const findProductAndVariant = useCallback(async (phrase: string): Promise<{ product: Product | null, variant: ProductVariant | null, remainingPhrase: string }> => {
    const lowerPhrase = phrase.toLowerCase();
    
    let bestMatch: { product: Product, alias: string, similarity: number } | null = null;

    for (const p of masterProducts) {
        if (!p.name) continue;
        const aliasesToCheck = [p.name.toLowerCase(), ...Object.values(getAllAliases(p.name.toLowerCase().replace(/ /g, '-'))).flat().map(name => name.toLowerCase())];
        const uniqueAliases = [...new Set(aliasesToCheck)];

        for (const alias of uniqueAliases) {
             if (lowerPhrase.includes(alias)) {
                const similarity = calculateSimilarity(lowerPhrase, alias);
                if (!bestMatch || similarity > bestMatch.similarity) {
                    bestMatch = { product: p, alias: alias, similarity: similarity };
                }
            }
        }
    }

    if (!bestMatch) return { product: null, variant: null, remainingPhrase: phrase };

    const productMatch = bestMatch.product;
    const remainingPhrase = lowerPhrase.replace(bestMatch.alias, '').trim();

    let priceData = productPrices[productMatch.name.toLowerCase()];
    if (priceData === undefined && firestore) {
        await fetchProductPrices(firestore, [productMatch.name]);
        priceData = useAppStore.getState().productPrices[productMatch.name.toLowerCase()];
    }

    if (!priceData || !priceData.variants || priceData.variants.length === 0) {
        return { product: productMatch, variant: null, remainingPhrase: phrase };
    }
    
    // Look for a specific weight in the phrase
    const weightRegex = /(\d+)\s?(kg|kilo|kilos|g|gm|gram|grams)/i;
    const weightMatch = lowerPhrase.match(weightRegex);

    if (weightMatch) {
        const number = parseInt(weightMatch[1], 10);
        const unit = weightMatch[2].toLowerCase();
        
        let desiredWeightStr = `${number}${unit.startsWith('k') ? 'kg' : 'gm'}`;

        // Find the specific variant that matches the weight
        const variantMatch = priceData.variants.find(v => v.weight.replace(/\s/g, '').toLowerCase() === desiredWeightStr);
        if (variantMatch) {
            return { product: productMatch, variant: variantMatch, remainingPhrase };
        }
    }
    
    // If no weight is mentioned or matched, apply a smarter default
    const defaultVariant = 
        priceData.variants.find(v => v.weight === '1kg') ||
        priceData.variants.find(v => v.weight.includes('pack')) ||
        priceData.variants.find(v => v.weight.includes('pc')) ||
        priceData.variants[0]; // Fallback to the first variant

    return { product: productMatch, variant: defaultVariant, remainingPhrase };

  }, [firestore, masterProducts, productPrices, fetchProductPrices]);


  useEffect(() => {
    if (!recognition) {
        onStatusUpdate("Speech recognition not supported by this browser.");
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
                setIsWaitingForAddressType(false);
            };

            let detectedLang = 'en';
            if (/[అ-హ]/.test(commandText)) detectedLang = 'te';
            const langCode = `${detectedLang}-IN`;
            if (currentLanguage !== langCode) {
              setCurrentLanguage(langCode);
            }

            if (isWaitingForVoiceOrder) {
              await commandActionsRef.current.createVoiceOrder(commandText);
              resetContext();
              return;
            }

            if (isWaitingForAddressType) {
              const cmd = commandText.toLowerCase();
              if (cmd.includes('home') || cmd.includes('address')) {
                homeAddressBtnRef?.current?.click();
              } else if (cmd.includes('current') || cmd.includes('location')) {
                currentLocationBtnRef?.current?.click();
              } else {
                speak("Sorry, I didn't understand. Please say 'home address' or 'current location'.");
              }
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
                } else {
                    speak(`Sorry, I couldn't find a store named ${commandText}. Please try again.`);
                }
                hasSpokenCheckoutPrompt.current = false; // Allow re-prompting for the next step
                return;
            }

            if (formFieldToFillRef.current && profileForm) {
                profileForm.setValue(formFieldToFillRef.current, commandText, { shouldValidate: true });
                formFieldToFillRef.current = null;
                handleProfileFormInteraction();
                return;
            }
            
            let bestCommand: { command: Command, similarity: number } | null = null;
            
            // Combine file commands and dynamic commands
            const allCommands = [...commandsRef.current];
            for (const key in fileCommandsRef.current) {
              const cmdGroup = fileCommandsRef.current[key];
              const action = commandActionsRef.current[key];
              if (action) {
                cmdGroup.aliases.forEach(alias => {
                  allCommands.push({
                    command: alias,
                    action: action,
                    display: cmdGroup.display,
                    reply: cmdGroup.reply
                  });
                });
              }
            }


            for (const cmd of allCommands) {
                const similarity = calculateSimilarity(commandText.toLowerCase(), cmd.command);
                if (!bestCommand || similarity > bestCommand.similarity) {
                    bestCommand = { command: cmd, similarity };
                }
            }

            if (bestCommand && bestCommand.similarity > 0.7) {
                speak(bestCommand.command.reply, () => bestCommand.command.action());
                resetContext();
            } else {
                const itemPhrases = commandText.split(/,?\s+(?:and|మరియు)\s+|,/);
                 if (itemPhrases.length > 1) {
                     await commandActionsRef.current.orderItem({ phrase: commandText });
                     resetContext();
                 } else {
                    const { product } = await findProductAndVariant(commandText);
                     if (product) {
                        await commandActionsRef.current.orderItem({ phrase: commandText });
                        resetContext();
                     } else {
                        speak("Sorry, I didn't understand that. Please try again.");
                        resetContext();
                     }
                 }
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
      homeAddress: () => {
        if(pathname === '/checkout' && homeAddressBtnRef?.current) {
          homeAddressBtnRef.current.click();
          hasSpokenCheckoutPrompt.current = false; // Allow re-prompting
        }
      },
      currentLocation: () => {
        if(pathname === '/checkout' && currentLocationBtnRef?.current) {
          currentLocationBtnRef.current.click();
          hasSpokenCheckoutPrompt.current = false; // Allow re-prompting
        }
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
      orderItem: async ({ phrase, quantity }: { phrase: string, quantity?: string }) => {
          const itemPhrases = phrase.split(/,?\s+(?:and|మరియు)\s+|,/);
          let addedItems: string[] = [];
          let notFoundItems: string[] = [];
          
          for (const itemPhrase of itemPhrases) {
              if (!itemPhrase.trim()) continue;
              
              const combinedPhrase = quantity ? `${quantity} ${itemPhrase}` : itemPhrase;
              const { product: foundProduct, variant } = await findProductAndVariant(combinedPhrase);

              if (foundProduct && variant) {
                  addItemToCart(foundProduct, variant, 1);
                  const productName = t(foundProduct.name.toLowerCase().replace(/ /g, '-')).split(' / ')[0];
                  addedItems.push(productName);
              } else if (foundProduct) {
                  notFoundItems.push(`${itemPhrase} (variant not found)`);
              } else {
                  notFoundItems.push(itemPhrase);
              }
          }
          
          if (addedItems.length > 0) {
              speak(`Okay, I've added ${addedItems.join(', ')} to your cart.`);
              onOpenCart();
          } 
          
          if (notFoundItems.length > 0 && addedItems.length === 0) {
               speak(`Sorry, I couldn't find ${notFoundItems.join(', ')}.`);
          } else if (notFoundItems.length > 0) {
              speak(`I added some items, but couldn't find ${notFoundItems.join(', ')}.`);
          }
        },
      quickOrder: async ({ product, quantity, store: storeName }: { product: string, quantity?: string, store?: string }) => {
        if (!storeName) {
            speak("You need to specify a store for a quick order. For example, say 'order 1kg potatoes from Fresh Produce'.");
            return;
        }
        
        const combinedPhrase = quantity ? `${quantity} ${product}` : product;
        const { product: foundProduct, variant } = await findProductAndVariant(combinedPhrase);
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
      if (event.error !== 'aborted' && event.error !== 'no-speech' && event.error !== 'not-allowed') {
        console.error('Speech recognition error', event.error);
        onStatusUpdate(`⚠️ Error: ${event.error}`);
      }
    };
    
    recognition.onend = () => {
      if (isEnabledRef.current && !isSpeakingRef.current) {
        // Use a small delay to prevent rapid, sequential restarts that can cause 'not-allowed' errors
        setTimeout(() => {
          if(isEnabledRef.current && !isSpeakingRef.current) {
            try {
              recognition?.start();
            } catch (e) {
              console.warn("Recognition restart failed, possibly due to rapid succession.", e);
            }
          }
        }, 250);
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
                  hasSpokenCheckoutPrompt.current = false; // Re-prompt for next step
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
  }, [firestore, user, cartItems, profileForm, isWaitingForStoreName, activeStoreId, placeOrderBtnRef, enabled, pathname, findProductAndVariant, handleProfileFormInteraction, speak, toast, router, onSuggestions, onStatusUpdate, onCloseCart, onOpenCart, setActiveStoreId, clarificationStores, isWaitingForQuantity, updateQuantity, isWaitingForQuickOrderConfirmation, clearCart, setIsWaitingForQuickOrderConfirmation, stores, masterProducts, homeAddressBtnRef, currentLocationBtnRef]);

  return null;
}

    