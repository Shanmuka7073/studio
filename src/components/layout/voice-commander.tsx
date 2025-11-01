
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { useFirebase, addDocumentNonBlocking } from '@/firebase';
import { getStores, getMasterProducts } from '@/lib/data';
import type { Store, Product } from '@/lib/types';
import { calculateSimilarity } from '@/lib/calculate-similarity';
import { collection, query, where, getDocs } from 'firebase/firestore';

export interface Command {
  command: string;
  action: () => void;
  display: string;
}

interface VoiceCommanderProps {
  enabled: boolean;
  onStatusUpdate: (status: string) => void;
  onSuggestions: (suggestions: Command[]) => void;
}

export function VoiceCommander({ enabled, onStatusUpdate, onSuggestions }: VoiceCommanderProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { firestore, user } = useFirebase();
  const [allStores, setAllStores] = useState<Store[]>([]);
  const [allCommands, setAllCommands] = useState<Command[]>([]);
  const [masterProductList, setMasterProductList] = useState<Product[]>([]);
  const [myStore, setMyStore] = useState<Store | null>(null);

  const listeningRef = useRef(false);

  // Fetch stores and build the full command list
  useEffect(() => {
    if (firestore && user) {
        
      const commandMap: { [key: string]: { display: string, action: () => void, aliases: string[] } } = {
        home: { display: 'Navigate to Home', action: () => router.push('/'), aliases: ['go home', 'open home', 'back to home', 'show home', 'main page', 'home screen', 'home'] },
        stores: { display: 'Browse All Stores', action: () => router.push('/stores'), aliases: ['go to stores', 'open stores', 'show all stores', 'all stores', 'stores', 'browse stores'] },
        orders: { display: 'View My Orders', action: () => router.push('/dashboard/customer/my-orders'), aliases: ['my orders', 'go to my orders', 'open my orders', 'show my orders', 'orders'] },
        cart: { display: 'View Your Cart', action: () => router.push('/cart'), aliases: ['go to cart', 'open cart', 'show cart', 'my cart', 'cart'] },
        dashboard: { display: 'View Dashboard', action: () => router.push('/dashboard'), aliases: ['go to dashboard', 'open dashboard', 'dashboard'] },
        deliveries: { display: 'View Deliveries', action: () => router.push('/dashboard/delivery/deliveries'), aliases: ['deliveries', 'my deliveries', 'go to deliveries', 'open deliveries', 'delivery dashboard'] },
        createStore: { display: 'Create or Manage My Store', action: () => router.push('/dashboard/owner/my-store'), aliases: ['create my store', 'my store', 'manage my store', 'new store', 'register my store', 'make a store'] },
        voiceOrder: { display: 'Create a Shopping List', action: () => router.push('/checkout?action=record'), aliases: ['create a shopping list', 'voice order', 'record my list', 'new shopping list'] },
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

    const handleCommand = (command: string) => {
      if (!firestore || !user) return;

      // 1. Check for "add product" command for store owners
      if ((command.startsWith('add') || command.startsWith('sell')) && myStore) {
          const productName = command.replace(/add|sell|to my store/g, '').trim();
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

      // 2. Check for "order ... from ..." command
      if (command.startsWith('order ')) {
        const fromMatch = command.match(/ from (.+)/);
        if (fromMatch && fromMatch[1]) {
            const storeName = fromMatch[1].trim();
            const shoppingList = command.substring('order '.length, fromMatch.index).trim();
            
            // Find the store
            const targetStore = allStores.find(s => s.name.toLowerCase().includes(storeName));

            if (targetStore && shoppingList) {
                toast({ title: "Processing Your Order...", description: `Ordering "${shoppingList}" from ${targetStore.name}.`});
                router.push(`/checkout?storeId=${targetStore.id}&list=${encodeURIComponent(shoppingList)}`);
                onSuggestions([]);
                return; // Command handled
            }
        }
      }


      // 3. Check for perfect match on other commands
      const perfectMatch = allCommands.find((c) => command === c.command);
      if (perfectMatch) {
        perfectMatch.action();
        toast({ title: `Navigating...`, description: `Heard: "${command}"` });
        onSuggestions([]);
        return;
      }

      // 4. Check for close matches if no perfect match found
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
      console.error('Speech recognition error', event.error);
       if (event.error !== 'aborted' && event.error !== 'no-speech') {
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
  }, [enabled, toast, onStatusUpdate, allCommands, onSuggestions, firestore, user, myStore, masterProductList, router, allStores]);

  return null;
}
