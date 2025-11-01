'use client';

import { useEffect, useState, useRef } from 'react';
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
      console.warn("Speech recognition not supported.");
      return;
    }

    if (!recognitionRef.current) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = 'en-IN';
        recognitionRef.current = recognition;

        recognition.onresult = (event) => {
            const last = event.results.length - 1;
            const command = event.results[last][0].transcript.toLowerCase().trim();
            console.log('Heard command:', command);

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
            } else {
                toast({ variant: 'destructive', title: 'Command not recognized', description: `I heard: "${command}"` });
            }
        };

        recognition.onerror = (event) => {
            console.error("Speech recognition error", event.error);
            if (event.error !== 'no-speech') {
                 toast({ variant: 'destructive', title: 'Voice Error', description: `An error occurred: ${event.error}` });
            }
        };
        
        recognition.onend = () => {
          if (isListening) {
             // If it stops unexpectedly, and we still want it to be listening, restart it.
            console.log("Recognition service ended, restarting...");
            recognition.start();
          }
        };
    }

    const recognition = recognitionRef.current;

    if (isListening) {
        console.log("Starting voice recognition...");
        recognition.start();
    } else {
        console.log("Stopping voice recognition...");
        recognition.stop();
    }
    
    // Cleanup function
    return () => {
        if(recognition) {
            console.log("Cleaning up voice recognition...");
            recognition.stop();
        }
    };

  }, [isListening, router, toast]);


  return null; // This component does not render anything
}
