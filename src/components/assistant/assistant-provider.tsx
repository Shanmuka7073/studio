
'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  ReactNode,
} from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { textToSpeech } from '@/ai/flows/tts-flow';
import { interpretCommand, InterpretedCommand } from '@/ai/flows/nlu-flow';
import { useFirebase } from '@/firebase';
import { getDocs, collection, query, where } from 'firebase/firestore';
import type { Product, Store } from '@/lib/types';
import { useCart } from '@/lib/cart';
import { useToast } from '@/hooks/use-toast';
import { AssistantStatusBar } from './assistant-status-bar';

type ConversationEntry = {
  speaker: 'user' | 'bot';
  text: string;
};

export type AssistantStatus = 'idle' | 'listening' | 'thinking' | 'speaking';

type AssistantState = {
  status: AssistantStatus;
  conversation: ConversationEntry[];
  lastBotResponse: string;
  toggleListening: () => void;
};

const AssistantContext = createContext<AssistantState | undefined>(undefined);

export function AssistantProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { firestore, user } = useFirebase();
  const { addItem: addItemToCart } = useCart();
  const { toast } = useToast();

  const [status, setStatus] = useState<AssistantStatus>('idle');
  const [conversation, setConversation] = useState<ConversationEntry[]>([]);
  const [lastBotResponse, setLastBotResponse] = useState('');
  const [pendingAction, setPendingAction] = useState<any>(null);
  
  const speechRecognition = useRef<SpeechRecognition | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  const addToConversation = (entry: ConversationEntry) => {
    setConversation(prev => [...prev, entry]);
    if (entry.speaker === 'bot') {
      setLastBotResponse(entry.text);
    }
  };

  const stopListening = useCallback(() => {
    if (speechRecognition.current) {
      try {
        speechRecognition.current.stop();
      } catch (e) {
        console.error("Speech recognition stop error: ", e);
      } finally {
        setStatus('idle');
      }
    }
  }, []);

  const speak = useCallback(async (text: string) => {
    if (!text) return;
    setStatus('speaking');
    addToConversation({ speaker: 'bot', text });
    try {
      const audioDataUri = await textToSpeech(text);
      if (audio.current) {
        audio.current.src = audioDataUri;
        await audio.current.play();
      }
    } catch (error) {
      console.error('TTS Error:', error);
      setStatus('idle');
    }
  }, []);

  const handleCommand = useCallback(async (command: InterpretedCommand) => {
    setStatus('thinking');
    addToConversation({ speaker: 'user', text: command.originalText });

    if (pendingAction && (command.intent === 'confirm' || command.intent === 'cancel')) {
      if (command.intent === 'confirm') {
        if (pendingAction.intent === 'addProductToCart') {
          addItemToCart(pendingAction.product);
          await speak(`Okay, I've added ${pendingAction.product.name} to your cart. What's next?`);
        }
      } else {
        await speak("Okay, I've cancelled that. What else can I help you with?");
      }
      setPendingAction(null);
      return;
    }

    switch (command.intent) {
      case 'navigateTo':
        const page = command.entities.pageName?.toLowerCase();
        let path = '/';

        if (page) {
          if (page.includes('home')) path = '/';
          else if (page.includes('stores')) path = '/stores';
          else if (page.includes('cart') || page.includes('shopping cart')) path = '/cart';
          else if (page.includes('my orders')) path = '/dashboard/my-orders';
          else if (page.includes('my store')) path = '/dashboard/my-store';
          else if (page.includes('store orders')) path = '/dashboard/orders';
          else if (page.includes('deliveries')) path = '/dashboard/deliveries';
          else {
            await speak(`Sorry, I don't know how to navigate to ${page}.`);
            break;
          }
          router.push(path);
          await speak(`Navigating to ${page}.`);
        } else {
          await speak("I'm not sure where you want to go. Please specify a page or a store.");
        }
        break;
      
      case 'findProduct':
        if (!firestore) {
          await speak("Sorry, I can't search for products right now. The database is not connected.");
          break;
        }
        const { productName, storeName } = command.entities;
        if (!productName) {
          await speak("What product are you looking for?");
          break;
        }
        
        let storeId: string | null = null;
        const pathSegments = pathname.split('/').filter(Boolean);
        if (pathSegments[0] === 'stores' && pathSegments.length > 1) {
          storeId = pathSegments[1];
        } else if (storeName) {
          try {
            const storesSnapshot = await getDocs(query(collection(firestore, 'stores'), where('name', '==', storeName)));
            if (!storesSnapshot.empty) {
              storeId = storesSnapshot.docs[0].id;
            } else {
              await speak(`Sorry, I could not find a store named ${storeName}.`);
              break;
            }
          } catch (e) {
            console.error("Error finding store by name:", e);
            await speak("I had trouble looking up that store.");
            break;
          }
        } else {
          await speak("Which store are you interested in?");
          break;
        }

        if (storeId) {
          const productsSnapshot = await getDocs(collection(firestore, 'stores', storeId, 'products'));
          const products = productsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as Product[];
          const foundProduct = products.find(p => p.name.toLowerCase().includes(productName.toLowerCase()));

          if (foundProduct) {
            setPendingAction({ intent: 'addProductToCart', product: foundProduct });
            await speak(`I found ${foundProduct.name} for $${foundProduct.price.toFixed(2)}. Should I add it to your cart?`);
          } else {
            await speak(`I couldn't find ${productName} in this store.`);
          }
        }
        break;

      case 'addProductToCart':
        await speak("Sorry, I need to find a product first before adding it to the cart.");
        break;

      case 'unknown':
        await speak("Sorry, I didn't understand that. Can you please rephrase?");
        break;
      case 'confirm':
      case 'cancel':
        await speak("Sorry, there's nothing for me to confirm or cancel right now.");
        break;
      default:
        setStatus('idle');
        break;
    }
  }, [firestore, pathname, router, speak, pendingAction, addItemToCart]);

  const processTranscript = useCallback(async (transcript: string) => {
    if (status === 'thinking' || status === 'speaking') return;
    stopListening();
    setStatus('thinking');
    try {
      const command = await interpretCommand(transcript);
      await handleCommand(command);
    } catch(e) {
      console.error("Error interpreting command:", e);
      await speak("Sorry, I had trouble understanding that.");
    }
  }, [status, stopListening, handleCommand, speak]);
  
  const startListening = useCallback(() => {
    // Add a guard to prevent starting if not idle.
    if (status !== 'idle' || !user) return;
  
    if (speechRecognition.current) {
      try {
        speechRecognition.current.start();
        setStatus('listening');
      } catch (e) {
        // This can happen if start() is called while it's already starting.
        // It's safe to ignore in this context.
        if (e instanceof DOMException && e.name === 'InvalidStateError') {
           console.warn('Speech recognition already starting. Ignoring redundant call.');
        } else {
          console.error("Speech recognition start error: ", e);
          setStatus('idle');
        }
      }
    }
  }, [status, user]);

  const toggleListening = useCallback(() => {
    if (status === 'listening') {
      stopListening();
    } else {
      startListening();
    }
  }, [status, startListening, stopListening]);


  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!audio.current) {
      audio.current = new Audio();
      audio.current.onended = () => {
        setStatus('idle');
      };
    }

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      console.warn("Voice recognition not supported by this browser.");
      return;
    }

    if (!speechRecognition.current) {
      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = false;
      recognition.interimResults = false;
      speechRecognition.current = recognition;

      recognition.onstart = () => {
        setStatus('listening');
      };
      
      recognition.onend = () => {
        // Check if the status is still 'listening' before setting to 'idle'
        // This avoids race conditions if the status was changed by another process
        if (statusRef.current === 'listening') {
          setStatus('idle');
        }
      };

      recognition.onerror = (event) => {
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          console.error('Speech recognition error:', event.error);
          if (event.error === 'not-allowed') {
            toast({ variant: 'destructive', title: 'Microphone permission denied', description: "Please enable microphone access in your browser settings." });
          } else {
            toast({ variant: 'destructive', title: 'Voice Error', description: `An error occurred: ${event.error}` });
          }
        }
        setStatus('idle');
      };

      recognition.onresult = (event) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          finalTranscript += event.results[i][0].transcript;
        }
        if (finalTranscript.trim()) {
          processTranscript(finalTranscript.trim());
        }
      };
    }
    
    // Create a ref to hold the current status to check in onend handler
    const statusRef = React.useRef(status);
    statusRef.current = status;

  }, [processTranscript, toast, status]);


  const value = {
    status,
    conversation,
    lastBotResponse,
    toggleListening,
  };

  return (
    <AssistantContext.Provider value={value}>
      {children}
      {user && status !== 'idle' && <AssistantStatusBar status={status} lastBotResponse={lastBotResponse} />}
    </AssistantContext.Provider>
  );
}

export function useAssistant() {
  const context = useContext(AssistantContext);
  if (context === undefined) {
    throw new Error('useAssistant must be used within an AssistantProvider');
  }
  return context;
}
