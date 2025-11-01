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
        // Only restart if we are still in the 'enabled' state.
        // This check is implicitly handled by the dependency array and the main `if(enabled)` block.
        // If the 'enabled' prop becomes false, the cleanup function runs, stopping recognition.
        // If it stops for another reason (e.g., network error), this restart logic is essential.
        if (enabled) {
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
      recognition.start();
    }

    // Cleanup function to stop recognition when the component unmounts or is disabled
    return () => {
        if(recognitionRef.current) {
            recognitionRef.current.stop();
            console.log('Voice recognition stopped.');
        }
    };

  }, [enabled, router, toast]);

  return null; // This component does not render anything
}
