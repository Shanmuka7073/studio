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
  action: (params?: any) => void;
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
  cartItems: CartItem[];
  voiceTrigger: number;
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
  cartItems,
  voiceTrigger
}: VoiceCommanderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const { firestore, user } = useFirebase();
  const { clearCart, addItem: addItemToCart, updateQuantity, activeStoreId, setActiveStoreId } = useCart();

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
  const [isWaitingForAddressType, setIsWaitingForAddressType] = useState(false);

  const [isWaitingForQuantity, setIsWaitingForQuantity] = useState(false);
  const itemToUpdateSkuRef = useRef<string | null>(null);

  const userProfileRef = useRef<User | null>(null);

  const [hasMounted, setHasMounted] = useState(false);

  const [speechSynthesisVoices, setSpeechSynthesisVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [currentLanguage, setCurrentLanguage] = useState('en-IN');
  const [currentRecognitionLang, setCurrentRecognitionLang] = useState('en-IN');

  // Track checkout state
  const [checkoutReady, setCheckoutReady] = useState(false);
  const addressValueRef = useRef<string>('');

  // Language detection and switching
  const detectLanguage = useCallback((text: string): string => {
    // Telugu characters range
    const teluguRegex = /[\u0C00-\u0C7F]/;
    // Hindi characters range  
    const hindiRegex = /[\u0900-\u097F]/;
    
    if (teluguRegex.test(text)) {
      return 'te-IN';
    } else if (hindiRegex.test(text)) {
      return 'hi-IN';
    } else {
      return 'en-IN';
    }
  }, []);

  // Update recognition language dynamically
  const updateRecognitionLanguage = useCallback((newLang: string) => {
    if (recognition && recognition.lang !== newLang) {
      console.log('Switching recognition language to:', newLang);
      recognition.lang = newLang;
      setCurrentRecognitionLang(newLang);
    }
  }, []);

  useEffect(() => {
    setHasMounted(true);
    if(firestore) {
      fetchInitialData(firestore);
    }
    const getVoices = () => {
      const allVoices = window.speechSynthesis.getVoices();
      if (allVoices.length > 0) {
        setSpeechSynthesisVoices(allVoices);
      }
    };

    if ('onvoiceschanged' in window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = getVoices;
    }
    getVoices();

    return () => {
      if ('onvoiceschanged' in window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, [firestore, fetchInitialData]);

  useEffect(() => {
    isEnabledRef.current = enabled;
    if (recognition) {
      if (enabled) {
        // Set initial language
        recognition.lang = currentRecognitionLang;
        try {
          recognition.start();
        } catch (e) {
          // Already started
        }
      } else {
        recognition.abort();
      }
    }
  }, [enabled, currentRecognitionLang]);

  const speak = useCallback((text: string, onEndCallback?: () => void) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      if (onEndCallback) onEndCallback();
      return;
    }

    window.speechSynthesis.cancel();
    isSpeakingRef.current = false;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.pitch = 1;
    utterance.rate = 1.1;
    
    // Detect language for speech synthesis too
    const detectedLang = detectLanguage(text);
    utterance.lang = detectedLang;

    const desiredVoice = speechSynthesisVoices.find(voice => 
      voice.lang === detectedLang && voice.localService
    );
    
    if (desiredVoice) {
      utterance.voice = desiredVoice;
    } else {
      // Fallback to any voice that supports the language
      const langVoices = speechSynthesisVoices.filter(v => 
        v.lang.startsWith(detectedLang.split('-')[0])
      );
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
      if (e.error === 'interrupted') {
        console.log('Speech was interrupted.');
      } else {
        console.error("Speech synthesis error:", e.error || 'Unknown speech error');
      }
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
  }, [detectLanguage, speechSynthesisVoices]);

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

  // Monitor checkout conditions
  const checkCheckoutConditions = useCallback(() => {
    if (pathname !== '/checkout') return false;

    const addressInput = document.querySelector('input[name="deliveryAddress"]') as HTMLInputElement;
    const currentAddress = addressInput?.value || '';
    addressValueRef.current = currentAddress;

    const hasValidAddress = currentAddress && currentAddress.length >= 10;
    const hasStore = !!activeStoreId;
    const hasCartItems = cartItems.length > 0;

    return hasValidAddress && hasStore && hasCartItems;
  }, [pathname, activeStoreId, cartItems.length]);

  // Enhanced checkout prompt function
  const runCheckoutPrompt = useCallback(() => {
    if (pathname !== '/checkout' || !hasMounted || !enabled || isSpeakingRef.current) {
      return;
    }

    // Don't speak if we're already in a confirmation state
    if (isWaitingForQuickOrderConfirmation) {
      if (!hasSpokenCheckoutPrompt.current) {
        speak(`Please say "confirm order" to place your order.`);
        hasSpokenCheckoutPrompt.current = true;
      }
      return;
    }

    // Check if all conditions are met for final step
    const isCheckoutReady = checkCheckoutConditions();
    
    if (isCheckoutReady && !hasSpokenCheckoutPrompt.current) {
      console.log('All checkout conditions met - prompting for place order');
      speak(`Everything is ready! Your order will be delivered to ${addressValueRef.current.substring(0, 30)}... Please say "place order" to confirm your order.`);
      hasSpokenCheckoutPrompt.current = true;
      setCheckoutReady(true);
      return;
    }

    // If not ready, guide through steps
    if (!hasSpokenCheckoutPrompt.current) {
      const addressInput = document.querySelector('input[name="deliveryAddress"]') as HTMLInputElement;
      const currentAddress = addressInput?.value || '';

      if (!currentAddress || currentAddress.length < 10) {
        speak("Should I deliver to your home address or current location?");
        setIsWaitingForAddressType(true);
        hasSpokenCheckoutPrompt.current = true;
        return;
      }

      if (!activeStoreId) {
        speak(`Please tell me which store should fulfill your order.`);
        setIsWaitingForStoreName(true);
        hasSpokenCheckoutPrompt.current = true;
        return;
      }

      if (cartItems.length === 0) {
        speak("Your cart is empty. Please add some items first.");
        hasSpokenCheckoutPrompt.current = true;
        return;
      }
    }
  }, [pathname, hasMounted, enabled, isSpeakingRef.current, isWaitingForQuickOrderConfirmation, checkCheckoutConditions, speak, activeStoreId, cartItems.length]);

  // Effect to monitor checkout state changes
  useEffect(() => {
    if (pathname === '/checkout') {
      const interval = setInterval(() => {
        const isReady = checkCheckoutConditions();
        if (isReady && !hasSpokenCheckoutPrompt.current && !isSpeakingRef.current) {
          console.log('Checkout conditions now met - triggering prompt');
          hasSpokenCheckoutPrompt.current = false;
          setTimeout(runCheckoutPrompt, 1000);
        }
      }, 2000);

      return () => clearInterval(interval);
    }
  }, [pathname, checkCheckoutConditions, runCheckoutPrompt]);

  // Effect to run checkout prompt on voice trigger
  useEffect(() => {
    if (pathname === '/checkout') {
      const timeout = setTimeout(() => {
        hasSpokenCheckoutPrompt.current = false;
        runCheckoutPrompt();
      }, 1000);
      return () => clearTimeout(timeout);
    }
  }, [voiceTrigger, pathname, runCheckoutPrompt]);

  // Effect to reset prompt when relevant states change
  useEffect(() => {
    if (pathname === '/checkout') {
      hasSpokenCheckoutPrompt.current = false;
      const timeout = setTimeout(runCheckoutPrompt, 500);
      return () => clearTimeout(timeout);
    }
  }, [cartItems.length, activeStoreId, pathname, runCheckoutPrompt]);

  // Proactive prompt on profile page
  useEffect(() => {
    if (pathname !== '/dashboard/customer/my-profile' || !hasMounted || !enabled) {
      hasSpokenCheckoutPrompt.current = false;
      formFieldToFillRef.current = null;
      return;
    }

    if (!hasSpokenCheckoutPrompt.current && profileForm) {
      const speakTimeout = setTimeout(() => {
        handleProfileFormInteraction();
        hasSpokenCheckoutPrompt.current = true;
      }, 1500);

      return () => clearTimeout(speakTimeout);
    }
  }, [pathname, hasMounted, enabled, profileForm, handleProfileFormInteraction]);

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

    const weightRegex = /(\d+)\s?(kg|kilo|kilos|g|gm|gram|grams)/i;
    const weightMatch = lowerPhrase.match(weightRegex);

    if (weightMatch) {
      const number = parseInt(weightMatch[1], 10);
      const unit = weightMatch[2].toLowerCase();
      
      let desiredWeightStr = `${number}${unit.startsWith('k') ? 'kg' : 'gm'}`;

      const variantMatch = priceData.variants.find(v => v.weight.replace(/\s/g, '').toLowerCase() === desiredWeightStr);
      if (variantMatch) {
        return { product: productMatch, variant: variantMatch, remainingPhrase };
      }
    }

    const defaultVariant = 
      priceData.variants.find(v => v.weight === '1kg') ||
      priceData.variants.find(v => v.weight.includes('pack')) ||
      priceData.variants.find(v => v.weight.includes('pc')) ||
      priceData.variants[0];

    return { product: productMatch, variant: defaultVariant, remainingPhrase };
  }, [firestore, masterProducts, productPrices, fetchProductPrices]);

  useEffect(() => {
    if (pathname !== '/checkout') {
      hasSpokenCheckoutPrompt.current = false;
      setCheckoutReady(false);
    }
  }, [pathname]);

  useEffect(() => {
    if (!recognition) {
      onStatusUpdate("Speech recognition not supported by this browser.");
      return;
    }

    const handleCommand = async (commandText: string) => {
      onStatusUpdate(`Processing: "${commandText}"`);
      try {
        if (!firestore || !user) return;
        
        // Detect language and update recognition
        const detectedLang = detectLanguage(commandText);
        updateRecognitionLanguage(detectedLang);
        setCurrentLanguage(detectedLang);
        
        const resetContext = () => {
          setIsWaitingForQuantity(false);
          itemToUpdateSkuRef.current = null;
          setIsWaitingForStoreName(false);
          setClarificationStores([]);
          onSuggestions([]);
          setIsWaitingForQuickOrderConfirmation(false);
          setIsWaitingForVoiceOrder(false);
          setIsWaitingForAddressType(false);
          hasSpokenCheckoutPrompt.current = false;
        };

        if (isWaitingForVoiceOrder) {
          await commandActionsRef.current.createVoiceOrder(commandText);
          resetContext();
          return;
        }

        if (isWaitingForAddressType) {
          const cmd = commandText.toLowerCase();
          // Support multiple languages for address selection
          const homeKeywords = ['home', 'address', 'గృహ', 'మనೆ', 'घर', 'पता'];
          const locationKeywords = ['current', 'location', 'ప్రస్తుత', 'స్థానం', 'वर्तमान', 'स्थान'];
          
          if (homeKeywords.some(keyword => cmd.includes(keyword))) {
            homeAddressBtnRef?.current?.click();
            speak("Setting delivery to your home address.");
            setTimeout(() => {
              hasSpokenCheckoutPrompt.current = false;
              runCheckoutPrompt();
            }, 2000);
          } else if (locationKeywords.some(keyword => cmd.includes(keyword))) {
            currentLocationBtnRef?.current?.click();
            speak("Using your current location for delivery.");
            setTimeout(() => {
              hasSpokenCheckoutPrompt.current = false;
              runCheckoutPrompt();
            }, 2000);
          } else {
            speak("Sorry, I didn't understand. Please say 'home address' or 'current location'.");
          }
          resetContext();
          return;
        }

        if (isWaitingForQuickOrderConfirmation) {
          // Support multiple languages for confirmation
          const confirmKeywords = ['confirm', 'confirm order', 'place order', 'yes', 'అవును', 'సమర్థించు', 'हाँ', 'पुष्टि'];
          if (confirmKeywords.some(keyword => commandText.toLowerCase().includes(keyword))) {
            placeOrderBtnRef?.current?.click();
            speak("Placing your order now.");
          } else {
            speak("Okay, cancelling the order.");
            clearCart();
            router.push('/stores');
          }
          resetContext();
          return;
        }

        if (isWaitingForQuantity && itemToUpdateSkuRef.current) {
          // Support numbers in multiple languages
          const numberWords: Record<string, number> = { 
            // English
            'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
            // Telugu
            'ఒకటి': 1, 'రెండు': 2, 'మూడు': 3, 'నాలుగు': 4, 'ఐదు': 5, 'ఆరు': 6, 'ఏడు': 7, 'ఎనిమిది': 8, 'తొమ్మిది': 9, 'పది': 10,
            // Hindi
            'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4, 'पांच': 5, 'छह': 6, 'सात': 7, 'आठ': 8, 'नौ': 9, 'दस': 10
          };
          
          const parts = commandText.toLowerCase().split(' ');
          let quantity: number | null = null;

          const firstWordAsNum = numberWords[parts[0]];
          if (firstWordAsNum) {
            quantity = firstWordAsNum;
          } else {
            const parsedNum = parseInt(commandText.replace(/[^0-9]/g, ''), 10);
            if (!isNaN(parsedNum)) {
              quantity = parsedNum;
            }
          }

          if (quantity !== null && quantity > 0) {
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
            speak(`Okay, ordering from ${bestMatch.name}.`);
            setActiveStoreId(bestMatch.id);
            setTimeout(() => {
              hasSpokenCheckoutPrompt.current = false;
              runCheckoutPrompt();
            }, 1000);
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
        
        // Handle "place order" command in multiple languages
        const placeOrderKeywords = ['place order', 'confirm order', 'ఆర్డర్ ఇవ్వండి', 'ఆర్డర్', 'ऑर्डर दें', 'ऑर्डर पुष्टि'];
        if (placeOrderKeywords.some(keyword => commandText.toLowerCase().includes(keyword))) {
          await commandActionsRef.current.placeOrder();
          resetContext();
          return;
        }
        
        const quickOrderAliases = fileCommandsRef.current.quickOrder?.aliases || [];
        for (const alias of quickOrderAliases) {
          const pattern = alias
            .replace(/\{(\w+)\}/g, '(.+)')
            .replace(/\\s\*/g, '\\s+');
          const regex = new RegExp(`^${pattern}$`, 'i');
          const match = commandText.match(regex);

          if (match) {
            const params: Record<string, string> = {};
            const keys = (alias.match(/\{(\w+)\}/g) || []).map(key => key.slice(1, -1));
            keys.forEach((key, index) => {
              params[key] = match[index + 1]?.trim();
            });
            
            speak(fileCommandsRef.current.quickOrder.reply, () => commandActionsRef.current.quickOrder(params));
            resetContext();
            return;
          }
        }

        let bestCommand: { command: Command, similarity: number } | null = null;
        
        const allCommands = [...commandsRef.current];
        for (const key in fileCommandsRef.current) {
          if (key === 'quickOrder') continue;

          const cmdGroup = fileCommandsRef.current[key];
          const action = commandActionsRef.current[key];
          if (action) {
            cmdGroup.aliases.forEach((alias: string) => {
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
        
        const isOrderItemCommand = fileCommandsRef.current.orderItem.aliases.some(alias => {
          const placeholderRegex = /{\w+}/g;
          const simplifiedAlias = alias.replace(placeholderRegex, '').trim();
          const simplifiedCommandText = commandText.toLowerCase().replace(/\d+\s*(kg|kilo|kilos|g|gm|gram|grams)?/i, '').trim();
          return calculateSimilarity(simplifiedCommandText, simplifiedAlias) > 0.6;
        });

        if (bestCommand && bestCommand.similarity > 0.7) {
          speak(bestCommand.command.reply, () => bestCommand!.command.action({phrase: commandText}));
          resetContext();
        } else {
          const itemPhrases = commandText.split(/,?\s+(?:and|మరియు|और)\s+|,/);
          if (itemPhrases.length > 1 || isOrderItemCommand) {
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
        }
      },
      currentLocation: () => {
        if(pathname === '/checkout' && currentLocationBtnRef?.current) {
          currentLocationBtnRef.current.click();
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
          totalAmount: 0,
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
        if (pathname === '/checkout') {
          if (placeOrderBtnRef?.current) {
            placeOrderBtnRef.current.click();
            speak("Placing your order now.");
          } else if (checkoutReady) {
            speak("I'm trying to place your order. Please check the checkout page.");
          } else {
            speak("Please complete all checkout steps first.");
          }
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
      orderItem: async ({ phrase, quantity }: { phrase?: string, quantity?: string }) => {
        if (!phrase) return;
        const itemPhrases = phrase.split(/,?\s+(?:and|మరియు|और)\s+|,/);
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
        
        clearCart();
        addItemToCart(foundProduct, variant, 1);
        setActiveStoreId(bestMatch.id);
        
        setIsWaitingForQuickOrderConfirmation(true);
        setTimeout(() => {
          router.push('/checkout');
        }, 500);
      },
    };

    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      onStatusUpdate(`Listening... (${currentRecognitionLang})`);
    };

    recognition.onresult = (event) => {
      const transcript = event.results[event.results.length - 1][0].transcript.trim();
      console.log('Recognized:', transcript, 'Language:', currentRecognitionLang);
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
                  hasSpokenCheckoutPrompt.current = false;
                  setTimeout(() => runCheckoutPrompt(), 1000);
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
  }, [
    firestore,
    user,
    cartItems,
    profileForm,
    isWaitingForStoreName,
    activeStoreId,
    placeOrderBtnRef,
    enabled,
    pathname,
    findProductAndVariant,
    handleProfileFormInteraction,
    speak,
    toast,
    router,
    onSuggestions,
    onStatusUpdate,
    onCloseCart,
    onOpenCart,
    setActiveStoreId,
    clarificationStores,
    isWaitingForQuantity,
    updateQuantity,
    isWaitingForQuickOrderConfirmation,
    clearCart,
    setIsWaitingForQuickOrderConfirmation,
    stores,
    masterProducts,
    homeAddressBtnRef,
    currentLocationBtnRef,
    hasMounted,
    voiceTrigger,
    isWaitingForVoiceOrder,
    runCheckoutPrompt,
    checkoutReady,
    detectLanguage,
    updateRecognitionLanguage,
    currentRecognitionLang
  ]);

  return null;
}