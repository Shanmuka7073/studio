'use client';

import { useCart } from '@/lib/cart';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription as UiCardDescription } from '@/components/ui/card';
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
  FormDescription,
} from '@/components/ui/form';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import Image from 'next/image';
import { getProductImage } from '@/lib/data';
import { useTransition, useState, useRef, useCallback, useEffect } from 'react';
import { useFirebase, errorEmitter } from '@/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { FirestorePermissionError } from '@/firebase/errors';
import { Mic, StopCircle, CheckCircle, Loader2, MapPin, AudioLines } from 'lucide-react';
import Link from 'next/link';
import { Textarea } from '@/components/ui/textarea';

const checkoutSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().min(10, 'Please enter a valid phone number'),
  voiceOrderText: z.string().optional(),
});

type CheckoutFormValues = z.infer<typeof checkoutSchema>;

const DELIVERY_FEE = 30;

// A component to render each summary item, now receiving image data directly
function OrderSummaryItem({ item, image }) {
    const { product, variant, quantity } = item;

    return (
        <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
                <Image src={image.imageUrl} alt={product.name} data-ai-hint={image.imageHint} width={48} height={48} className="rounded-md" />
                <div>
                    <p className="font-medium">{product.name} <span className="text-sm text-muted-foreground">({variant.weight})</span></p>
                    <p className="text-sm text-muted-foreground">Qty: {quantity}</p>
                </div>
            </div>
            <p>₹{(variant.price * quantity).toFixed(2)}</p>
        </div>
    );
}


export default function CheckoutPage() {
  const { cartItems, cartTotal, clearCart } = useCart();
  const router = useRouter();
  const { toast } = useToast();
  const [isPlacingOrder, startPlaceOrderTransition] = useTransition();
  const { firestore, user } = useFirebase();

  const [isRecording, setIsRecording] = useState(false);
  const [voiceOrderText, setVoiceOrderText] = useState('');
  const [recordedAudio, setRecordedAudio] = useState<Blob | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);


  const [deliveryCoords, setDeliveryCoords] = useState<{lat: number, lng: number} | null>(null);
  const [images, setImages] = useState({});

  useEffect(() => {
    const fetchImages = async () => {
        const imagePromises = cartItems.map(item => getProductImage(item.product.imageId));
        const resolvedImages = await Promise.all(imagePromises);
        const imageMap = cartItems.reduce((acc, item, index) => {
            acc[item.variant.sku] = resolvedImages[index];
            return acc;
        }, {});
        setImages(imageMap);
    };

    if (cartItems.length > 0) {
        fetchImages();
    }
  }, [cartItems]);

  const handleToggleRecording = () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        setIsRecording(true);
        setRecordedAudio(null);
        setVoiceOrderText('');

        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        audioChunksRef.current = [];

        recorder.ondataavailable = (event) => {
          audioChunksRef.current.push(event.data);
        };
        
        recorder.onstop = () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          setRecordedAudio(audioBlob);
          setIsRecording(false);
          stream.getTracks().forEach(track => track.stop());
        };

        recorder.start();
      }).catch(err => {
        toast({ variant: 'destructive', title: 'Microphone Error', description: 'Could not access the microphone. Please grant permission.' });
        console.error("Mic error:", err);
      });
  };
  
  const handleTranscribe = () => {
    if (!recordedAudio) {
      toast({ variant: 'destructive', title: 'No Recording', description: 'Please record your shopping list first.'});
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({ variant: 'destructive', title: 'Not Supported', description: 'Voice recognition is not supported by your browser.' });
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN'; // Set language for better accuracy
    recognition.continuous = false;
    recognition.interimResults = false;

    // A hacky way to use the API with a blob
    // This is not standard but works in some Chrome versions
    try {
        // @ts-ignore
        recognition.audio = recordedAudio;
    } catch (e) {
        console.warn("Could not set audio source for recognition. It may still work with the microphone feed if timed correctly, but it is not ideal.");
    }
    
    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setVoiceOrderText(transcript);
        toast({ title: "Transcription Complete!", description: "Your voice memo has been converted to text."});
    };

    recognition.onerror = (event) => {
        toast({ variant: 'destructive', title: 'Transcription Error', description: `Could not understand the audio: ${event.error}` });
        console.error("Transcription error:", event.error);
    };

    recognition.start();
  };


  const form = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      name: '',
      phone: '',
      voiceOrderText: '',
    },
  });

  useEffect(() => {
    form.setValue('voiceOrderText', voiceOrderText);
  }, [voiceOrderText, form]);

   const handleGetLocation = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setDeliveryCoords({
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    });
                    toast({ title: "Location Fetched!", description: "Your current location has been captured for delivery." });
                },
                () => {
                    toast({ variant: 'destructive', title: "Location Error", description: "Could not retrieve your location. Please enter your address manually and ensure permissions are enabled." });
                }
            );
        } else {
            toast({ variant: 'destructive', title: "Not Supported", description: "Geolocation is not supported by your browser." });
        }
    };

  const onSubmit = (data: CheckoutFormValues) => {
    if (!firestore || !user) {
        toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in to place an order.' });
        return;
    }
    if (!deliveryCoords) {
        toast({ variant: 'destructive', title: 'Location Required', description: 'Please capture your current location for delivery.' });
        return;
    }

    const isVoiceOrder = cartItems.length === 0 && !!data.voiceOrderText;
    const storeId = cartItems[0]?.product.storeId;
    
    if (cartItems.length === 0 && !isVoiceOrder) {
        toast({ variant: 'destructive', title: 'Error', description: 'Your cart is empty and no voice order is provided. Add items or record a list.' });
        return;
    }
     if (!storeId && !isVoiceOrder) {
        toast({ variant: 'destructive', title: 'Error', description: 'Could not determine the store for this order.' });
        return;
    }

    startPlaceOrderTransition(async () => {
        const totalAmount = isVoiceOrder ? DELIVERY_FEE : cartTotal + DELIVERY_FEE;
        
        let collectionName = 'orders';
        
        let orderData: any = {
            userId: user.uid,
            customerName: data.name,
            deliveryAddress: 'Delivery via captured GPS coordinates',
            deliveryLat: deliveryCoords.lat,
            deliveryLng: deliveryCoords.lng,
            phone: data.phone,
            email: user.email,
            orderDate: serverTimestamp(),
            status: 'Pending' as 'Pending',
            totalAmount,
        };

        if (isVoiceOrder) {
            orderData.translatedList = data.voiceOrderText; // Save the transcribed text
        } else {
            orderData.storeId = storeId;
            orderData.items = cartItems.map(item => ({
                productId: item.product.id,
                productName: item.product.name,
                variantSku: item.variant.sku,
                variantWeight: item.variant.weight,
                quantity: item.quantity,
                price: item.variant.price,
            }));
        }
        
        if (isVoiceOrder) {
            collectionName = 'voice-orders';
            delete orderData.items; // No items in voice order
        }

        const colRef = collection(firestore, collectionName);
        addDoc(colRef, orderData).then(() => {
            clearCart();
            setVoiceOrderText('');
            setDeliveryCoords(null);
            form.reset();

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

  if (cartItems.length === 0 && !recordedAudio && !voiceOrderText) {
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
                      <UiCardDescription>No need to browse. Just tell us what you need, and a local shopkeeper will handle it.</UiCardDescription>
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
                        <p className="text-sm text-muted-foreground text-center">Record your full shopping list. We'll attach the text to your order for the shopkeeper.</p>
                     </CardContent>
                  </Card>
                 </div>
            </div>
        </div>
    )
  }

  const finalTotal = cartItems.length > 0 ? cartTotal + DELIVERY_FEE : DELIVERY_FEE;

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
                   <div className="space-y-2">
                        <FormLabel>Delivery Location</FormLabel>
                         <FormDescription>
                            Your precise delivery location will be based on your captured GPS coordinates.
                         </FormDescription>
                        <div className="flex items-center gap-4 pt-2">
                            <Button type="button" variant="outline" onClick={handleGetLocation} className="flex-1">
                                <MapPin className="mr-2 h-4 w-4" /> Get Current Location
                            </Button>
                            {deliveryCoords && (
                                <div className="flex items-center text-green-600">
                                    <CheckCircle className="mr-2 h-5 w-5" />
                                    <span>Location captured!</span>
                                </div>
                            )}
                        </div>
                   </div>
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
                  {(voiceOrderText || recordedAudio) && (
                    <FormField
                      control={form.control}
                      name="voiceOrderText"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Your Transcribed Shopping List</FormLabel>
                          <FormControl>
                            <Textarea {...field} rows={5} readOnly={!voiceOrderText} placeholder={recordedAudio && !voiceOrderText ? "Your recording is ready. Click 'Transcribe' to see the text." : "Your transcribed text will appear here."} />
                          </FormControl>
                          <FormDescription>
                            You can edit the transcribed text here before placing the order.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
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
                {cartItems.map((item) => {
                    const image = images[item.variant.sku] || { imageUrl: 'https://placehold.co/48x48/E2E8F0/64748B?text=...', imageHint: 'loading' };
                    return <OrderSummaryItem key={item.variant.sku} item={item} image={image} />
                })}
                 {cartItems.length > 0 && (
                    <>
                        <div className="flex justify-between items-center border-t pt-4">
                            <p className="font-medium">Subtotal</p>
                            <p>₹{cartTotal.toFixed(2)}</p>
                        </div>
                        <div className="flex justify-between items-center">
                            <p className="font-medium">Delivery Fee</p>
                            <p>₹{DELIVERY_FEE.toFixed(2)}</p>
                        </div>
                    </>
                 )}
                 {cartItems.length === 0 && (voiceOrderText || recordedAudio) && (
                    <div>
                        <p className="text-muted-foreground text-sm text-center py-4">Your order will be fulfilled based on the transcribed text. The final price will be confirmed by the shopkeeper.</p>
                        <div className="flex justify-between items-center">
                            <p className="font-medium">Delivery Fee</p>
                            <p>₹{DELIVERY_FEE.toFixed(2)}</p>
                        </div>
                    </div>
                )}
            </CardContent>
            <CardFooter className="flex justify-between font-bold text-lg">
                <span>Total</span>
                <span>₹{finalTotal.toFixed(2)}</span>
            </CardFooter>
          </Card>
           <Card className="mt-8">
            <CardHeader>
                <CardTitle>Voice Shopping List</CardTitle>
            </CardHeader>
             <CardContent className="flex flex-col items-center justify-center space-y-4">
                <Button
                    onClick={handleToggleRecording}
                    variant={isRecording ? 'destructive' : 'outline'}
                    size="lg"
                    className="w-48"
                  >
                    {isRecording ? <StopCircle className="mr-2 h-5 w-5" /> : <Mic className="mr-2 h-5 w-5" />}
                    {isRecording ? 'Stop Recording' : (recordedAudio ? 'Re-record List' : 'Record List')}
                </Button>
                
                {recordedAudio && (
                    <Button onClick={handleTranscribe} size="lg" className="w-48">
                        <AudioLines className="mr-2 h-5 w-5" />
                        Transcribe
                    </Button>
                )}
                
                <p className="text-sm text-muted-foreground text-center">
                    {recordedAudio ? "Click 'Transcribe' to convert your recording to text." : "You can add special instructions or your full shopping list via voice."}
                </p>
             </CardContent>
           </Card>
        </div>
      </div>
    </div>
  );
}
    