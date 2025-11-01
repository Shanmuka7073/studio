
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { useFirebase, addDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import { getStores, getMasterProducts, getProductPrice } from '@/lib/data';
import type { Store, Product, ProductPrice, ProductVariant } from '@/lib/types';
import { calculateSimilarity } from '@/lib/calculate-similarity';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { VoiceOrderInfo } from '@/components/voice-order-dialog';
import { useCart } from '@/lib/cart';

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


export function VoiceCommander({ enabled, onStatusUpdate, onSuggestions, onVoiceOrder, onOpenCart, isCartOpen }: VoiceCommanderProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { firestore, user } = useFirebase();
  const [allStores, setAllStores] = useState<Store[]>([]);
  const [allCommands, setAllCommands] = useState<Command[]>([]);
  const [masterProductList, setMasterProductList] = useState<Product[]>([]);
  const [myStore, setMyStore] = useState<Store | null>(null);
  const { addItem: addItemToCart } = useCart();

  const listeningRef = useRef(false);

  // Fetch stores and build the full command list
  useEffect(() => {
    if (firestore && user) {
        
      const commandMap: { [key: string]: { display: string, action: () => void, aliases: string[] } } = {
        home: { display: 'Navigate to Home', action: () => router.push('/'), aliases: ['go home', 'home page', 'main screen', 'go to home', 'back to start', 'open homepage', 'return home', 'show home', 'open home', 'localbasket', 'local basket'] },
        stores: { display: 'Browse All Stores', action: () => router.push('/stores'), aliases: ['go to stores', 'browse stores', 'show all stores', 'open store list', 'find stores', 'explore shops', 'nearby shops', 'shop list', 'view all shops'] },
        dashboard: { display: 'View Dashboard', action: () => router.push('/dashboard'), aliases: ['go to dashboard', 'open dashboard', 'my dashboard', 'show my stats', 'open my panel', 'go to control panel', 'view dashboard'] },
        cart: { display: 'View Your Cart', action: () => router.push('/cart'), aliases: ['go to cart', 'open cart', 'show cart', 'view my cart', 'see my basket', 'go to basket', 'open shopping cart', 'my items'] },
        orders: { display: 'View My Orders', action: () => router.push('/dashboard/customer/my-orders'), aliases: ['my orders', 'go to my orders', 'open my orders', 'show my orders', 'view orders', 'check my orders', 'open order history', 'see past orders', 'my purchases'] },
        deliveries: { display: 'View Deliveries', action: () => router.push('/dashboard/delivery/deliveries'), aliases: ['deliveries', 'my deliveries', 'go to deliveries', 'open deliveries', 'track deliveries', 'check delivery status', 'see my delivery list', 'delivery updates', 'delivery dashboard'] },
        myStore: { display: 'Create or Manage My Store', action: () => router.push('/dashboard/owner/my-store'), aliases: ['create my store', 'my store', 'manage my store', 'new store', 'register my store', 'make a store', 'open my shop', 'go to seller page', 'view my products', 'store dashboard', 'my store page'] },
        voiceOrder: { display: 'Create a Shopping List', action: () => router.push('/checkout?action=record'), aliases: ['create a shopping list', 'make a list', 'new shopping list', 'start my list', 'prepare my list', 'record my order', 'start voice order', 'start list', 'i want to shop', 'start recording', 'take my order', 'start voice shopping', 'record voice list', 'I\'ll say my list', 'speak my order', 'take my list', 'listen to my order', 'record shopping items', 'note down my list'] },
        checkout: { display: 'Proceed to Checkout', action: () => router.push('/checkout'), aliases: ['proceed to checkout', 'go to checkout', 'checkout now', 'open checkout', 'start checkout', 'finish my order', 'complete purchase', 'pay now'] },
        refresh: { display: 'Refresh the page', action: () => window.location.reload(), aliases: ['refresh the page', 'reload page', 'reload app', 'refresh screen', 'restart page', 'update screen', 'refresh everything', 'refresh'] },
        showMyProducts: { display: "Show My Store's Products", action: () => router.push('/dashboard/owner/my-store'), aliases: ["show my products", "list my items", "open inventory", "what am I selling", "see store items", "view my listings"] },
      };

      const staticNavCommands: Command[] = Object.values(commandMap).flatMap(
        ({ display, action, aliases }) =>
          aliases.map(alias => ({ command: alias, display, action }))
      );

      // Fetch dynamic data: stores, master products, and the user's own store
      Promise.all([
          getStores(firestore),
          getMasterProducts(firestore),
          getDocs(query(collection(firestore, 'stores'), where('ownerId', '==', user.uid)))
      ]).then(([stores, masterProducts, myStoreSnapshot]) => {
          setAllStores(stores);
          
          if (!myStoreSnapshot.empty) {
              setMyStore({ id: myStoreSnapshot.docs[0].id, ...myStoreSnapshot.docs[0].data() } as Store);
          }
          setMasterProductList(masterProducts);

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
  }, [firestore, user, router]);

  useEffect(() => {
    listeningRef.current = enabled;
    if (!enabled) {
      onSuggestions([]); // Clear suggestions when disabled
    }
  }, [enabled, onSuggestions]);


    const findProductAndVariant = useCallback(async (parsedItem: ParsedShoppingListItem): Promise<{ product: Product | null, variant: ProductVariant | null }> => {
        if (!firestore) return { product: null, variant: null };
        
        // Find a master product that matches the item name
        const masterProductMatch = masterProductList.find(p => parsedItem.itemName.includes(p.name.toLowerCase()));

        if (masterProductMatch) {
            // If we have a product match, fetch its specific price variants
            const priceData = await getProductPrice(firestore, masterProductMatch.name);
            if (priceData && priceData.variants) {
                // Now find the variant that matches the spoken weight
                // e.g., "1kg" should match "1kg", "1 kg" etc.
                 const targetWeight = (parsedItem.quantity + (parsedItem.unit === 'pc' ? 'pc' : parsedItem.unit)).replace(/\s/g, '').toLowerCase();

                const variantMatch = priceData.variants.find(v => {
                    const variantWeight = v.weight.replace(/\s/g, '').toLowerCase();
                    // Handle cases like "1kg" matching "1 kg"
                    if (variantWeight === targetWeight) return true;
                    // Handle cases where unit is implied, e.g. "1 chicken" -> "1pc"
                    if (parsedItem.unit === 'pc' && variantWeight === (parsedItem.quantity + 'pc')) return true;
                    return false;
                });

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
        fromIndex = command.lastIndexOf(fromKeyword);
      }

      // SCENARIO 1: Full order command with store ("order 1kg chicken from local basket")
      if (orderTriggerFound && fromIndex > -1) {
          const shoppingList = command.substring(orderTriggerFound.length, fromIndex).trim();
          const storeName = command.substring(fromIndex + fromKeyword.length).trim();

          if (shoppingList && storeName) {
              const targetStore = allStores.find(s => s.name.toLowerCase().includes(storeName));

              if (targetStore) {
                  onVoiceOrder({ shoppingList, storeId: targetStore.id });
                  onSuggestions([]);
                  return; // Command handled
              } else {
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
              toast({ title: "Adding to cart...", description: `Heard: "${command}"`});
              
              for (const item of parsedItems) {
                  const { product, variant } = await findProductAndVariant(item);
                  if (product && variant) {
                      addItemToCart(product, variant, 1); // quantity is implicitly 1 of the variant (e.g. 1 x 1kg pack)
                  } else {
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
              toast({ title: "Product Added!", description: `${productMatch.name} has been added to your store.` });
              onSuggestions([]);
              return; // Command handled
          }
      }
      
      const removeProductTriggers = ['remove ', 'delete ', 'stop selling ', 'hide '];
      const removeTriggerFound = removeProductTriggers.find(t => command.startsWith(t));
      
      if (removeTriggerFound && myStore) {
          const productName = command.substring(removeTriggerFound.length).replace(/from my store|product/g, '').trim();
          toast({ title: "Command Acknowledged", description: `Logic to remove "${productName}" from your store is not yet implemented.` });
          onSuggestions([]);
          return;
      }


      // Check for perfect match on other commands
      const perfectMatch = allCommands.find((c) => command === c.command);
      if (perfectMatch) {
        perfectMatch.action();
        toast({ title: `Navigating...`, description: `Heard: "${command}"` });
        onSuggestions([]);
        return;
      }
      
      // Check for match ignoring spaces
      const sanitizedCommand = command.replace(/\s/g, '');
      const spaceInsensitiveMatch = allCommands.find(c => c.command.replace(/\s/g, '') === sanitizedCommand);
      if(spaceInsensitiveMatch) {
        spaceInsensitiveMatch.action();
        toast({ title: `Navigating...`, description: `Heard: "${command}"` });
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
        onSuggestions(potentialMatches);
      } else {
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
  }, [enabled, toast, onStatusUpdate, allCommands, onSuggestions, firestore, user, myStore, masterProductList, router, allStores, onVoiceOrder, findProductAndVariant, addItemToCart, onOpenCart, isCartOpen]);

  return null;
}
