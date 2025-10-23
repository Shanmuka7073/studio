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
  const wasManuallyStopped = useRef(false);

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
       setIsThinking(false);
       setIsSpeaking(false);
    } 
  }, []);

  const handleCommand = useCallback(async (command: InterpretedCommand) => {
    setIsThinking(true);
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
        setIsThinking(false);
        return;
    }


    switch (command.intent) {
      case 'navigateTo':
        const page = command.entities.pageName?.toLowerCase();
        const storeName = command.entities.storeName;
        let path = '/';

        if (storeName && firestore) {
            const storesSnapshot = await getDocs(query(collection(firestore, 'stores'), where('name', '==', storeName)));
            if (!storesSnapshot.empty) {
                const store = storesSnapshot.docs[0];
                path = `/stores/${store.id}`;
                router.push(path);
                await speak(`Navigating to ${storeName}.`);
                setIsAssistantOpen(false);
            } else {
                 await speak(`Sorry, I could not find a store named ${storeName}.`);
            }
        } else if (page) {
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
        } else {
             await speak("I'm not sure where you want to go. Please specify a page or a store.");
        }
        break;
      
      case 'findProduct':
        if (!firestore) {
            await speak("Sorry, I can't search for products right now. The database is not connected.");
            break;
        }
        const { productName, storeName: findStoreName } = command.entities;
        if (!productName) {
            await speak("What product are you looking for?");
            break;
        }
        
        let storeId: string | null = null;
        let identifiedStoreName = '';

        if (findStoreName) {
            const storesSnapshot = await getDocs(query(collection(firestore, 'stores'), where('name', '==', findStoreName)));
            if (!storesSnapshot.empty) {
                const store = storesSnapshot.docs[0];
                storeId = store.id;
                identifiedStoreName = store.data().name;
            } else {
                await speak(`Sorry, I could not find a store named ${findStoreName}.`);
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
        await speak("Sorry, I had trouble understanding that.");
    } finally {
        setIsThinking(false);
    }

  }, [isThinking, isSpeaking, handleCommand, speak]);

  const toggleAssistant = useCallback(() => {
    if (isAssistantOpen) {
      wasManuallyStopped.current = true;
      speechRecognition.current?.stop();
      audio.current?.pause();
      setIsAssistantOpen(false);
    } else {
      setConversation([]);
      setIsAssistantOpen(true);
      wasManuallyStopped.current = false;
      speechRecognition.current?.start();
    }
  }, [isAssistantOpen]);

  useEffect(() => {
    if(typeof window === 'undefined') return;

    audio.current = new Audio();
    audio.current.onended = () => {
      setIsSpeaking(false);
      // Restart listening only if the assistant is supposed to be open
      if (isAssistantOpen && !wasManuallyStopped.current) {
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
    recognition.continuous = false; // Process one phrase at a time
    recognition.interimResults = false;
    speechRecognition.current = recognition;

    recognition.onstart = () => {
        setIsListening(true);
    }
    
    recognition.onend = () => {
        setIsListening(false);
        // Auto-restart listening if it wasn't manually stopped
        if (isAssistantOpen && !wasManuallyStopped.current && !isSpeaking) {
            recognition.start();
        }
    };

    recognition.onerror = (event) => {
        if(event.error !== 'no-speech' && event.error !== 'aborted') {
            console.error('Speech recognition error:', event.error);
        }
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

    return () => {
        wasManuallyStopped.current = true;
        speechRecognition.current?.stop();
    }
  }, [processTranscript, toast, isAssistantOpen, isSpeaking]);


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
