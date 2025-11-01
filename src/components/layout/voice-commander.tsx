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

const STATIC_COMMANDS: Omit<Command, 'action'>[] = [
  { command: 'go home', display: 'Go to Home' },
  { command: 'open home', display: 'Go to Home' },
  { command: 'home', display: 'Go to Home' },
  { command: 'go to stores', display: 'Browse All Stores' },
  { command: 'open stores', display: 'Browse All Stores' },
  { command: 'stores', display: 'Browse All Stores' },
  { command: 'go to my orders', display: 'View My Orders' },
  { command: 'open my orders', display: 'View My Orders' },
  { command: 'my orders', display: 'View My Orders' },
  { command: 'go to cart', display: 'View Cart' },
  { command: 'open cart', display: 'View Cart' },
  { command: 'cart', display: 'View Cart' },
  { command: 'go to dashboard', display: 'Go to Dashboard' },
  { command: 'open dashboard', display: 'Go to Dashboard' },
  { command: 'dashboard', display: 'Go to Dashboard' },
];

export function VoiceCommander({ enabled, onStatusUpdate, onSuggestions }: VoiceCommanderProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { firestore, user } = useFirebase();
  const [allCommands, setAllCommands] = useState<Command[]>([]);
  const listeningRef = useRef(false);

  // Fetch stores and build the full command list
  useEffect(() => {
    if (firestore && user) {
        const staticNavCommands: Command[] = [
            { command: 'go home', display: 'Navigate to Home', action: () => router.push('/') },
            { command: 'open home', display: 'Navigate to Home', action: () => router.push('/') },
            { command: 'home', display: 'Navigate to Home', action: () => router.push('/') },
            { command: 'go to stores', display: 'Browse All Stores', action: () => router.push('/stores') },
            { command: 'open stores', display: 'Browse All Stores', action: () => router.push('/stores') },
            { command: 'stores', display: 'Browse All Stores', action: () => router.push('/stores') },
            { command: 'go to my orders', display: 'View My Orders', action: () => router.push('/dashboard/customer/my-orders') },
            { command: 'open my orders', display: 'View My Orders', action: () => router.push('/dashboard/customer/my-orders') },
            { command: 'my orders', display: 'View My Orders', action: () => router.push('/dashboard/customer/my-orders') },
            { command: 'go to cart', display: 'View Your Cart', action: () => router.push('/cart') },
            { command: 'open cart', display: 'View Your Cart', action: () => router.push('/cart') },
            { command: 'cart', display: 'View Your Cart', action: () => router.push('/cart') },
            { command: 'go to dashboard', display: 'View Dashboard', action: () => router.push('/dashboard') },
            { command: 'open dashboard', display: 'View Dashboard', action: () => router.push('/dashboard') },
            { command: 'dashboard', display: 'View Dashboard', action: () => router.push('/dashboard') },
        ];

      getStores(firestore).then(stores => {
        const storeCommands: Command[] = stores.flatMap(store => {
            const coreName = store.name.toLowerCase().replace(/shop|stores|store/g, '').trim();
            const variations = [
                `go to ${coreName}`,
                `open ${coreName}`,
                coreName,
                store.name.toLowerCase()
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
            .filter(c => c.similarity > 0.5) // Threshold for suggestions
            .sort((a, b) => b.similarity - a.similarity)
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
