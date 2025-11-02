
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { useFirebase } from '@/firebase';
import { getStores, getMasterProducts, getProductPrice } from '@/lib/data';
import type { Store, Product, ProductPrice, ProductVariant } from '@/lib/types';
import { calculateSimilarity } from '@/lib/calculate-similarity';
import { VoiceOrderInfo } from '@/components/voice-order-dialog';
import { useCart } from '@/lib/cart';
import { getCommands } from '@/app/actions';
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
  onCloseCart: () => void;
  isCartOpen: boolean;
}

export function VoiceCommander({
  enabled,
  onStatusUpdate,
  onSuggestions,
  onVoiceOrder,
  onOpenCart,
  onCloseCart,
}: VoiceCommanderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const { firestore, user } = useFirebase();
  const { addItem: addItemToCart } = useCart();
  const { form: profileForm } = useProfileFormStore();
  const { shouldPromptForLocation, handleGetLocation, getFinalTotal, placeOrderBtnRef } = useCheckoutStore();

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isSpeakingRef = useRef(false);
  const isEnabledRef = useRef(enabled);
  const commandsRef = useRef<Command[]>([]);
  const storesRef = useRef<Store[]>([]);
  const masterProductsRef = useRef<Product[]>([]);
  const productPricesRef = useRef<Record<string, ProductPrice>>({});
  const formFieldToFillRef = useRef<keyof ProfileFormValues | null>(null);
  const checkoutStateRef = useRef<'idle' | 'promptingLocation' | 'promptingConfirmation'>('idle');

  // Update the enabled ref when the prop changes
  useEffect(() => {
    isEnabledRef.current = enabled;
    if (recognitionRef.current) {
      if (enabled) {
        try {
          recognitionRef.current.start();
        } catch (e) {
          // Ignore error if it's already started
        }
      } else {
        recognitionRef.current.stop();
      }
    }
  }, [enabled]);

  const speak = useCallback((text: string, onEndCallback?: () => void) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      if (onEndCallback) onEndCallback();
      return;
    }

    isSpeakingRef.current = true;
    recognitionRef.current?.stop(); // Stop listening while speaking

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

  const findProductAndVariant = useCallback(async (productName: string, desiredWeight?: string): Promise<{ product: Product | null, variant: ProductVariant | null }> => {
    const lowerProductName = productName.toLowerCase();
    const productMatch = masterProductsRef.current.find(p => p.name.toLowerCase() === lowerProductName);

    if (!productMatch) return { product: null, variant: null };

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
            if (variantMatch) return { product: productMatch, variant: variantMatch };
        }
        
        const onePieceVariant = priceData.variants.find(v => v.weight.replace(/\s/g, '').toLowerCase() === '1pc');
        if (onePieceVariant) return { product: productMatch, variant: onePieceVariant };

        return { product: productMatch, variant: priceData.variants[0] };
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

  // This useEffect runs only once to set up the recognition service and load commands
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.error("SpeechRecognition API not supported.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false; // Process one command at a time
    recognition.lang = 'en-IN';
    recognition.interimResults = false;
    recognitionRef.current = recognition;

    const handleCommand = async (command: string) => {
        onStatusUpdate(`Processing: "${command}"`);
        try {
            if (!firestore || !user) return;
            
            if (command === 'yes') {
                if (checkoutStateRef.current === 'promptingLocation') {
                    handleGetLocation();
                    checkoutStateRef.current = 'promptingConfirmation';
                    speak("Great, location captured. One moment.", () => {
                        setTimeout(() => { 
                            const total = getFinalTotal();
                            if (total > 0) {
                                speak(`Your total is ${total.toFixed(2)} rupees. Shall I place the order?`);
                            } else {
                                speak("I couldn't calculate the total. Please check your cart or list.");
                                checkoutStateRef.current = 'idle';
                            }
                        }, 2000);
                    });
                    return;
                } else if (checkoutStateRef.current === 'promptingConfirmation') {
                    placeOrderBtnRef?.current?.click();
                    checkoutStateRef.current = 'idle';
                    return;
                }
            }
      
            if (formFieldToFillRef.current && profileForm) {
                profileForm.setValue(formFieldToFillRef.current, command, { shouldValidate: true });
                formFieldToFillRef.current = null;
                handleProfileFormInteraction();
                return;
            }
            
            const perfectMatch = commandsRef.current.find((c) => command === c.command);
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
                    const matchingStores = storesRef.current.filter(s => s.name.toLowerCase().includes(storeName));
                    if (matchingStores.length === 1) {
                        const targetStore = matchingStores[0];
                        speak(`Creating your shopping list for ${targetStore.name}.`);
                        onVoiceOrder({ shoppingList: cleanList, storeId: targetStore.id });
                        onSuggestions([]);
                        return; 
                    }
                }
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
        try {
          recognition.start();
        } catch (e) {
          console.error('Could not restart recognition service: ', e);
        }
      } else {
        onStatusUpdate('Click the mic to start listening.');
      }
    };

    // Load all commands and data
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
          checkout: () => { onCloseCart(); router.push('/checkout'); },
          placeOrder: () => {
            if (placeOrderBtnRef?.current) placeOrderBtnRef.current.click();
            else speak("You can only place an order from the checkout page.");
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
              speak(`Looking for ${product}.`);
              const { product: foundProduct, variant } = await findProductAndVariant(product, quantity);
              if (foundProduct && variant) {
                  addItemToCart(foundProduct, variant, 1);
                  speak(`Added ${variant.weight} of ${product} to your cart.`);
                  onOpenCart();
              } else {
                  speak(`Sorry, I could not find ${product}.`);
              }
          },
        };

        Promise.all([ getStores(firestore), getMasterProducts(firestore), getCommands() ])
            .then(([stores, masterProducts, fileCommands]) => {
                storesRef.current = stores;
                masterProductsRef.current = masterProducts;
                
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
                            action: () => router.push(`/stores/${store.id}`),
                            reply: `Navigating to ${store.name}.`
                        });
                    });
                });

                const orderItemTemplate = fileCommands.orderItem;
                if (orderItemTemplate && masterProducts.length > 0) {
                    masterProducts.forEach(product => {
                        // This logic is simplified; real logic would fetch variants here.
                        // Add command for "add one {product}"
                         orderItemTemplate.aliases.forEach(template => {
                            if(!template.includes('{quantity}')) {
                                const commandStr = template.replace('{product}', product.name.toLowerCase());
                                builtCommands.push({
                                    command: commandStr,
                                    display: `Order one ${product.name}`,
                                    action: () => commandActions.orderItem({ product: product.name }),
                                    reply: orderItemTemplate.reply,
                                });
                            }
                        });
                    });
                }
                
                Object.entries(fileCommands).forEach(([key, { display, aliases, reply }]) => {
                    if (key === 'orderItem') return;
                    const action = commandActions[key];
                    if (action) {
                      aliases.forEach(alias => {
                          builtCommands.push({ command: alias, display, action, reply });
                      });
                    }
                });
                
                commandsRef.current = builtCommands;
            }).catch(console.error);
    }
    
    // Cleanup on unmount
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firestore, user]); // This effect should only run once on mount

  return null;
}
