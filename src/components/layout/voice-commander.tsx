
'use client';

import { useEffect, useRef, useState, useCallback, RefObject } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { useFirebase, addDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import { getStores, getMasterProducts, getProductPrice } from '@/lib/data';
import type { Store, Product, ProductPrice, ProductVariant } from '@/lib/types';
import { calculateSimilarity } from '@/lib/calculate-similarity';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { VoiceOrderInfo } from '@/components/voice-order-dialog';
import { useCart } from '@/lib/cart';
import { getCommands } from '@/app/actions';
import { generateMonthlyPackage } from '@/ai/flows/monthly-package-flow';
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
  onVoiceOrder: (orderInfo: VoiceOrderInfo) => void;
  onOpenCart: () => void;
  onCloseCart: () => void; // New prop to close the cart
  isCartOpen: boolean;
}

type ParsedShoppingListItem = {
    quantity: number;
    unit: string;
    itemName: string;
};

// This function now lives here to be used by the voice commander
async function parseShoppingList(text: string): Promise<ParsedShoppingListItem[]> {
    const items: ParsedShoppingListItem[] = [];
    // Updated pattern to be more flexible with units
    const pattern = /(\d+)\s*(kg|g|grams|kilogram|kilo|pc|piece|pieces)?\s*([a-zA-Z\s]+)/gi;
    let match;

    while ((match = pattern.exec(text)) !== null) {
        const quantity = parseInt(match[1], 10);
        let unit = match[2] ? match[2].toLowerCase() : 'pc'; // Default to 'piece' if no unit
        if (unit === 'grams') unit = 'g';
        if (unit === 'kilogram' || unit === 'kilo') unit = 'kg';
        if (unit === 'piece' || unit === 'pieces') unit = 'pc';

        const itemName = match[3].trim().toLowerCase();

        items.push({ quantity, unit, itemName });
    }
    return items;
}

export function VoiceCommander({ enabled, onStatusUpdate, onSuggestions, onVoiceOrder, onOpenCart, onCloseCart, isCartOpen }: VoiceCommanderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const { firestore, user } = useFirebase();
  const [allStores, setAllStores] = useState<Store[]>([]);
  const [allCommands, setAllCommands] = useState<Command[]>([]);
  const [masterProductList, setMasterProductList] = useState<Product[]>([]);
  const [myStore, setMyStore] = useState<Store | null>(null);
  const { addItem: addItemToCart } = useCart();
  
  const listeningRef = useRef(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isSpeakingRef = useRef(false);

  // For profile form filling
  const { form: profileForm } = useProfileFormStore();
  const formFieldToFill = useRef<keyof ProfileFormValues | null>(null);
  
  const { shouldPromptForLocation, handleGetLocation, getFinalTotal, placeOrderBtnRef } = useCheckoutStore();
  const checkoutState = useRef<'idle' | 'promptingLocation' | 'promptingConfirmation'>('idle');


 const speak = useCallback((text: string, onEndCallback?: () => void) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      if (onEndCallback) onEndCallback();
      return;
    }
    
    // If it's already speaking, cancel the previous one to speak the new text.
    if (isSpeakingRef.current) {
        window.speechSynthesis.cancel();
    }
    isSpeakingRef.current = true;
    
    // Stop listening while speaking
    if (recognitionRef.current && listeningRef.current) {
        try {
            recognitionRef.current.stop();
        } catch (e) {
            console.warn("Recognition stop error:", e);
        }
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.pitch = 1;
    utterance.rate = 1.1;
    utterance.lang = 'en-US';

    utterance.onend = () => {
        isSpeakingRef.current = false;
        // The main onend handler of the recognition service will restart it.
        if (onEndCallback) {
            onEndCallback();
        }
    };
    
    utterance.onerror = (e) => {
        isSpeakingRef.current = false;
        console.error("Speech synthesis error:", e);
        if (onEndCallback) onEndCallback();
    }

    window.speechSynthesis.speak(utterance);
}, []);

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
        formFieldToFill.current = firstEmptyField.name;
        speak(`What is your ${firstEmptyField.label}?`);
    } else {
        formFieldToFill.current = null;
        speak("Your profile looks complete! You can say 'save changes' to submit.");
    }
  }, [profileForm, speak]);

    const findProductAndVariant = useCallback(async (parsedItem: {name: string, quantity: string}): Promise<{ product: Product | null, variant: ProductVariant | null }> => {
        if (!firestore) return { product: null, variant: null };
        
        // Find the master product that best matches the item name
        const productMatch = masterProductList.find(p => p.name.toLowerCase() === parsedItem.name.toLowerCase());

        if (productMatch) {
            // Fetch its canonical pricing and variant info
            const priceData = await getProductPrice(firestore, productMatch.name);
            if (priceData && priceData.variants) {
                // Find the specific variant (e.g., '1kg')
                const targetWeight = parsedItem.quantity.replace(/\s/g, '').toLowerCase();
                const variantMatch = priceData.variants.find(v => v.weight.replace(/\s/g, '').toLowerCase() === targetWeight);

                if (variantMatch) {
                    return { product: productMatch, variant: variantMatch };
                }
            }
        }
        
        return { product: null, variant: null };

    }, [masterProductList, firestore]);

  // Fetch static data and build the command list
  useEffect(() => {
    if (firestore && user) {
        
      const commandActions: { [key: string]: () => void } = {
        home: () => router.push('/'),
        stores: () => router.push('/stores'),
        dashboard: () => router.push('/dashboard'),
        cart: () => router.push('/cart'),
        orders: () => router.push('/dashboard/customer/my-orders'),
        deliveries: () => router.push('/dashboard/delivery/deliveries'),
        myStore: () => router.push('/dashboard/owner/my-store'),
        voiceOrder: () => {
            if (pathname !== '/checkout') {
                router.push('/checkout?action=record');
            } else {
                const micButton = document.querySelector('button[aria-label="Toggle voice recording"]') as HTMLButtonElement;
                micButton?.click();
            }
        },
        checkout: () => {
            onCloseCart();
            router.push('/checkout');
        },
        placeOrder: () => {
          if (placeOrderBtnRef?.current) {
            placeOrderBtnRef.current.click();
          } else {
            speak("You can only place an order from the checkout page.");
            toast({ variant: 'destructive', title: 'Not on checkout page', description: 'You can only place an order from the checkout page.' });
          }
        },
        saveChanges: () => {
          if (pathname === '/dashboard/customer/my-profile' && profileForm) {
            const formElement = document.querySelector('form');
            if (formElement) {
              formElement.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
            }
          } else {
            speak("There are no changes to save on this page.");
          }
        },
        refresh: () => window.location.reload(),
        showMyProducts: () => router.push('/dashboard/owner/my-store'),
      };

      // Fetch dynamic data for commands
      Promise.all([
          getStores(firestore),
          getMasterProducts(firestore),
          getDocs(query(collection(firestore, 'stores'), where('ownerId', '==', user.uid))),
          getCommands()
      ]).then(([stores, masterProducts, myStoreSnapshot, fileCommands]) => {
          setAllStores(stores);
          setMasterProductList(masterProducts);
          
          if (!myStoreSnapshot.empty) {
              setMyStore({ id: myStoreSnapshot.docs[0].id, ...myStoreSnapshot.docs[0].data() } as Store);
          }

          // 1. STATIC NAVIGATION COMMANDS (from commands.json)
          const staticNavCommands: Command[] = Object.entries(fileCommands).flatMap(
            ([key, { display, aliases, reply }]) => {
              const action = commandActions[key];
              if (!action) return [];
              return aliases.map(alias => ({ command: alias, display, action, reply }));
            }
          );

          // 2. DYNAMIC STORE NAVIGATION COMMANDS
          const storeCommands: Command[] = stores.flatMap((store) => {
            const coreName = store.name.toLowerCase().replace(/shop|store|kirana/g, '').trim();
            const variations: string[] = [...new Set([
              store.name.toLowerCase(), coreName, `go to ${store.name.toLowerCase()}`, `open ${store.name.toLowerCase()}`,
              `visit ${store.name.toLowerCase()}`, `show ${store.name.toLowerCase()}`, `go to ${coreName}`, `open ${coreName}`
            ])];

            return variations.map((variation) => ({
              command: variation,
              display: `Go to ${store.name}`,
              action: () => router.push(`/stores/${store.id}`),
              reply: `Navigating to ${store.name}.`
            }));
          });
          
          setAllCommands([...staticNavCommands, ...storeCommands]);
        })
        .catch(console.error);
    }
  }, [firestore, user, router, toast, onCloseCart, pathname, profileForm, speak, onOpenCart, addItemToCart, findProductAndVariant]);

  useEffect(() => {
    listeningRef.current = enabled;
     if (enabled && pathname === '/dashboard/customer/my-profile') {
      handleProfileFormInteraction();
    }
    if (enabled && shouldPromptForLocation) {
        checkoutState.current = 'promptingLocation';
        speak("For accurate delivery, please share your current location for this order. Say yes to confirm.");
    }
    if (!enabled) {
      onSuggestions([]);
      checkoutState.current = 'idle';
    }
  }, [enabled, onSuggestions, pathname, speak, handleProfileFormInteraction, shouldPromptForLocation]);

  useEffect(() => {
    if (typeof window === 'undefined' || !enabled) {
        if(recognitionRef.current) {
            try {
                recognitionRef.current.stop();
            } catch(e) {
                // It might already be stopped
            }
        }
        return;
    };

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      if (enabled) {
        onStatusUpdate('❌ Voice commands not supported by your browser.');
      }
      return;
    }

    if (!recognitionRef.current) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = true;
        recognitionRef.current.lang = 'en-IN';
        recognitionRef.current.interimResults = false;
    }
    
    const recognition = recognitionRef.current;

    const handleCommand = async (command: string) => {
        onStatusUpdate('Processing...'); // Give immediate feedback that it's working
        try {
            if (!firestore || !user) return;
            
            // Handle checkout flow state
            if (command === 'yes') {
                if (checkoutState.current === 'promptingLocation') {
                    handleGetLocation(); // This is the function from the global store
                    checkoutState.current = 'promptingConfirmation';
                    speak("Great, location captured. I will calculate the total. One moment.", () => {
                        setTimeout(() => { 
                            const total = getFinalTotal();
                            if (total > 0) {
                                speak(`Your total is ${total.toFixed(2)} rupees. Shall I place the order?`);
                            } else {
                                speak("I couldn't calculate the total. Please check your cart or list.");
                                checkoutState.current = 'idle';
                            }
                        }, 2000);
                    });
                    return;
                } else if (checkoutState.current === 'promptingConfirmation') {
                    placeOrderBtnRef?.current?.click();
                    checkoutState.current = 'idle'; // Reset state
                    return;
                }
            }
      
            // Handle profile form filling
            if (formFieldToFill.current && profileForm) {
                profileForm.setValue(formFieldToFill.current, command, { shouldValidate: true });
                formFieldToFill.current = null; // Clear the field to fill
                handleProfileFormInteraction(); // Check for the next empty field
                return;
            }
            
            const perfectMatch = allCommands.find((c) => command === c.command);
            if (perfectMatch) {
                speak(perfectMatch.reply);
                await perfectMatch.action();
                onSuggestions([]);
                return;
            }
            
            // Fallback for less specific commands or parsing
            const monthlyListTriggers = ['one month groceries for', 'monthly list for', 'groceries for a month for'];
            const monthlyListTriggerFound = monthlyListTriggers.find(t => command.includes(t));
            if (monthlyListTriggerFound) {
              const matches = command.match(/(\d+)/);
              if (matches) {
                  const memberCount = parseInt(matches[1], 10);
                  speak(`Generating a one-month grocery list for ${memberCount} members. This may take a moment.`);
                  onSuggestions([]);
                  
                  const packageResult = await generateMonthlyPackage({ memberCount });
                  
                  if (packageResult && packageResult.items) {
                      onOpenCart();
                      speak(`Adding ${packageResult.items.length} items to your cart.`);
                      let notFoundCount = 0;
                      
                      for (const item of packageResult.items) {
                          const { product, variant } = await findProductAndVariant(item);
                          if (product && variant) {
                              addItemToCart(product, variant, 1);
                          } else {
                              notFoundCount++;
                              console.warn(`Could not find a matching product/variant for: ${item.name} (${item.quantity})`);
                          }
                      }
                      
                      if (notFoundCount > 0) {
                           toast({ variant: 'destructive', title: "Some Items Not Found", description: `${notFoundCount} item(s) from the generated list could not be found in the product catalog.`});
                      }
                       toast({ title: "Items Added!", description: `A monthly grocery list has been added to your cart.`});
                       return;
                  } else {
                      throw new Error('Failed to generate monthly package AI flow.');
                  }
              }
            }
      
            // Voice order from a specific store
            const orderTriggers = ['order ', 'buy ', 'get ', 'purchase ', 'i want '];
            const orderTriggerFound = orderTriggers.find(t => command.startsWith(t));
            let fromKeyword = ' from ';
            let fromIndex = command.lastIndexOf(fromKeyword);
            if ((orderTriggerFound || true) && fromIndex > -1) {
                const trigger = orderTriggerFound || '';
                const shoppingList = command.substring(trigger.length, fromIndex).trim();
                const storeName = command.substring(fromIndex + fromKeyword.length).trim();
      
                if (shoppingList && storeName) {
                    const matchingStores = allStores.filter(s => s.name.toLowerCase().includes(storeName));
      
                    if (matchingStores.length === 1) {
                        const targetStore = matchingStores[0];
                        speak(`Creating your shopping list for ${targetStore.name}.`);
                        onVoiceOrder({ shoppingList, storeId: targetStore.id });
                        onSuggestions([]);
                        return; 
                    } else if (matchingStores.length > 1) {
                        speak(`I found multiple stores named "${storeName}". Please be more specific.`);
                        onSuggestions([]);
                        return;
                    } else {
                       throw new Error(`Could not find a store named "${storeName}".`);
                    }
                }
            }
            
            // Fuzzy matching for suggestions
            const potentialMatches = allCommands
              .map((c) => ({
                ...c,
                similarity: calculateSimilarity(command, c.command),
              }))
              .filter((c) => c.similarity > 0.7) // Increased threshold for better accuracy
              .sort((a, b) => b.similarity - a.similarity)
              .filter(
                (value, index, self) =>
                  self.findIndex((v) => v.action.toString() === value.action.toString()) ===
                  index
              )
              .slice(0, 3);
      
            if (potentialMatches.length > 0) {
              speak("I'm not sure. Did you mean one of these?");
              onSuggestions(potentialMatches);
            } else {
              throw new Error(`Command not recognized: "${command}"`);
            }
      } catch(e) {
          console.error("Voice command execution failed:", e);
          onStatusUpdate(`⚠️ Action failed. Please try again.`);
          speak("Sorry, I couldn't do that. Please check your connection and try again.");
          onSuggestions([]);
      }
    };

    recognition.onstart = () => {
      onStatusUpdate('🎧 Listening...');
    };

    recognition.onresult = (event) => {
      const transcript = event.results[event.results.length - 1][0].transcript
        .toLowerCase()
        .trim();
      onStatusUpdate(`Heard: "${transcript}"`);
      handleCommand(transcript);
    };

    recognition.onerror = (event) => {
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        console.error('Speech recognition error', event.error);
        onStatusUpdate(`⚠️ Error: ${event.error}`);
      }
       isSpeakingRef.current = false;
       listeningRef.current = false;
    };

    recognition.onend = () => {
      if (listeningRef.current) {
        try {
          if (!isSpeakingRef.current) {
            // Only restart if not in the middle of speaking
            recognition.start();
          }
        } catch (e) {
          console.error('Could not restart recognition service: ', e);
          onStatusUpdate('⚠️ Mic error, please toggle off and on.');
        }
      } else {
        onStatusUpdate('Click the mic to start listening.');
      }
    };

    try {
      recognition.start();
    } catch (e) {
      // This can happen if it's already started, which is fine.
      console.log('Could not start recognition, it may already be running.');
    }

    return () => {
        if (recognitionRef.current) {
            try {
                recognitionRef.current.stop();
            } catch(e) {
                // Ignore errors on stop
            }
        }
    };
  }, [enabled, toast, onStatusUpdate, allCommands, onSuggestions, firestore, user, myStore, masterProductList, router, allStores, onVoiceOrder, findProductAndVariant, addItemToCart, onOpenCart, isCartOpen, onCloseCart, speak, pathname, profileForm, handleProfileFormInteraction, shouldPromptForLocation, handleGetLocation, getFinalTotal, placeOrderBtnRef]);

  return null; // This component does not render anything itself.
}


    