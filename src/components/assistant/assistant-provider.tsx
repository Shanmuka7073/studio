
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
import { transcribeAndTranslate } from '@/ai/flows/transcribe-translate-flow';
import { getRecipeIngredients } from '@/ai/flows/recipe-ingredients-flow';
import { useFirebase } from '@/firebase';
import { getDocs, collection, query, where, addDoc, serverTimestamp } from 'firebase/firestore';
import type { Product, Store } from '@/lib/types';
import { useCart } from '@/lib/cart';
import { useToast } from '@/hooks/use-toast';
import { AssistantStatusBar } from './assistant-status-bar';
import { VoiceOrderConfirmationDialog } from './voice-order-confirmation-dialog';

type ConversationEntry = {
  speaker: 'user' | 'bot';
  text: string;
};

export type AssistantStatus = 'idle' | 'listening' | 'thinking' | 'speaking';

type VoiceOrderState = {
  audioDataUri: string;
  translatedList: string;
  isConfirming: boolean;
  recipeIngredients?: string[];
  dishName?: string;
};

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
  const [voiceOrderState, setVoiceOrderState] = useState<VoiceOrderState | null>(null);

  const speechRecognition = useRef<SpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audio = useRef<HTMLAudioElement | null>(null);

  const statusRef = useRef(status);
  statusRef.current = status;

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
        if (statusRef.current === 'listening') {
          setStatus('idle');
        }
      }
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
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

  const handleCreateVoiceOrder = async (audioDataUri: string) => {
      setStatus('thinking');
      try {
        const result = await transcribeAndTranslate(audioDataUri);
        if (result) {
          setVoiceOrderState({
            audioDataUri,
            translatedList: result.bilingualList,
            isConfirming: true,
          });
          await speak('Here is the shopping list I understood. Please confirm to place the order.');
        } else {
          await speak("Sorry, I couldn't process the audio. Please try recording again.");
        }
      } catch (error) {
        console.error('Transcription/Translation Error:', error);
        await speak('There was an error processing your voice memo. Please try again.');
      }
  }

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
          else if (page.includes('my orders')) path = '/dashboard/customer/my-orders';
          else if (page.includes('my store')) path = '/dashboard/owner/my-store';
          else if (page.includes('store orders')) path = '/dashboard/owner/orders';
          else if (page.includes('deliveries')) path = '/dashboard/delivery/deliveries';
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
      
      case 'createVoiceOrder':
        await speak("Okay, I'm ready. Please state your full shopping list now.");
        // The `onend` of the speech recognition will trigger the recording.
        break;

      case 'getRecipeIngredients':
        if (!command.entities.dishName) {
            await speak("What dish would you like the ingredients for?");
            break;
        }
        try {
            const result = await getRecipeIngredients(command.entities.dishName);
            if (result && result.ingredients.length > 0) {
                setVoiceOrderState({
                    audioDataUri: '', // No audio for this type of order
                    translatedList: result.ingredients.join('\n'),
                    isConfirming: true,
                    recipeIngredients: result.ingredients,
                    dishName: result.dishName,
                });
                await speak(`Here are the ingredients for ${result.dishName}. Should I create a shopping list for you?`);
            } else {
                await speak(`Sorry, I couldn't find any ingredients for ${command.entities.dishName}.`);
            }
        } catch (error) {
            console.error('Recipe Ingredients Error:', error);
            await speak(`I had trouble finding ingredients for ${command.entities.dishName}.`);
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

  const startVoiceOrderRecording = useCallback(() => {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        audioChunksRef.current = [];
        recorder.ondataavailable = (event) => audioChunksRef.current.push(event.data);
        
        recorder.onstop = () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = () => {
              if (reader.result) {
                handleCreateVoiceOrder(reader.result as string);
              }
          };
          stream.getTracks().forEach(track => track.stop());
        };
        
        recorder.start();
        
        // Auto-stop recording after a delay of user not speaking
        const speechRecognitionForSilence = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
        speechRecognitionForSilence.continuous = false;
        speechRecognitionForSilence.interimResults = true;
        let silenceTimeout: NodeJS.Timeout;

        speechRecognitionForSilence.onresult = () => {
            clearTimeout(silenceTimeout);
            silenceTimeout = setTimeout(() => {
                stopRecording();
                speechRecognitionForSilence.stop();
            }, 2000); // 2 seconds of silence
        };

        speechRecognitionForSilence.onstart = () => {
             clearTimeout(silenceTimeout);
             silenceTimeout = setTimeout(() => {
                stopRecording();
                speechRecognitionForSilence.stop();
             }, 4000); // Stop after 4s if user says nothing.
        }

        speechRecognitionForSilence.start();

      })
      .catch(err => {
        toast({ variant: 'destructive', title: 'Microphone Error', description: 'Could not access the microphone. Please grant permission.' });
        console.error("Mic error:", err);
      });
  }, [stopRecording, toast]);


  const processTranscript = useCallback(async (transcript: string) => {
    if (statusRef.current === 'thinking' || statusRef.current === 'speaking') return;
    stopListening();
    setStatus('thinking');
    try {
      const command = await interpretCommand(transcript);
      if (command.intent === 'createVoiceOrder') {
        await handleCommand(command);
        startVoiceOrderRecording();
      } else {
        await handleCommand(command);
      }
    } catch (e) {
      console.error("Error interpreting command:", e);
      await speak("Sorry, I had trouble understanding that.");
    }
  }, [stopListening, handleCommand, speak, startVoiceOrderRecording]);

  const startListening = useCallback(() => {
    if (statusRef.current !== 'idle' || !user) return;

    if (speechRecognition.current) {
      try {
        speechRecognition.current.start();
        setStatus('listening');
      } catch (e) {
        if (e instanceof DOMException && e.name === 'InvalidStateError') {
          console.warn('Speech recognition already starting. Ignoring redundant call.');
        } else {
          console.error("Speech recognition start error: ", e);
          setStatus('idle');
        }
      }
    }
  }, [user]);

  const toggleListening = useCallback(() => {
    if (statusRef.current === 'listening') {
      stopListening();
    } else {
      startListening();
    }
  }, [startListening, stopListening]);


  useEffect(() => {
    try {
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
          if (statusRef.current === 'idle') {
            setStatus('listening');
          }
        };

        recognition.onend = () => {
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
          if (statusRef.current !== 'idle') {
            setStatus('idle');
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
    } catch (e) {
      console.error("Error initializing speech recognition:", e);
    }
  }, [processTranscript, toast]);

  const handleVoiceOrderConfirm = async () => {
    if (!voiceOrderState || !user || !firestore) return;
    
    setStatus('thinking');
    setVoiceOrderState(prev => prev ? { ...prev, isConfirming: false } : null);

    const orderPayload = {
      userId: user.uid,
      customerName: user.displayName || 'Unknown',
      deliveryAddress: 'To be confirmed',
      orderDate: serverTimestamp(),
      totalAmount: 0, // To be confirmed by shopkeeper
      status: 'Pending' as 'Pending',
      email: user.email,
      phone: user.phoneNumber || 'Not provided',
      voiceMemoUrl: voiceOrderState.audioDataUri,
      translatedList: voiceOrderState.translatedList,
    };

    try {
      await addDoc(collection(firestore, 'voice-orders'), orderPayload);
      toast({
        title: "Voice Order Placed!",
        description: "A local shopkeeper will review your order shortly.",
      });
      await speak("Great! Your voice order has been placed. You can view it in your 'My Orders' section.");
    } catch (e) {
      console.error("Error placing voice order:", e);
      toast({ variant: "destructive", title: "Order Failed", description: "Could not save your voice order. Please try again." });
      await speak("I'm sorry, there was an error and I couldn't place your order. Please try again.");
    } finally {
        setStatus('idle');
    }
  };

  const handleVoiceOrderCancel = async () => {
    setVoiceOrderState(null);
    await speak("Okay, I've cancelled the order.");
  };

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
      {voiceOrderState?.isConfirming && (
        <VoiceOrderConfirmationDialog
          isOpen={voiceOrderState.isConfirming}
          onClose={() => setVoiceOrderState(prev => prev ? { ...prev, isConfirming: false } : null)}
          onConfirm={handleVoiceOrderConfirm}
          onCancel={handleVoiceOrderCancel}
          list={voiceOrderState.translatedList}
          audioDataUri={voiceOrderState.audioDataUri}
          listTitle={voiceOrderState.dishName ? `Ingredients for ${voiceOrderState.dishName}` : 'Transcribed Shopping List'}
          isRecipe={!!voiceOrderState.recipeIngredients}
        />
      )}
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
