
'use client';

import { useEffect, useRef, useState, useCallback, RefObject } from 'react';
import { useRouter } from 'next/navigation';
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

export interface Command {
  command: string;
  action: () => void;
  display: string;
}

interface VoiceCommanderProps {
  enabled: boolean;
  onStatusUpdate: (status: string) => void;
  onSuggestions: (suggestions: Command[]) => void;
  onVoiceOrder: (orderInfo: VoiceOrderInfo) => void;
  onOpenCart: () => void;
  onCloseCart: () => void; // New prop to close the cart
  isCartOpen: boolean;
  placeOrderBtnRef?: RefObject<HTMLButtonElement>;
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


export function VoiceCommander({ enabled, onStatusUpdate, onSuggestions, onVoiceOrder, onOpenCart, onCloseCart, isCartOpen, placeOrderBtnRef }: VoiceCommanderProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { firestore, user } = useFirebase();
  const [allStores, setAllStores] = useState<Store[]>([]);
  const [allCommands, setAllCommands] = useState<Command[]>([]);
  const [masterProductList, setMasterProductList] = useState<Product[]>([]);
  const [myStore, setMyStore] = useState<Store | null>(null);
  const { addItem: addItemToCart } = useCart();
  
  const listeningRef = useRef(false);

  // Use browser's native speech synthesis for audio feedback
  const speak = useCallback((text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    try {
      // Cancel any ongoing speech before starting a new one
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.pitch = 1;
      utterance.rate = 1;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.error("Browser speech synthesis error:", e);
    }
  }, []);

  // Fetch stores and build the full command list
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
        voiceOrder: () => router.push('/checkout?action=record'),
        checkout: () => {
            onCloseCart();
            router.push('/checkout');
        },
        placeOrder: () => {
          if (placeOrderBtnRef?.current) {
            placeOrderBtnRef.current.click();
          } else {
            toast({ variant: 'destructive', title: 'Not on checkout page', description: 'You can only place an order from the checkout page.' });
          }
        },
        refresh: () => window.location.reload(),
        showMyProducts: () => router.push('/dashboard/owner/my-store'),
      };

      // Fetch dynamic data: stores, master products, user's store, and commands from file
      Promise.all([
          getStores(firestore),
          getMasterProducts(firestore),
          getDocs(query(collection(firestore, 'stores'), where('ownerId', '==', user.uid))),
          getCommands()
      ]).then(([stores, masterProducts, myStoreSnapshot, fileCommands]) => {
          setAllStores(stores);
          
          if (!myStoreSnapshot.empty) {
              setMyStore({ id: myStoreSnapshot.docs[0].id, ...myStoreSnapshot.docs[0].data() } as Store);
          }
          setMasterProductList(masterProducts);

          const staticNavCommands: Command[] = Object.entries(fileCommands).flatMap(
            ([key, { display, aliases }]) => {
              const action = commandActions[key];
              if (!action) return [];
              return aliases.map(alias => ({ command: alias, display, action }));
            }
          );


          const storeCommands: Command[] = stores.flatMap((store) => {
            const coreName = store.name
              .toLowerCase()
              .replace(/shop|store|kirana/g, '')
              .trim();

            const variations: string[] = [
              store.name.toLowerCase(),
              coreName,
              `go to ${store.name.toLowerCase()}`,
              `open ${store.name.toLowerCase()}`,
              `visit ${store.name.toLowerCase()}`,
              `show ${store.name.toLowerCase()}`,
              `go inside ${store.name.toLowerCase()}`,
              `open shop ${store.name.toLowerCase()}`,
              `go to ${coreName}`,
              `open ${coreName}`,
            ];
            
            const uniqueVariations = [...new Set(variations)];

            return uniqueVariations.map((variation) => ({
              command: variation,
              display: `Go to ${store.name}`,
              action: () => router.push(`/stores/${store.id}`),
            }));
          });
          setAllCommands([...staticNavCommands, ...storeCommands]);
        })
        .catch(console.error);
    }
  }, [firestore, user, router, placeOrderBtnRef, toast, onCloseCart]);

  useEffect(() => {
    listeningRef.current = enabled;
    if (!enabled) {
      onSuggestions([]); // Clear suggestions when disabled
    }
  }, [enabled, onSuggestions]);


    const findProductAndVariant = useCallback(async (parsedItem: {name: string, quantity: string}): Promise<{ product: Product | null, variant: ProductVariant | null }> => {
        if (!firestore) return { product: null, variant: null };
        
        const masterProductMatch = masterProductList.find(p => p.name.toLowerCase() === parsedItem.name.toLowerCase());

        if (masterProductMatch) {
            const priceData = await getProductPrice(firestore, masterProductMatch.name);
            if (priceData && priceData.variants) {
                const targetWeight = parsedItem.quantity.replace(/\s/g, '').toLowerCase();
                const variantMatch = priceData.variants.find(v => v.weight.replace(/\s/g, '').toLowerCase() === targetWeight);

                if (variantMatch) {
                    return { product: masterProductMatch, variant: variantMatch };
                }
            }
        }
        
        return { product: null, variant: null };

    }, [masterProductList, firestore]);

  useEffect(() => {
    if (typeof window === 'undefined' || !enabled) return;

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      if (enabled) {
        onStatusUpdate('❌ Voice commands not supported by your browser.');
      }
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.lang = 'en-IN';
    recognition.interimResults = false;

    const handleCommand = async (command: string) => {
      if (!firestore || !user) return;
      
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
                speak('Sorry, I could not generate the grocery list at this time.');
                return;
            }
        }
      }

      const orderTriggers = ['order ', 'buy ', 'get ', 'shop ', 'purchase ', 'i want '];
      const addToCartTriggers = ['add '];

      const orderTriggerFound = orderTriggers.find(t => command.startsWith(t));
      const addTriggerFound = addToCartTriggers.find(t => command.startsWith(t));
      
      let fromKeyword = ' from shop ';
      let fromIndex = command.lastIndexOf(fromKeyword);
      if (fromIndex === -1) {
          fromKeyword = ' from ';
          fromIndex = command.lastIndexOf(fromKeyword);
      }
      if (fromIndex === -1) {
        fromKeyword = ' at ';
        fromIndex = command.lastIndexOf(fromIndex);
      }

      // SCENARIO 1: Full order command with store ("order 1kg chicken from local basket")
      if (orderTriggerFound && fromIndex > -1) {
          const shoppingList = command.substring(orderTriggerFound.length, fromIndex).trim();
          const storeName = command.substring(fromIndex + fromKeyword.length).trim();

          if (shoppingList && storeName) {
              const matchingStores = allStores.filter(s => s.name.toLowerCase().includes(storeName));

              if (matchingStores.length === 1) {
                  const targetStore = matchingStores[0];
                  speak(`Creating your shopping list for ${targetStore.name}.`);
                  onVoiceOrder({ shoppingList, storeId: targetStore.id });
                  onSuggestions([]);
                  return; // Command handled
              } else if (matchingStores.length > 1) {
                  const message = `I found multiple stores named "${storeName}". Please be more specific, for example, by saying the store's full name or address.`;
                  speak(message);
                  toast({ variant: 'destructive', title: "Multiple Stores Found", description: message });
                  onSuggestions([]);
                  return;
              } else {
                  speak(`Sorry, I could not find a store named "${storeName}".`);
                  toast({ variant: 'destructive', title: "Store Not Found", description: `Could not find a store named "${storeName}".` });
                  onSuggestions([]);
                  return;
              }
          }
      }
      
      const listText = addTriggerFound
        ? command.substring(addTriggerFound.length)
        : orderTriggerFound && fromIndex === -1
        ? command.substring(orderTriggerFound.length)
        : isCartOpen // If cart is open, the whole command is the item
        ? command
        : null;

      // SCENARIO 2: Iterative list building ("add 1 kg chicken and 2 kg tomatoes")
      // OR SCENARIO 3: Cart is open, just say item ("1 kg chicken")
      if (listText) {
          const parsedItems = await parseShoppingList(listText);

          if (parsedItems.length > 0) {
              onOpenCart(); // Open the cart side panel
              onSuggestions([]);
              speak(`Adding items to your cart.`);
              
              for (const item of parsedItems) {
                  const { product, variant } = await findProductAndVariant({ name: item.itemName, quantity: `${item.quantity}${item.unit}` });
                  if (product && variant) {
                      addItemToCart(product, variant, 1); // quantity is implicitly 1 of the variant (e.g. 1 x 1kg pack)
                  } else {
                      speak(`Sorry, I could not find "${item.itemName}".`);
                      toast({ variant: 'destructive', title: "Item not found", description: `Could not find "${item.quantity}${item.unit} ${item.itemName}" in the catalog.`});
                  }
              }
              return; // Command handled
          }
      }

      const addProductTriggers = ['add product ', 'add new product ', 'list ', 'upload ', 'put ', 'new item ', 'post '];
      const sellProductTriggers = ['sell ', 'start selling ', 'mark ', 'put on shelf ', 'list for buyers ', 'make available ', 'enable ', 'stock '];
      
      const addProdTriggerFound = addProductTriggers.find(t => command.startsWith(t));
      const sellTriggerFound = sellProductTriggers.find(t => command.startsWith(t));

      if ((addProdTriggerFound || sellTriggerFound) && myStore) {
          const trigger = addProdTriggerFound || sellTriggerFound;
          const productName = command.substring(trigger!.length).replace(/to my store|for sale|in my store/g, '').trim();
          const productMatch = masterProductList.find(p => p.name.toLowerCase() === productName);

          if (productMatch) {
              const { id, variants, ...productData } = productMatch;
              const newProductData = {
                  ...productData,
                  storeId: myStore.id,
              };

              addDocumentNonBlocking(collection(firestore, 'stores', myStore.id, 'products'), newProductData);
              speak(`Okay, ${productMatch.name} has been added to your store.`);
              toast({ title: "Product Added!", description: `${productMatch.name} has been added to your store.` });
              onSuggestions([]);
              return; // Command handled
          }
      }
      
      const removeProductTriggers = ['remove ', 'delete ', 'stop selling ', 'hide '];
      const removeTriggerFound = removeProductTriggers.find(t => command.startsWith(t));
      
      if (removeTriggerFound && myStore) {
          const productName = command.substring(removeTriggerFound.length).replace(/from my store|product/g, '').trim();
          speak(`Okay, I'll remove ${productName}. This feature is not fully implemented yet.`);
          toast({ title: "Command Acknowledged", description: `Logic to remove "${productName}" from your store is not yet implemented.` });
          onSuggestions([]);
          return;
      }


      // Check for perfect match on other commands
      const perfectMatch = allCommands.find((c) => command === c.command);
      if (perfectMatch) {
        speak(`Navigating to ${perfectMatch.display.replace('View', '').replace('Your','').trim()}`);
        perfectMatch.action();
        onSuggestions([]);
        return;
      }
      
      // Check for match ignoring spaces
      const sanitizedCommand = command.replace(/\s/g, '');
      const spaceInsensitiveMatch = allCommands.find(c => c.command.replace(/\s/g, '') === sanitizedCommand);
      if(spaceInsensitiveMatch) {
        speak(`Navigating to ${spaceInsensitiveMatch.display.replace('View', '').replace('Your','').trim()}`);
        spaceInsensitiveMatch.action();
        onSuggestions([]);
        return;
      }


      // Check for close matches if no perfect match found
      const potentialMatches = allCommands
        .map((c) => ({
          ...c,
          similarity: calculateSimilarity(command, c.command),
        }))
        .filter((c) => c.similarity > 0.6)
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
        speak(`Sorry, I didn't understand "${command}".`);
        onSuggestions([]);
        toast({
          variant: 'destructive',
          title: 'Command not recognized',
          description: `Heard: "${command}"`,
        });
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
    };

    recognition.onend = () => {
      if (listeningRef.current) {
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
      recognition.stop();
      recognition.onend = null; // Prevent restart on component unmount
    };
  }, [enabled, toast, onStatusUpdate, allCommands, onSuggestions, firestore, user, myStore, masterProductList, router, allStores, onVoiceOrder, findProductAndVariant, addItemToCart, onOpenCart, isCartOpen, onCloseCart, speak]);

  return null; // This component does not render anything itself.
}
