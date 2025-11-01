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

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      if (enabled) {
        toast({
          variant: 'destructive',
          title: 'Voice Not Supported',
          description: 'Your browser does not support the Web Speech API.',
        });
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
          console.log('Voice recognition started.');
      };

      recognition.onresult = (event) => {
        const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase().trim();
        console.log('Heard command:', transcript);
        handleCommand(transcript);
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error', event.error);
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          toast({ variant: 'destructive', title: 'Voice Error', description: `An error occurred: ${event.error}` });
        }
      };
      
      recognition.onend = () => {
        if (enabled) {
            console.log('Recognition service ended, restarting...');
            try {
                recognition.start();
            } catch(e) {
                console.error("Could not restart recognition service: ", e);
            }
        }
      };
    }
    
    const recognition = recognitionRef.current;

    const handleCommand = (command: string) => {
      const showToast = (title: string) => {
        toast({
            title: title,
            description: `Heard: "${command}"`
        });
      }

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
        // This can happen if it's already started.
        console.log("Could not start recognition, it may already be running.");
      }
    } else {
        recognition.stop();
        console.log('Voice recognition stopped.');
    }

    return () => {
        if(recognitionRef.current) {
            recognitionRef.current.onend = null; // Prevent restart on cleanup
            recognitionRef.current.stop();
        }
    };

  }, [enabled, router, toast]);

  return null; // This component does not render anything
}
