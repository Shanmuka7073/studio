'use client';

import { useEffect, useRef, useState }from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { useFirebase } from '@/firebase';
import { getStores } from '@/lib/data';
import type { Store } from '@/lib/types';
import { calculateSimilarity } from '@/lib/calculate-similarity';

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
  const [allCommands, setAllCommands] = useState<Command[]>([]);
  const listeningRef = useRef(false);

  // Fetch stores and build the full command list
  useEffect(() => {
    if (firestore && user) {
        const commandMap: { [key: string]: { display: string, action: () => void, aliases: string[] } } = {
            home: {
                display: 'Navigate to Home',
                action: () => router.push('/'),
                aliases: ['go home', 'open home', 'back to home', 'show home', 'main page', 'home screen', 'home']
            },
            stores: {
                display: 'Browse All Stores',
                action: () => router.push('/stores'),
                aliases: ['go to stores', 'open stores', 'show stores', 'all stores', 'stores']
            },
            orders: {
                display: 'View My Orders',
                action: () => router.push('/dashboard/customer/my-orders'),
                aliases: ['my orders', 'go to my orders', 'open my orders', 'show my orders', 'orders']
            },
            cart: {
                display: 'View Your Cart',
                action: () => router.push('/cart'),
                aliases: ['go to cart', 'open cart', 'show cart', 'my cart', 'cart']
            },
            dashboard: {
                display: 'View Dashboard',
                action: () => router.push('/dashboard'),
                aliases: ['go to dashboard', 'open dashboard', 'dashboard']
            },
            deliveries: {
                display: 'View Deliveries',
                action: () => router.push('/dashboard/delivery/deliveries'),
                aliases: ['deliveries', 'my deliveries', 'go to deliveries', 'open deliveries', 'delivery dashboard']
            }
        };

        const staticNavCommands: Command[] = Object.values(commandMap).flatMap(
            ({ display, action, aliases }) =>
                aliases.map(alias => ({ command: alias, display, action }))
        );


      getStores(firestore).then(stores => {
        const storeCommands: Command[] = stores.flatMap(store => {
            const coreName = store.name.toLowerCase().replace(/shop|stores|store/g, '').trim();
            const variations = [
                `go to ${coreName}`,
                `open ${coreName}`,
                coreName,
                store.name.toLowerCase(),
                `go to ${store.name.toLowerCase()}`,
                `open ${store.name.toLowerCase()}`,
            ];
            return variations.map(variation => ({
                command: variation,
                display: `Go to ${store.name}`, 
                action: () => router.push(`/stores/${store.id}`)
            }));
        });
        setAllCommands([...staticNavCommands, ...storeCommands]);
      }).catch(console.error);
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

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
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
        if (allCommands.length === 0) return;

        const perfectMatch = allCommands.find(c => command === c.command);
        if (perfectMatch) {
            perfectMatch.action();
            toast({ title: `Navigating...`, description: `Heard: "${command}"` });
            onSuggestions([]);
            return;
        }

        const potentialMatches = allCommands
            .map(c => ({
                ...c,
                similarity: calculateSimilarity(command, c.command),
            }))
            .filter(c => c.similarity > 0.6) // Use a slightly higher threshold for suggestions
            .sort((a, b) => b.similarity - a.similarity)
            // Deduplicate suggestions based on the action they perform
            .filter((value, index, self) => self.findIndex(v => v.action.toString() === value.action.toString()) === index)
            .slice(0, 3);

        if (potentialMatches.length > 0) {
            onSuggestions(potentialMatches);
        } else {
            onSuggestions([]);
            toast({ variant: 'destructive', title: 'Command not recognized', description: `Heard: "${command}"` });
        }
    };
    
    recognition.onstart = () => {
      onStatusUpdate('🎧 Listening...');
    };

    recognition.onresult = (event) => {
      const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase().trim();
      onStatusUpdate(`Heard: "${transcript}"`);
      handleCommand(transcript);
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error', event.error);
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        onStatusUpdate(`⚠️ Error: ${event.error}`);
      }
    };
    
    recognition.onend = () => {
      if (listeningRef.current) {
          try {
            recognition.start();
          } catch(e) {
            console.error("Could not restart recognition service: ", e);
            onStatusUpdate('⚠️ Mic error, please toggle off and on.');
          }
      } else {
        onStatusUpdate('Click the mic to start listening.');
      }
    };

    try {
      recognition.start();
    } catch(e) {
      console.log("Could not start recognition, it may already be running.");
    }

    return () => {
      recognition.stop();
      recognition.onend = null;
    };

  }, [enabled, toast, onStatusUpdate, allCommands, onSuggestions]);

  return null;
}
