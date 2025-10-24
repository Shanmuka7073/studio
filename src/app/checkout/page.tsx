'use client';

import { useCart } from '@/lib/cart';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import Image from 'next/image';
import { getProductImage } from '@/lib/data';
import { useTransition, useState, useRef, useCallback } from 'react';
import { useFirebase, errorEmitter } from '@/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { FirestorePermissionError } from '@/firebase/errors';
import { Mic, StopCircle, CheckCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';


const checkoutSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  address: z.string().min(10, 'Please enter a valid address'),
  phone: z.string().min(10, 'Please enter a valid phone number'),
});

type CheckoutFormValues = z.infer<typeof checkoutSchema>;

export default function CheckoutPage() {
  const { cartItems, cartTotal, clearCart } = useCart();
  const router = useRouter();
  const { toast } = useToast();
  const [isPlacingOrder, startPlaceOrderTransition] = useTransition();
  const { firestore, user } = useFirebase();

  const [isRecording, setIsRecording] = useState(false);
  const [audioDataUri, setAudioDataUri] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const speechRecognitionRef = useRef<SpeechRecognition | null>(null);

  const [isTranslating, startTranslationTransition] = useTransition();
  const [translatedList, setTranslatedList] = useState<string | null>(null);

  const processTranscript = useCallback((transcript: string) => {
    startTranslationTransition(() => {
        setTranslatedList(transcript);
        toast({ title: "Voice memo transcribed!", description: "Your shopping list has been converted to text." });
    });
  }, [toast]);


  const handleToggleRecording = () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      speechRecognitionRef.current?.stop();
      setIsRecording(false);
    } else {
      setAudioDataUri(null);
      setTranslatedList(null);
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
          
          // Audio recording part
          const recorder = new MediaRecorder(stream);
          mediaRecorderRef.current = recorder;
          audioChunksRef.current = [];
          recorder.ondataavailable = (event) => audioChunksRef.current.push(event.data);
          recorder.onstop = () => {
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);
            reader.onloadend = () => setAudioDataUri(reader.result as string);
            stream.getTracks().forEach(track => track.stop()); // Stop microphone
          };

          // Speech recognition part
          const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
          if (SpeechRecognition) {
            const recognition = new SpeechRecognition();
            speechRecognitionRef.current = recognition;
            recognition.continuous = true;
            recognition.interimResults = false;
            
            let fullTranscript = '';
            recognition.onresult = (event) => {
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    fullTranscript += event.results[i][0].transcript + ' ';
                }
            };

            recognition.onend = () => {
                if (fullTranscript.trim()) {
                    processTranscript(fullTranscript.trim());
                }
            };
            
            recognition.start();
          } else {
             toast({ variant: 'destructive', title: 'Not Supported', description: 'Voice transcription is not supported by your browser.' });
          }

          recorder.start();
          setIsRecording(true);
        })
        .catch(err => {
          toast({ variant: 'destructive', title: 'Microphone Error', description: 'Could not access the microphone. Please grant permission.' });
          console.error("Mic error:", err);
        });
    }
  };


  const form = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      name: '',
      address: '',
      phone: '',
    },
  });

  const onSubmit = (data: CheckoutFormValues) => {
    if (!firestore || !user) {
        toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in to place an order.' });
        return;
    }

    const isVoiceOrder = cartItems.length === 0 && !!audioDataUri;
    const storeId = cartItems[0]?.product.storeId;
    
    if (cartItems.length === 0 && !audioDataUri) {
        toast({ variant: 'destructive', title: 'Error', description: 'Your cart is empty and no voice memo is recorded. Add items or record a list.' });
        return;
    }
     if (!storeId && !isVoiceOrder) {
        toast({ variant: 'destructive', title: 'Error', description: 'Could not determine the store for this order.' });
        return;
    }

    startPlaceOrderTransition(async () => {
        const orderPayload = {
            userId: user.uid,
            customerName: data.name,
            deliveryAddress: data.address,
            phone: data.phone,
            email: user.email,
            orderDate: serverTimestamp(),
            totalAmount: cartTotal,
            status: 'Pending' as 'Pending',
        };

        let collectionName = 'orders';
        let orderData: any = {
            ...orderPayload,
            storeId: storeId,
            items: cartItems.map(item => ({
                productId: item.product.id,
                name: item.product.name,
                quantity: item.quantity,
                price: item.product.price,
            })),
        };

        if (isVoiceOrder) {
            collectionName = 'voice-orders';
            orderData = {
                ...orderPayload,
                totalAmount: 0, // Price to be confirmed by shopkeeper
                voiceMemoUrl: audioDataUri,
                translatedList: translatedList,
            };
        }


        const colRef = collection(firestore, collectionName);
        addDoc(colRef, orderData).then(() => {
            clearCart();
            toast({
                title: "Order Placed!",
                description: "Thank you for your purchase.",
            });
            router.push('/order-confirmation');
        }).catch((e) => {
             console.error('Error placing order:', e);
             const permissionError = new FirestorePermissionError({
                path: colRef.path,
                operation: 'create',
                requestResourceData: orderData
            });
            errorEmitter.emit('permission-error', permissionError);
        });
    });
  };

  if (cartItems.length === 0 && !audioDataUri) {
     return (
        <div className="container mx-auto py-24 px-4 md:px-6">
            <div className="grid md:grid-cols-2 gap-12 items-center">
                 <div>
                    <Card>
                        <CardHeader><CardTitle>Add Items to Checkout</CardTitle></CardHeader>
                        <CardContent className="text-center py-12">
                             <p className="text-muted-foreground mb-8">Your cart is empty. Add items from a store to get started.</p>
                             <Button asChild variant="outline">
                                <Link href="/stores">Browse Stores</Link>
                             </Button>
                        </CardContent>
                    </Card>
                </div>
                 <div>
                  <Card>
                    <CardHeader>
                      <CardTitle>Or Record Your Shopping List</CardTitle>
                      <CardDescription>No need to browse. Just tell us what you need, and a local shopkeeper will handle it.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center justify-center space-y-4 py-12">
                        <Button
                            onClick={handleToggleRecording}
                            variant={isRecording ? 'destructive' : 'default'}
                            size="lg"
                            className="w-48"
                          >
                            {isRecording ? <StopCircle className="mr-2 h-5 w-5" /> : <Mic className="mr-2 h-5 w-5" />}
                            {isRecording ? 'Stop Recording' : 'Record List'}
                        </Button>
                        <p className="text-sm text-muted-foreground text-center">Record your full shopping list. We'll convert it to text for the shopkeeper.</p>
                        <p className="text-xs text-muted-foreground/80 text-center">(Note: This action saves an audio recording to your order.)</p>
                     </CardContent>
                  </Card>
                 </div>
            </div>
        </div>
    )
  }

  return (
    <div className="container mx-auto py-12 px-4 md:px-6">
      <h1 className="text-4xl font-bold mb-8 font-headline">Checkout</h1>
      <div className="grid md:grid-cols-2 gap-12">
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Delivery Information</CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl>
                          <Input placeholder="John Doe" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Shipping Address</FormLabel>
                        <FormControl>
                          <Input placeholder="123 Green St, Springfield" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                   <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number</FormLabel>
                        <FormControl>
                          <Input placeholder="(555) 123-4567" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" disabled={isPlacingOrder} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground">
                    {isPlacingOrder ? 'Placing Order...' : 'Place Order'}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {audioDataUri && (
                    <div className="rounded-md border p-4 space-y-2">
                        <div className="flex items-center gap-2 font-medium">
                            <CheckCircle className="h-5 w-5 text-green-500" />
                            <p>Voice Memo Recorded</p>
                        </div>
                        <audio src={audioDataUri} controls className="w-full" />
                    </div>
                )}
                 {isTranslating && (
                    <div className="flex items-center justify-center text-muted-foreground p-4">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        <p>Processing your list...</p>
                    </div>
                 )}
                {translatedList && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Your Transcribed Shopping List</CardTitle>
                        </CardHeader>
                        <CardContent>
                             <pre className="text-sm whitespace-pre-wrap font-sans bg-muted/50 p-4 rounded-md">
                                {translatedList}
                            </pre>
                        </CardContent>
                    </Card>
                )}
                {cartItems.map(({product, quantity}) => {
                    const image = getProductImage(product.imageId);
                    return (
                        <div key={product.id} className="flex justify-between items-center">
                            <div className="flex items-center gap-4">
                                <Image src={image.imageUrl} alt={product.name} data-ai-hint={image.imageHint} width={48} height={48} className="rounded-md" />
                                <div>
                                    <p className="font-medium">{product.name}</p>
                                    <p className="text-sm text-muted-foreground">Qty: {quantity}</p>
                                </div>
                            </div>
                            <p>${(product.price * quantity).toFixed(2)}</p>
                        </div>
                    )
                })}
                 {cartItems.length === 0 && audioDataUri && (
                    <p className="text-muted-foreground text-sm text-center py-4">Your order will be fulfilled based on your voice memo. The final price will be confirmed by the shopkeeper.</p>
                )}
            </CardContent>
            <CardFooter className="flex justify-between font-bold text-lg">
                <span>Total</span>
                <span>${cartTotal.toFixed(2)}</span>
            </CardFooter>
          </Card>
           <Card className="mt-8">
            <CardHeader>
                <CardTitle>Voice Memo</CardTitle>
            </CardHeader>
             <CardContent className="flex flex-col items-center justify-center space-y-4">
                <Button
                    onClick={handleToggleRecording}
                    variant={isRecording ? 'destructive' : 'outline'}
                    size="lg"
                    className="w-48"
                  >
                    {isRecording ? <StopCircle className="mr-2 h-5 w-5" /> : <Mic className="mr-2 h-5 w-5" />}
                    {isRecording ? 'Stop Recording' : (audioDataUri ? 'Re-record' : 'Record List')}
                </Button>
                <p className="text-sm text-muted-foreground text-center">You can add special instructions or your full shopping list via voice.</p>
                 <p className="text-xs text-muted-foreground/80 text-center">(Note: This action saves an audio recording to your order.)</p>
             </CardContent>
           </Card>
        </div>
      </div>
    </div>
  );
}
