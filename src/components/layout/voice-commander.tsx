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
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.lang = 'en-IN';
      recognition.interimResults = false;
      recognitionRef.current = recognition;

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
        if (enabled && recognitionRef.current) { // Check ref exists
            console.log('Recognition service ended, restarting...');
            try {
                recognitionRef.current.start();
            } catch(e) {
                console.error("Could not restart recognition service: ", e);
            }
        } else {
            onStatusUpdate('Click the mic to start listening.');
        }
      };
    }
    
    const recognition = recognitionRef.current;

    const handleCommand = (command: string) => {
      const showToast = (title: string, description?: string) => {
        toast({
            title: title,
            description: description || `Heard: "${command}"`
        });
      }

      // Dynamic store navigation
      const matchedStore = stores.find(store => command.includes(store.name.toLowerCase()));
      if (matchedStore) {
        router.push(`/stores/${matchedStore.id}`);
        showToast(`Navigating to ${matchedStore.name}`);
        return;
      }

      // Static navigation as a fallback
      if (command.includes('go to home')) {
        router.push('/');
        showToast('Navigating to Home');
      } else if (command.includes('go to stores')) {
        router.push('/stores');
        showToast('Navigating to Stores');
      } else if (command.includes('go to my orders')) {
        router.push('/dashboard/customer/my-orders');
        showToast('Navigating to My Orders');
      } else if (command.includes('go to cart')) {
        router.push('/cart');
        showToast('Navigating to Cart');
      } else if (command.includes('go to dashboard')) {
        router.push('/dashboard');
        showToast('Navigating to Dashboard');
      }
    };
    
    if (enabled) {
      try {
        recognition.start();
      } catch(e) {
        // This can happen if it's already running, which is fine.
        console.log("Could not start recognition, it may already be running.");
      }
    } else {
        recognition.stop();
    }

    return () => {
        if(recognitionRef.current) {
            recognitionRef.current.onend = null; // Prevent restart on cleanup
            recognitionRef.current.stop();
        }
    };

  }, [enabled, router, toast, onStatusUpdate, stores]);

  return null; // This component does not render anything
}
