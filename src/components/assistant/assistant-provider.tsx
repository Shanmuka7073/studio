
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

  const stopListening = useCallback(() => {
    if (speechRecognition.current) {
      try {
        speechRecognition.current.stop();
      } catch (e) {
        console.error("Speech recognition stop error: ", e);
      } finally {
        setIsListening(false);
      }
    }
  }, []);

  const startListening = useCallback(() => {
    if (speechRecognition.current && !isListening && !isSpeaking) {
      try {
        speechRecognition.current.start();
        setIsListening(true);
      } catch (e) {
         console.error("Speech recognition start error: ", e);
         setIsListening(false); 
      }
    }
  }, [isListening, isSpeaking]);


  const speak = useCallback(async (text: string) => {
    if (!text) return;
    setIsThinking(false);
    setIsSpeaking(true);
    addToConversation({ speaker: 'bot', text });
    try {
      const audioDataUri = await textToSpeech(text);
      if (audio.current) {
        audio.current.src = audioDataUri;
        await audio.current.play();
      }
    } catch (error) {
      console.error('TTS Error:', error);
      setIsSpeaking(false);
      // Still start listening even if TTS fails
      if(isAssistantOpen){
        startListening();
      }
    } 
  }, [isAssistantOpen, startListening]);

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
            else if (page?.includes('cart') || page?.includes('shopping cart')) path = '/cart';
            else if (page?.includes('my orders')) path = '/dashboard/my-orders';
            else if (page?.includes('my store')) path = '/dashboard/my-store';
            else if (page?.includes('store orders')) path = '/dashboard/orders';
            else if (page?.includes('deliveries')) path = '/dashboard/deliveries';
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
        if (pathSegments[0] === 'stores' && pathSegments.length > 1) {
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
      case 'confirm':
      case 'cancel':
        await speak("Sorry, there's nothing for me to confirm or cancel right now.");
        break;
      default:
        setIsThinking(false);
        break;
    }
  }, [firestore, pathname, router, speak, pendingAction, addItemToCart]);

  const processTranscript = useCallback(async (transcript: string) => {
    if (isThinking || isSpeaking) return;
    stopListening();
    setIsThinking(true);
    try {
        const command = await interpretCommand(transcript);
        await handleCommand(command);
    } catch(e) {
        console.error("Error interpreting command:", e);
        await speak("Sorry, I had trouble understanding that.");
    }
  }, [isThinking, isSpeaking, stopListening, handleCommand, speak]);

  const toggleAssistant = useCallback(() => {
    setIsAssistantOpen(prev => {
        const newIsOpen = !prev;
        if (newIsOpen) {
            startListening();
        } else {
            stopListening();
            if(audio.current) audio.current.pause();
        }
        return newIsOpen;
    });
  }, [startListening, stopListening]);

   useEffect(() => {
    if (!isUserLoading && user && !hasWelcomed && !isAssistantOpen) {
      const welcome = async () => {
        // We still set it open, but the user must click to start the interaction
        setIsAssistantOpen(true);
        setHasWelcomed(true); 
        await speak("Welcome back! How can I help you?");
      }
      welcome();
    }
    // If user logs out, reset the welcome flag
    if (!user) {
      setHasWelcomed(false);
      if (isAssistantOpen) {
        toggleAssistant(); // Turn off assistant on logout
      }
    }
   }, [user, isUserLoading, hasWelcomed, isAssistantOpen, speak, toggleAssistant])


  useEffect(() => {
    if(typeof window === 'undefined') return;

    if (!audio.current) {
      audio.current = new Audio();
      audio.current.onended = () => {
        setIsSpeaking(false);
        if (isAssistantOpen) {
          startListening();
        }
      };
    }
    

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      if(isAssistantOpen) { // Only toast if user tried to activate it
        toast({
            variant: 'destructive',
            title: 'Voice not supported',
            description: 'Your browser does not support voice recognition.'
        });
      }
      return;
    }

    if (!speechRecognition.current) {
        const recognition = new SpeechRecognitionAPI();
        recognition.continuous = false;
        recognition.interimResults = false;
        speechRecognition.current = recognition;

        recognition.onstart = () => {
            setIsListening(true);
        }
        
        recognition.onend = () => {
            setIsListening(false);
            if (isAssistantOpen && !isSpeaking && !isThinking) {
               startListening(); 
            }
        };

        recognition.onerror = (event) => {
            setIsListening(false);
            if (event.error !== 'no-speech' && event.error !== 'aborted') {
                console.error('Speech recognition error:', event.error);
                 toast({ variant: 'destructive', title: 'Voice Error', description: `An error occurred: ${event.error}` });
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
    }

    return () => {
        if (speechRecognition.current) {
          stopListening();
        }
        if (audio.current) {
            audio.current.pause();
        }
        if (silenceTimer.current) clearTimeout(silenceTimer.current);
    }
  }, [processTranscript, isAssistantOpen, isSpeaking, isThinking, startListening, stopListening, toast]);


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

    