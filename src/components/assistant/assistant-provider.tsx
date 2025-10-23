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
import { getDocs, collection } from 'firebase/firestore';
import type { Product, Store } from '@/lib/types';
import { useCart } from '@/lib/cart';
import { useToast } from '@/hooks/use-toast';

type ConversationEntry = {
  speaker: 'user' | 'bot';
  text: string;
};

type AssistantState = {
  isListening: boolean;
  isThinking: boolean;
  isSpeaking: boolean;
  isAssistantOpen: boolean;
  conversation: ConversationEntry[];
  toggleAssistant: () => void;
};

type PendingAction = {
    intent: 'addProductToCart',
    product: Product
} | null;

const AssistantContext = createContext<AssistantState | undefined>(undefined);

export function AssistantProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { firestore } = useFirebase();
  const { addItem: addItemToCart } = useCart();
  const { toast } = useToast();

  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [conversation, setConversation] = useState<ConversationEntry[]>([]);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const speechRecognition = useRef<SpeechRecognition | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  const addToConversation = (entry: ConversationEntry) => {
    setConversation(prev => [...prev, entry]);
  };

  const speak = useCallback(async (text: string) => {
    if (!text) return;
    addToConversation({ speaker: 'bot', text });
    setIsThinking(true);
    setIsSpeaking(true);
    try {
      const audioDataUri = await textToSpeech(text);
      if (audio.current) {
        audio.current.src = audioDataUri;
        await audio.current.play();
      }
    } catch (error) {
      console.error('TTS Error:', error);
    } finally {
      setIsThinking(false);
      setIsSpeaking(false);
    }
  }, []);

  const handleCommand = useCallback(async (command: InterpretedCommand) => {
    setIsThinking(true);
    addToConversation({ speaker: 'user', text: command.originalText });

    // Handle confirmation for a pending action
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
        setIsThinking(false);
        return;
    }


    switch (command.intent) {
      case 'navigateTo':
        const page = command.entities.pageName?.toLowerCase();
        let path = '/';
        if (page?.includes('home')) path = '/';
        else if (page?.includes('stores')) path = '/stores';
        else if (page?.includes('cart')) path = '/cart';
        else if (page?.includes('my orders')) path = '/dashboard/my-orders';
        else if (page?.includes('my store')) path = '/dashboard/my-store';
        else {
            await speak(`Sorry, I don't know how to navigate to ${page}.`);
            break;
        }
        router.push(path);
        await speak(`Navigating to ${page}.`);
        setIsAssistantOpen(false);
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

        if (storeName) {
            const storesSnapshot = await getDocs(collection(firestore, 'stores'));
            const store = storesSnapshot.docs.find(doc => doc.data().name.toLowerCase() === storeName.toLowerCase());
            if (store) {
                storeId = store.id;
            } else {
                await speak(`Sorry, I could not find a store named ${storeName}.`);
                break;
            }
        } else {
            const storeIdFromPath = pathname.split('/stores/')[1];
            if (storeIdFromPath) {
                storeId = storeIdFromPath;
            } else {
                await speak("Which store are you interested in?");
                break;
            }
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

      default:
        await speak("Sorry, I didn't understand that. Can you please rephrase?");
        break;
    }
    setIsThinking(false);
  }, [firestore, pathname, router, speak, pendingAction, addItemToCart]);

  const processTranscript = useCallback(async (transcript: string) => {
    if (isThinking || isSpeaking) return;
    setIsListening(false);
    setIsThinking(true);
    try {
        const command = await interpretCommand(transcript);
        await handleCommand(command);
    } catch(e) {
        console.error("Error interpreting command:", e);
        speak("Sorry, I had trouble understanding that.");
    } finally {
        setIsThinking(false);
    }

  }, [isThinking, isSpeaking, handleCommand, speak]);

  const toggleAssistant = useCallback(() => {
    if (isAssistantOpen) {
      speechRecognition.current?.stop();
      audio.current?.pause();
      setIsAssistantOpen(false);
      setIsListening(false);
    } else {
      setConversation([]);
      setIsAssistantOpen(true);
      speechRecognition.current?.start();
    }
  }, [isAssistantOpen]);

  useEffect(() => {
    if(typeof window === 'undefined') return;

    audio.current = new Audio();
    audio.current.onended = () => {
      setIsSpeaking(false);
      if (isAssistantOpen) {
        speechRecognition.current?.start();
      }
    };

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      toast({
        variant: 'destructive',
        title: 'Voice not supported',
        description: 'Your browser does not support voice recognition.'
      });
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true; 
    recognition.interimResults = false;
    speechRecognition.current = recognition;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = (event) => {
        if(event.error !== 'no-speech') {
            console.error('Speech recognition error:', event.error);
        }
    };

    recognition.onresult = (event) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        finalTranscript += event.results[i][0].transcript;
      }
      if (finalTranscript.trim()) {
        recognition.stop();
        processTranscript(finalTranscript.trim());
      }
    };

    return () => {
        speechRecognition.current?.stop();
    }
  }, [processTranscript, toast, isAssistantOpen]);


  const value = {
    isListening,
    isThinking,
    isSpeaking,
    isAssistantOpen,
    conversation,
    toggleAssistant,
  };

  return (
    <AssistantContext.Provider value={value}>
      {children}
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
