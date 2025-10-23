
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
  isAssistantOpen: boolean; // Represents if the listening session is active
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
  const { firestore, user, isUserLoading } = useFirebase();
  const { addItem: addItemToCart } = useCart();
  const { toast } = useToast();

  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [conversation, setConversation] = useState<ConversationEntry[]>([]);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [hasWelcomed, setHasWelcomed] = useState(false);

  const speechRecognition = useRef<SpeechRecognition | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const silenceTimer = useRef<NodeJS.Timeout | null>(null);


  const addToConversation = (entry: ConversationEntry) => {
    setConversation(prev => [...prev, entry]);
  };

  const speak = useCallback(async (text: string) => {
    if (!text) return;
    addToConversation({ speaker: 'bot', text });
    setIsThinking(false);
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

        const pathSegments = pathname.split('/').filter(Boolean);
        if (pathSegments[0] === 'stores' && pathSegments[1]) {
            storeId = pathSegments[1];
        } else if (findStoreName) {
            const storesSnapshot = await getDocs(query(collection(firestore, 'stores'), where('name', '==', findStoreName)));
            if (!storesSnapshot.empty) {
                storeId = storesSnapshot.docs[0].id;
            } else {
                await speak(`Sorry, I could not find a store named ${findStoreName}.`);
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
      case 'unknown':
         await speak("Sorry, I didn't understand that. Can you please rephrase?");
         break;
      default:
        // This handles confirm/cancel when there's no pending action.
        await speak("Sorry, there's nothing for me to confirm or cancel right now.");
        break;
    }
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

  const startListening = useCallback(() => {
    if (speechRecognition.current && !isListening && !isSpeaking) {
      speechRecognition.current.start();
    }
  }, [isListening, isSpeaking]);

  const stopListening = useCallback(() => {
    if (speechRecognition.current) {
      speechRecognition.current.stop();
    }
  }, []);

  const toggleAssistant = useCallback(() => {
    if (isAssistantOpen) {
      stopListening();
      audio.current?.pause();
      setIsAssistantOpen(false);
    } else {
      setIsAssistantOpen(true);
      startListening();
    }
  }, [isAssistantOpen, startListening, stopListening]);

   useEffect(() => {
    if (!isUserLoading && user && !hasWelcomed && !isAssistantOpen) {
      const welcome = async () => {
        setIsAssistantOpen(true);
        setHasWelcomed(true); 
        await speak("Welcome back! How can I help you?");
      }
      welcome();
    }
    // If user logs out, reset the welcome flag
    if (!user) {
      setHasWelcomed(false);
    }
   }, [user, isUserLoading, hasWelcomed, isAssistantOpen, speak])


  useEffect(() => {
    if(typeof window === 'undefined') return;

    audio.current = new Audio();
    audio.current.onended = () => {
      setIsSpeaking(false);
      // Resume listening after speaking if the session is still active
      if (isAssistantOpen) {
        startListening();
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
    recognition.continuous = false; // We manually restart it for better control
    recognition.interimResults = false;
    speechRecognition.current = recognition;

    recognition.onstart = () => {
        if (silenceTimer.current) clearTimeout(silenceTimer.current);
        setIsListening(true);
    }
    
    recognition.onend = () => {
        setIsListening(false);
        if (isAssistantOpen && !isSpeaking && !isThinking) {
           startListening(); // Always try to restart if session is open
        }
    };

    recognition.onerror = (event) => {
        if(event.error === 'no-speech') {
            // After 2 seconds of no speech, prompt the user
            silenceTimer.current = setTimeout(async () => {
               await speak("I'm listening. Just tell me what you need.");
            }, 2000);
        } else if (event.error !== 'aborted') {
            console.error('Speech recognition error:', event.error);
        }
    };

    recognition.onresult = (event) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        finalTranscript += event.results[i][0].transcript;
      }
      if (finalTranscript.trim()) {
        stopListening(); 
        processTranscript(finalTranscript.trim());
      }
    };

    return () => {
        stopListening();
        if (audio.current) {
            audio.current.onended = null;
        }
         if (silenceTimer.current) clearTimeout(silenceTimer.current);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processTranscript, isAssistantOpen, isSpeaking, isThinking]);


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

    