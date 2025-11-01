'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';

interface VoiceCommanderProps {
  enabled: boolean;
  onStatusUpdate: (status: string) => void;
}

export function VoiceCommander({ enabled, onStatusUpdate }: VoiceCommanderProps) {
  const router = useRouter();
  const { toast } = useToast();
  const recognitionRef = useRef<SpeechRecognition | null>(null);

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
        if (enabled) {
            console.log('Recognition service ended, restarting...');
            try {
                recognition.start();
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

  }, [enabled, router, toast, onStatusUpdate]);

  return null; // This component does not render anything
}
