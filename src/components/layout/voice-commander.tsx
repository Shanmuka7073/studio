
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
  const [productPrices, setProductPrices] = useState<Record<string, ProductPrice>>({});

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
        if (onEndCallback) {
            onEndCallback();
        }
         // The main onend handler of the recognition service will restart it if enabled.
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

  const findProductAndVariant = useCallback(async (productName: string, desiredWeight: string): Promise<{ product: Product | null, variant: ProductVariant | null }> => {
        const lowerProductName = productName.toLowerCase();
        const productMatch = masterProductList.find(p => p.name.toLowerCase() === lowerProductName);

        if (!productMatch) return { product: null, variant: null };

        let priceData = productPrices[lowerProductName];
        if (!priceData && firestore) {
            priceData = await getProductPrice(firestore, lowerProductName);
            if (priceData) {
                setProductPrices(prev => ({ ...prev, [lowerProductName]: priceData }));
            }
        }
        
        if (priceData && priceData.variants) {
            const lowerDesiredWeight = desiredWeight.replace(/\s/g, '').toLowerCase();
            const variantMatch = priceData.variants.find(v => v.weight.replace(/\s/g, '').toLowerCase() === lowerDesiredWeight);
            if (variantMatch) {
                return { product: productMatch, variant: variantMatch };
            }
        }
        
        return { product: null, variant: null };

    }, [masterProductList, firestore, productPrices]);

  // Fetch static data and build the command list
  useEffect(() => {
    if (firestore && user) {
        
      const commandActions: { [key: string]: Function } = {
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
        orderItem: async ({ product, quantity }: { product: string, quantity: string }) => {
            speak(`Looking for ${quantity} of ${product}.`);
            const { product: foundProduct, variant } = await findProductAndVariant(product, quantity);
            if (foundProduct && variant) {
                addItemToCart(foundProduct, variant, 1);
                speak(`Added ${quantity} of ${product} to your cart.`);
                onOpenCart();
            } else {
                speak(`Sorry, I could not find ${quantity} of ${product}.`);
            }
        },
      };

      // Fetch dynamic data for commands
      Promise.all([
          getStores(firestore),
          getMasterProducts(firestore),
          getCommands()
      ]).then(async ([stores, masterProducts, fileCommands]) => {
          setAllStores(stores);
          setMasterProductList(masterProducts);
          
          let builtCommands: Command[] = [];

          // 1. DYNAMIC STORE NAVIGATION COMMANDS
          stores.forEach((store) => {
            const coreName = store.name.toLowerCase().replace(/shop|store|kirana/g, '').trim();
            const variations: string[] = [...new Set([
              store.name.toLowerCase(), coreName, `go to ${store.name.toLowerCase()}`, `open ${store.name.toLowerCase()}`,
              `visit ${store.name.toLowerCase()}`, `show ${store.name.toLowerCase()}`, `go to ${coreName}`, `open ${coreName}`
            ])];
            variations.forEach(variation => {
                builtCommands.push({
                    command: variation,
                    display: `Go to ${store.name}`,
                    action: () => router.push(`/stores/${store.id}`),
                    reply: `Navigating to ${store.name}.`
                });
            });
          });

          // Fetch all price data to generate order commands
          const priceDocs = await getDocs(collection(firestore, 'productPrices'));
          const allPrices = priceDocs.docs.reduce((acc, doc) => {
              acc[doc.id] = doc.data() as ProductPrice;
              return acc;
          }, {} as Record<string, ProductPrice>);
          setProductPrices(allPrices);
          
          // 2. TEMPLATE-BASED ORDERING COMMANDS
          const orderItemTemplate = fileCommands.orderItem;
          if (orderItemTemplate && masterProducts.length > 0 && Object.keys(allPrices).length > 0) {
              masterProducts.forEach(product => {
                  const priceData = allPrices[product.name.toLowerCase()];
                  if (priceData && priceData.variants) {
                      priceData.variants.forEach(variant => {
                          orderItemTemplate.aliases.forEach(template => {
                              const commandStr = template
                                  .replace('{product}', product.name.toLowerCase())
                                  .replace('{quantity}', variant.weight.toLowerCase());
                              
                              builtCommands.push({
                                  command: commandStr,
                                  display: `Order ${variant.weight} of ${product.name}`,
                                  action: () => commandActions.orderItem({ product: product.name, quantity: variant.weight }),
                                  reply: orderItemTemplate.reply,
                              });
                          });
                      });
                  }
              });
          }

          // 3. STATIC NAVIGATION COMMANDS (excluding orderItem)
          Object.entries(fileCommands).forEach(([key, { display, aliases, reply }]) => {
              if (key === 'orderItem') return;
              const action = commandActions[key];
              if (!action) return;
              aliases.forEach(alias => {
                  builtCommands.push({ command: alias, display, action, reply });
              });
          });
          
          setAllCommands(builtCommands);
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
        recognitionRef.current.continuous = false; // Process one command at a time
        recognitionRef.current.lang = 'en-IN';
        recognitionRef.current.interimResults = false;
    }
    
    const recognition = recognitionRef.current;

    const handleCommand = async (command: string) => {
        onStatusUpdate(`Processing: "${command}"`);
        try {
            if (!firestore || !user) return;
            
            if (command === 'yes') {
                if (checkoutState.current === 'promptingLocation') {
                    handleGetLocation();
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
                    checkoutState.current = 'idle';
                    return;
                }
            }
      
            if (formFieldToFill.current && profileForm) {
                profileForm.setValue(formFieldToFill.current, command, { shouldValidate: true });
                formFieldToFill.current = null;
                handleProfileFormInteraction();
                return;
            }
            
            const perfectMatch = allCommands.find((c) => command === c.command);
            if (perfectMatch) {
                speak(perfectMatch.reply);
                await perfectMatch.action();
                onSuggestions([]);
                return;
            }
            
            const fromKeyword = ' from ';
            let fromIndex = command.lastIndexOf(fromKeyword);
            if (fromIndex > -1) {
                const shoppingList = command.substring(0, fromIndex).trim();
                const storeName = command.substring(fromIndex + fromKeyword.length).trim();
                const orderTriggers = ['order ', 'buy ', 'get ', 'purchase ', 'i want '];
                const trigger = orderTriggers.find(t => shoppingList.startsWith(t));
                const cleanList = trigger ? shoppingList.substring(trigger.length) : shoppingList;
      
                if (cleanList && storeName) {
                    const matchingStores = allStores.filter(s => s.name.toLowerCase().includes(storeName));
                    if (matchingStores.length === 1) {
                        const targetStore = matchingStores[0];
                        speak(`Creating your shopping list for ${targetStore.name}.`);
                        onVoiceOrder({ shoppingList: cleanList, storeId: targetStore.id });
                        onSuggestions([]);
                        return; 
                    }
                }
            }
            
            const potentialMatches = allCommands
              .map((c) => ({
                ...c,
                similarity: calculateSimilarity(command, c.command),
              }))
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
    };

    recognition.onend = () => {
      if (listeningRef.current && !isSpeakingRef.current) {
        try {
            recognition.start();
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
      console.log('Could not start recognition, it may already be running.');
    }

    return () => {
        if (recognitionRef.current) {
            try {
                recognitionRef.current.onend = null;
                recognitionRef.current.stop();
            } catch(e) {
                // Ignore errors on stop
            }
        }
    };
  }, [enabled, toast, onStatusUpdate, allCommands, onSuggestions, firestore, user, allStores, onVoiceOrder, findProductAndVariant, addItemToCart, onOpenCart, speak, pathname, profileForm, handleProfileFormInteraction, shouldPromptForLocation, handleGetLocation, getFinalTotal, placeOrderBtnRef]);

  return null;
}
