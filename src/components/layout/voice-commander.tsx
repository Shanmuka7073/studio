
'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';

interface VoiceCommanderProps {
  isListening: boolean;
  onToggleListen: () => void;
}

export function VoiceCommander({ isListening, onToggleListen }: VoiceCommanderProps) {
  const router = useRouter();
  const { toast } = useToast();
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({
          variant: 'destructive',
          title: 'Voice Commands Not Supported',
          description: 'Your browser does not support the Web Speech API.',
      });
      return;
    }

    if (!recognitionRef.current) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = 'en-IN';
        recognitionRef.current = recognition;

        recognition.onresult = (event) => {
            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) {
                    const command = event.results[i][0].transcript.toLowerCase().trim();
                    console.log('Heard command:', command);
                    handleCommand(command);
                }
            }
        };

        recognition.onerror = (event) => {
            console.error("Speech recognition error", event.error);
            if (event.error !== 'no-speech' && event.error !== 'aborted') {
                 toast({ variant: 'destructive', title: 'Voice Error', description: `An error occurred: ${event.error}` });
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
    }

    if (isListening) {
        try {
            recognition.start();
            console.log("Voice recognition started.");
        } catch(e) {
            console.error("Could not start recognition:", e);
        }
    } else {
        try {
            recognition.stop();
            console.log("Voice recognition stopped.");
        } catch(e) {
            console.error("Could not stop recognition:", e);
        }
    }
    
    // Cleanup function
    return () => {
        if(recognition) {
            recognition.stop();
            console.log("Voice recognition cleaned up.");
        }
    };

  }, [isListening, router, toast]);


  return null; // This component does not render anything
}
