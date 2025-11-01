'use client';

import { useEffect, useRef, useState }from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { useFirebase } from '@/firebase';
import { getStores } from '@/lib/data';
import type { Store } from '@/lib/types';

interface VoiceCommanderProps {
  enabled: boolean;
  onStatusUpdate: (status: string) => void;
}

export function VoiceCommander({ enabled, onStatusUpdate }: VoiceCommanderProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { firestore } = useFirebase();
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [stores, setStores] = useState<Store[]>([]);

  // Fetch stores once when the component mounts and firestore is available
  useEffect(() => {
    if (firestore) {
      getStores(firestore).then(setStores).catch(console.error);
    }
  }, [firestore]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      if (enabled) {
        onStatusUpdate('❌ Voice commands not supported by your browser.');
      }
      return;
    }

    if (!recognitionRef.current) {
      recognitionRef.current = new SpeechRecognition();
    }
    
    const recognition = recognitionRef.current;
    recognition.continuous = true;
    recognition.lang = 'en-IN';
    recognition.interimResults = false;

    const handleCommand = (command: string) => {
      // 1. Check for dynamic store navigation first
      // Make matching more flexible
      const storeMatch = stores.find(store => {
          const storeName = store.name.toLowerCase();
          // Get the core name part, removing generic words like "shop" or "store"
          const coreName = storeName.replace(/shop|store|stores/g, '').trim();
          return command.includes(coreName);
      });

      if (storeMatch) {
          router.push(`/stores/${storeMatch.id}`);
          toast({
              title: `Navigating to ${storeMatch.name}`,
              description: `Heard: "${command}"`
          });
          return; // IMPORTANT: Stop processing after a match is found
      }


      // 2. Check for static navigation commands if no store was found
      if (command.includes('go to home')) {
        router.push('/');
        toast({ title: 'Navigating to Home', description: `Heard: "${command}"` });
      } else if (command.includes('go to stores')) {
        router.push('/stores');
        toast({ title: 'Navigating to Stores', description: `Heard: "${command}"` });
      } else if (command.includes('go to my orders')) {
        router.push('/dashboard/customer/my-orders');
        toast({ title: 'Navigating to My Orders', description: `Heard: "${command}"` });
      } else if (command.includes('go to cart')) {
        router.push('/cart');
        toast({ title: 'Navigating to Cart', description: `Heard: "${command}"` });
      } else if (command.includes('go to dashboard')) {
        router.push('/dashboard');
        toast({ title: 'Navigating to Dashboard', description: `Heard: "${command}"` });
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
      // Only restart if the service is supposed to be enabled.
      // This prevents restarting when we manually call .stop()
      if (enabled) {
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

    if (enabled) {
      try {
        recognition.start();
      } catch(e) {
        console.log("Could not start recognition, it may already be running.");
      }
    } else {
      // When disabled, stop recognition and nullify the onend handler
      // to prevent it from restarting.
      recognition.onend = null; 
      recognition.stop();
    }

    // Cleanup function to stop recognition when the component unmounts or `enabled` changes to false
    return () => {
      if(recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      }
    };

  }, [enabled, router, toast, onStatusUpdate, stores]);

  return null; // This component does not render anything
}
