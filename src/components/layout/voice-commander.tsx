
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

    // Function to reset all contextual state variables
    const resetAllContext = useCallback(() => {
        setIsWaitingForQuantity(false);
        itemToUpdateSkuRef.current = null;
        setIsWaitingForStoreName(false);
        setClarificationStores([]);
        onSuggestions([]);
        setIsWaitingForQuickOrderConfirmation(false);
        setIsWaitingForVoiceOrder(false);
        setIsWaitingForAddressType(false);
        hasSpokenCheckoutPrompt.current = false;
        formFieldToFillRef.current = null;
    }, [onSuggestions, setIsWaitingForQuickOrderConfirmation]);


    // Effect to reset context when the user navigates away from a page
    useEffect(() => {
        if(pathname !== '/checkout') {
          resetAllContext();
        }
    }, [pathname, resetAllContext]);


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
  }, [pathname, hasMounted, enabled, isWaitingForQuickOrderConfirmation, checkCheckoutConditions, speak, activeStoreId, cartItems.length]);

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

    const handleSmartOrder = async (command: string) => {
        let remainingCommand = command.toLowerCase();

        // 1. Find Store
        let bestStoreMatch: { store: Store, similarity: number } | null = null;
        for (const store of stores) {
            const storeNameLower = store.name.toLowerCase();
            if (remainingCommand.includes(storeNameLower)) {
                const similarity = calculateSimilarity(remainingCommand, storeNameLower);
                if (!bestStoreMatch || similarity > bestStoreMatch.similarity) {
                    bestStoreMatch = { store, similarity };
                }
            }
        }
        if (bestStoreMatch) {
            remainingCommand = remainingCommand.replace(bestStoreMatch.store.name.toLowerCase(), '').trim();
        }

        // 2. Find Destination ("to home")
        let destination: 'home' | null = null;
        const homeKeywords = ['to home', 'at home', 'home address'];
        if (homeKeywords.some(kw => remainingCommand.includes(kw))) {
            destination = 'home';
            homeKeywords.forEach(kw => {
                remainingCommand = remainingCommand.replace(kw, '');
            });
        }

        // 3. Find Product and Variant (from the remaining text)
        const { product, variant } = await findProductAndVariant(remainingCommand);

        // 4. Validate and Execute
        if (!product || !variant) {
            speak(`Sorry, I couldn't find the product in your order. Please try again.`);
            return;
        }
        if (!bestStoreMatch) {
            speak(`Sorry, I couldn't identify the store. Please mention the store name clearly.`);
            return;
        }
        if (destination === 'home' && (!userProfileRef.current || !userProfileRef.current.address)) {
            speak(`I can't deliver to home because your address isn't saved. Please update your profile.`);
            router.push('/dashboard/customer/my-profile');
            return;
        }

        // --- Optimistic UI Flow ---
        const qty = remainingCommand.match(/\d+/)?.[0] || '1';
        speak(`Okay, ordering ${qty} of ${product.name} from ${bestStoreMatch.store.name}. Taking you to checkout.`);

        clearCart();
        addItemToCart(product, variant, 1);
        setActiveStoreId(bestStoreMatch.store.id);

        // Set the address in the form *before* navigating
        if (destination === 'home' && userProfileRef.current?.address) {
            // This is tricky because the form instance is on another page.
            // We'll use a zustand store to pass this initial value.
            useCheckoutStore.getState().setHomeAddress(userProfileRef.current.address);
        } else {
             useCheckoutStore.getState().setHomeAddress(null);
        }

        setIsWaitingForQuickOrderConfirmation(true);
        router.push('/checkout');
    };

    const handleCommand = async (commandText: string) => {
      onStatusUpdate(`Processing: "${commandText}"`);
      try {
        if (!firestore || !user) return;
        
        const detectedLang = detectLanguage(commandText);
        updateRecognitionLanguage(detectedLang);
        setCurrentLanguage(detectedLang);
        
        // --- PRIORITY 1: High-priority global navigation ---
        const highPriorityCommands = ["home", "stores", "dashboard", "cart", "orders", "deliveries", "myStore", "checkout", "refresh"];
        for (const key of highPriorityCommands) {
            const cmdGroup = fileCommandsRef.current[key];
            if (!cmdGroup) continue;

            const allAliases = [t(key.toLowerCase(), 'en'), ...cmdGroup.aliases];
            for (const alias of allAliases) {
                if (calculateSimilarity(commandText.toLowerCase(), alias) > 0.9) {
                     speak(cmdGroup.reply, () => commandActionsRef.current[key]());
                     resetAllContext();
                     return;
                }
            }
        }
        
        // --- PRIORITY 2: Smart Order command (isolated check) ---
        const smartOrderAlias = (fileCommandsRef.current.smartOrder?.aliases || [])[0];
        if(smartOrderAlias) {
             const keywords = ['order', 'send', 'from', 'to'];
             const commandLower = commandText.toLowerCase();
             if (keywords.some(kw => commandLower.includes(kw)) && (commandLower.includes('from') || commandLower.includes('to'))) {
                 await handleSmartOrder(commandText);
                 resetAllContext();
                 return; // Stop further processing
             }
        }

        // --- PRIORITY 3: CONTEXTUAL REPLIES (Checkout, Forms, etc.) ---
        if (isWaitingForAddressType) {
          const cmd = commandText.toLowerCase();
          const homeKeywords = ['home', 'address', 'గృహ', 'మనె', 'घर', 'पता'];
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
          resetAllContext();
          return;
        }

        if (isWaitingForVoiceOrder) {
          await commandActionsRef.current.createVoiceOrder(commandText);
          resetAllContext();
          return;
        }

        if (isWaitingForQuickOrderConfirmation) {
          const confirmKeywords = ['confirm', 'confirm order', 'place order', 'yes', 'అవును', 'సమర్థించు', 'हाँ', 'पुष्टि'];
          if (confirmKeywords.some(keyword => commandText.toLowerCase().includes(keyword))) {
            placeOrderBtnRef?.current?.click();
            speak("Placing your order now.");
          } else {
            speak("Okay, cancelling the order.");
            clearCart();
            router.push('/stores');
          }
          resetAllContext();
          return;
        }

        if (isWaitingForQuantity && itemToUpdateSkuRef.current) {
          const numberWords: Record<string, number> = { 
            'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
            'ఒకటి': 1, 'రెండు': 2, 'మూడు': 3, 'నాలుగు': 4, 'ఐదు': 5, 'ఆరు': 6, 'ఏడు': 7, 'ఎనిమిది': 8, 'తొమ్మిది': 9, 'పది': 10,
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
          
          resetAllContext();
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
          resetAllContext();
          return;
        }

        if (formFieldToFillRef.current && profileForm) {
          profileForm.setValue(formFieldToFillRef.current, commandText, { shouldValidate: true });
          formFieldToFillRef.current = null;
          handleProfileFormInteraction();
          return;
        }
        
        // --- PRIORITY 4: General Commands & Fallbacks ---
        
        const allCommands = [...commandsRef.current];
        for (const key in fileCommandsRef.current) {
          if (key === 'smartOrder') continue; // Already handled
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
        
        let bestCommand: { command: Command, similarity: number } | null = null;

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
          resetAllContext();
        } else {
          const itemPhrases = commandText.split(/,?\s+(?:and|మరియు|और)\s+|,/);
          if (itemPhrases.length > 1 || isOrderItemCommand) {
            await commandActionsRef.current.orderItem({ phrase: commandText });
            resetAllContext();
          } else {
            const { product } = await findProductAndVariant(commandText);
            if (product) {
              await commandActionsRef.current.orderItem({ phrase: commandText });
              resetAllContext();
            } else {
              speak("Sorry, I didn't understand that. Please try again.");
              resetAllContext();
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
      orderItem: async ({ phrase }: { phrase?: string }) => {
        if (!phrase) return;
        const itemPhrases = phrase.split(/,?\s+(?:and|మరియు|और)\s+|,/);
        let addedItems: string[] = [];
        let notFoundItems: string[] = [];
        
        for (const itemPhrase of itemPhrases) {
          if (!itemPhrase.trim()) continue;
          
          const { product: foundProduct, variant } = await findProductAndVariant(itemPhrase);

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
    };

    if (firestore && user) {
        const userDocRef = doc(firestore, 'users', user.uid);
        getDoc(userDocRef).then(docSnap => {
            if (docSnap.exists()) userProfileRef.current = docSnap.data() as User;
        });
        
        getCommands().then((fileCommands) => {
            fileCommandsRef.current = fileCommands;
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
    currentRecognitionLang,
    resetAllContext
  ]);

  return null;
}
