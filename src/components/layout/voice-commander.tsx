
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';

interface VoiceCommanderProps {
  enabled: boolean;
}

export function VoiceCommander({ enabled }: VoiceCommanderProps) {
  const router = useRouter();
  const { toast } = useToast();
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  // This ref tracks if we INTEND for it to be listening.
  const listeningIntentRef = useRef(false);

  useEffect(() => {
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

      recognition.onresult = (event) => {
        const lastResultIndex = event.results.length - 1;
        const command = event.results[lastResultIndex][0].transcript.toLowerCase().trim();
        console.log('Heard command:', command);
        handleCommand(command);
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error', event.error);
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          toast({ variant: 'destructive', title: 'Voice Error', description: `An error occurred: ${event.error}` });
        }
      };
      
      recognition.onend = () => {
        // Only restart if we intend for it to be listening.
        // This prevents restarting when we manually call .stop().
        if (listeningIntentRef.current) {
          console.log('Recognition service ended, restarting...');
          recognition.start();
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
    
    if (enabled) {
      listeningIntentRef.current = true;
      recognition.start();
      console.log('Voice recognition started.');
    } else {
      listeningIntentRef.current = false;
      recognition.stop();
      console.log('Voice recognition stopped.');
    }

    // Cleanup function to stop recognition when the component unmounts
    return () => {
        listeningIntentRef.current = false;
        if(recognitionRef.current) {
            recognitionRef.current.stop();
            console.log('Voice recognition stopped on component unmount.');
        }
    };

  }, [enabled, router, toast]);

  return null; // This component does not render anything
}
