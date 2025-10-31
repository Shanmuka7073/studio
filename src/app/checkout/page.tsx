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
import { Mic, StopCircle, CheckCircle, MapPin, Loader2, Bot } from 'lucide-react';
import Link from 'next/link';
import { Textarea } from '@/components/ui/textarea';
import { ShoppingListItem, understandShoppingList } from '@/ai/flows/nlu-flow';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const checkoutSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().min(10, 'Please enter a valid phone number'),
  shoppingList: z.string().optional(),
});

type CheckoutFormValues = z.infer<typeof checkoutSchema>;

const DELIVERY_FEE = 30;

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

  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [structuredList, setStructuredList] = useState<ShoppingListItem[]>([]);
  
  const speechRecognitionRef = useRef<SpeechRecognition | null>(null);

  const [deliveryCoords, setDeliveryCoords] = useState<{lat: number, lng: number} | null>(null);
  const [images, setImages] = useState({});

  const form = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      name: '',
      phone: '',
      shoppingList: '',
    },
  });

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

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        speechRecognitionRef.current = new SpeechRecognition();
        const recognition = speechRecognitionRef.current;
        recognition.continuous = true;
        recognition.interimResults = true;
        
        recognition.onstart = () => {
            setIsListening(true);
        };

        recognition.onresult = (event) => {
            let finalTranscript = '';
            // Iterate through all results from the beginning to build the full transcript
            for (let i = 0; i < event.results.length; ++i) {
                finalTranscript += event.results[i][0].transcript;
            }
            // Update the form value with the complete, rebuilt transcript
            form.setValue('shoppingList', finalTranscript);
        };

        recognition.onerror = (event) => {
            console.error("Speech recognition error:", event.error);
            if (event.error !== 'aborted' && event.error !== 'no-speech') {
              toast({ variant: 'destructive', title: 'Voice Error', description: `An error occurred: ${event.error}` });
            }
            setIsListening(false);
        };

        recognition.onend = () => {
            setIsListening(false);
        };
    } else {
        toast({ variant: 'destructive', title: 'Not Supported', description: 'Voice recognition is not supported by your browser.' });
    }
  }, [toast, form]);


  const handleToggleListening = () => {
    if (isListening) {
        speechRecognitionRef.current?.stop();
    } else {
        speechRecognitionRef.current?.start();
    }
  };

  const handleUnderstandList = async () => {
    const transcribedText = form.getValues('shoppingList');
    if (!transcribedText) {
        toast({ variant: 'destructive', title: 'No list to understand', description: 'Please record or type your shopping list first.' });
        return;
    }

    setIsProcessing(true);
    setStructuredList([]);
    try {
        const shoppingListResponse = await understandShoppingList(transcribedText);
        if (shoppingListResponse && shoppingListResponse.items) {
             setStructuredList(shoppingListResponse.items);
             toast({ title: "List Understood!", description: "Your shopping list has been prepared." });
        } else {
             throw new Error("Could not understand the shopping list.");
        }
    } catch (error) {
        console.error("NLU error:", error);
        toast({
            variant: 'destructive',
            title: 'Processing Failed',
            description: `Could not understand the items in your list. Error: ${(error as Error).message}`
        });
    } finally {
        setIsProcessing(false);
    }
  };


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

    const isVoiceOrder = cartItems.length === 0 && (!!data.shoppingList || structuredList.length > 0);
    const storeId = cartItems[0]?.product.storeId;
    
    if (cartItems.length === 0 && !isVoiceOrder) {
        toast({ variant: 'destructive', title: 'Error', description: 'Your cart is empty. Please add items or create a shopping list.' });
        return;
    }
     if (!storeId && !isVoiceOrder) {
        toast({ variant: 'destructive', title: 'Error', description: 'Could not determine the store for this order.' });
        return;
    }

    startPlaceOrderTransition(async () => {
        const totalAmount = isVoiceOrder ? DELIVERY_FEE : cartTotal + DELIVERY_FEE;
        
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
            orderData.translatedList = data.shoppingList; // Save the raw transcribed text
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

        const colRef = collection(firestore, isVoiceOrder ? 'voice-orders' : 'orders');
        addDoc(colRef, orderData).then(() => {
            clearCart();
            setStructuredList([]);
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

  if (cartItems.length === 0 && !form.getValues('shoppingList') && structuredList.length === 0) {
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
                      <CardTitle>Or Create a Shopping List by Voice</CardTitle>
                      <UiCardDescription>No need to browse. Just tell us what you need, and a local shopkeeper will handle it.</UiCardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center justify-center space-y-4 py-12">
                        <Button
                            onClick={handleToggleListening}
                            variant={isListening ? 'destructive' : 'default'}
                            size="lg"
                            className="w-48"
                          >
                            {isListening ? <StopCircle className="mr-2 h-5 w-5" /> : <Mic className="mr-2 h-5 w-5" />}
                            {isListening ? 'Stop Listening' : 'Record List'}
                        </Button>
                        <p className="text-sm text-muted-foreground text-center">Click to record your shopping list. The text will appear on the next page.</p>
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
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid md:grid-cols-2 gap-12">
                <div>
                <Card>
                    <CardHeader>
                    <CardTitle>Delivery Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
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
                        
                        <Button type="submit" disabled={isPlacingOrder} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground">
                            {isPlacingOrder ? 'Placing Order...' : 'Place Order'}
                        </Button>
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
                        {(form.getValues('shoppingList') || structuredList.length > 0) && cartItems.length === 0 && (
                            <div className="space-y-4">
                                <FormField
                                    control={form.control}
                                    name="shoppingList"
                                    render={({ field }) => (
                                        <FormItem>
                                        <FormLabel>Your Shopping List</FormLabel>
                                        <FormControl>
                                            <Textarea placeholder="Your transcribed list will appear here." {...field} rows={6}/>
                                        </FormControl>
                                        <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                
                                {isProcessing ? (
                                <div className="flex items-center justify-center text-muted-foreground">
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    <span>Understanding your list...</span>
                                </div>
                                ) : structuredList.length > 0 ? (
                                <Card className="bg-muted/50">
                                    <CardHeader><CardTitle className="text-base">Understood Items</CardTitle></CardHeader>
                                    <CardContent>
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Item</TableHead>
                                                    <TableHead>Quantity</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {structuredList.map((item, index) => (
                                                    <TableRow key={index}>
                                                        <TableCell>{item.productName}</TableCell>
                                                        <TableCell>{item.quantity}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </CardContent>
                                </Card>
                                ) : (
                                     form.getValues('shoppingList') && !isProcessing && (
                                        <Button type="button" onClick={handleUnderstandList} className="w-full">
                                            <Bot className="mr-2 h-5 w-5" />
                                            Understand List
                                        </Button>
                                    )
                                )}
                                <div className="flex justify-between items-center">
                                    <p className="font-medium">Delivery Fee</p>
                                    <p>₹{DELIVERY_FEE.toFixed(2)}</p>
                                </div>
                            </div>
                        )}
                    </CardContent>
                    <CardFooter className="flex justify-between font-bold text-lg border-t pt-4">
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
                            type="button"
                            onClick={handleToggleListening}
                            variant={isListening ? 'destructive' : 'outline'}
                            size="lg"
                            className="w-48"
                        >
                            {isListening ? <StopCircle className="mr-2 h-5 w-5" /> : <Mic className="mr-2 h-5 w-5" />}
                            {isListening ? 'Stop Listening' : 'Record List'}
                        </Button>
                        <p className="text-sm text-muted-foreground text-center">
                            {isListening ? "I'm listening..." : "Click 'Record List' and start speaking."}
                        </p>
                    </CardContent>
                </Card>
                </div>
            </form>
        </Form>
    </div>
  );
}
