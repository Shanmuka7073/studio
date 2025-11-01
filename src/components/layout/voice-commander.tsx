
'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';

interface VoiceCommanderProps {
  enabled: boolean;
}

export function VoiceCommander({ enabled }: VoiceCommanderProps) {
  const router = useRouter();
  const { toast } = useToast();
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const listeningRef = useRef(false);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      if(enabled) {
        toast({
            variant: 'destructive',
            title: 'Voice Commands Not Supported',
            description: 'Your browser does not support the Web Speech API.',
        });
      }
      return;
    }

    if (!recognitionRef.current) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true; // Keep listening even after speech is detected
        recognition.interimResults = false;
        recognition.lang = 'en-IN';
        recognitionRef.current = recognition;

        recognition.onresult = (event) => {
            const lastResultIndex = event.results.length - 1;
            const command = event.results[lastResultIndex][0].transcript.toLowerCase().trim();
            console.log('Heard command:', command);
            handleCommand(command);
        };

        recognition.onerror = (event) => {
            console.error("Speech recognition error", event.error);
            if (event.error !== 'no-speech' && event.error !== 'aborted') {
                 toast({ variant: 'destructive', title: 'Voice Error', description: `An error occurred: ${event.error}` });
            }
        };

        // This is crucial: if recognition stops for any reason (e.g. network error, long silence), restart it if we're supposed to be listening.
        recognition.onend = () => {
            if (listeningRef.current) {
                console.log("Recognition ended, restarting...");
                try {
                    recognition.start();
                } catch(e) {
                    console.error("Could not restart recognition:", e);
                }
            }
        };
    }

    const recognition = recognitionRef.current;

    const handleCommand = (command: string) => {
        if (command.includes('go to home')) {
            router.push('/');
            toast({ title: 'Navigating to Home' });
        } else if (command.includes('go to stores')) {
            router.push('/stores');
            toast({ title: 'Navigating to Stores' });
        } else if (command.includes('go to my orders')) {
            router.push('/dashboard/customer/my-orders');
            toast({ title: 'Navigating to My Orders' });
        } else if (command.includes('go to cart')) {
            router.push('/cart');
            toast({ title: 'Navigating to Cart' });
        } else if (command.includes('go to dashboard')) {
            router.push('/dashboard');
            toast({ title: 'Navigating to Dashboard' });
        }
    };

    if (enabled && !listeningRef.current) {
        try {
            recognition.start();
            listeningRef.current = true;
            console.log("Voice recognition started.");
        } catch(e) {
            console.error("Could not start recognition:", e);
        }
    } else if (!enabled && listeningRef.current) {
        try {
            recognition.stop();
            listeningRef.current = false;
            console.log("Voice recognition stopped.");
        } catch(e) {
            console.error("Could not stop recognition:", e);
        }
    }
    
  }, [enabled, router, toast]);


  return null; // This component does not render anything
}
