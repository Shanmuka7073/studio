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
import { collection, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { FirestorePermissionError } from '@/firebase/errors';
import { Mic, StopCircle, CheckCircle, MapPin, Loader2, Bot } from 'lucide-react';
import Link from 'next/link';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import type { ProductPrice, ProductVariant } from '@/lib/types';

const checkoutSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().min(10, 'Please enter a valid phone number'),
  shoppingList: z.string().optional(),
});

type CheckoutFormValues = z.infer<typeof checkoutSchema>;

type StructuredListItem = {
    productName: string;
    quantity: string;
    price: number | null;
    variant: ProductVariant;
};

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

// Robust function to parse the shopping list from text by iterating through the master catalog.
async function parseShoppingListFromText(text: string, db: any): Promise<StructuredListItem[]> {
    if (!text || !db) return [];

    const productPricesRef = collection(db, 'productPrices');
    const productSnapshot = await getDocs(productPricesRef);
    const masterProductList = productSnapshot.docs.map(doc => doc.data() as ProductPrice);

    const foundItems: StructuredListItem[] = [];
    const textLower = text.toLowerCase();
    const processedSkus = new Set<string>();

    for (const product of masterProductList) {
        // Check if the product name exists in the text
        if (textLower.includes(product.productName.toLowerCase())) {
            // If it does, check for each specific variant
            for (const variant of product.variants) {
                // Normalize both the text and variant weight by removing spaces to handle "1 kg" vs "1kg"
                const textNoSpaces = textLower.replace(/\s/g, '');
                const variantWeightNoSpaces = variant.weight.replace(/\s/g, '').toLowerCase();

                // Check if the weight is also mentioned.
                if (textNoSpaces.includes(variantWeightNoSpaces)) {
                    // Check if we've already added this exact item (product + variant)
                    if (!processedSkus.has(variant.sku)) {
                        foundItems.push({
                            productName: product.productName,
                            quantity: variant.weight, // Use the original weight string for display
                            price: variant.price,
                            variant: variant,
                        });
                        processedSkus.add(variant.sku); // Mark this variant as processed
                    }
                }
            }
        }
    }

    return foundItems;
}


export default function CheckoutPage() {
  const { cartItems, cartTotal, clearCart } = useCart();
  const router = useRouter();
  const { toast } = useToast();
  const [isPlacingOrder, startPlaceOrderTransition] = useTransition();
  const { firestore, user } = useFirebase();

  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [structuredList, setStructuredList] = useState<StructuredListItem[]>([]);
  
  const speechRecognitionRef = useRef<SpeechRecognition | null>(null);
  const finalTranscriptRef = useRef<string>('');

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
        if (cartItems.length === 0) return;
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
        recognition.lang = 'en-IN';
        recognition.continuous = true; // Keep listening until explicitly stopped
        recognition.interimResults = true;
        
        recognition.onstart = () => {
            setIsListening(true);
        };
        
        recognition.onresult = (event) => {
            let interimTranscript = '';
            // Reset the final transcript for this recognition session to avoid accumulation
            let currentFinalTranscript = ''; 
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    currentFinalTranscript += event.results[i][0].transcript + ' ';
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }
            finalTranscriptRef.current += currentFinalTranscript;
            form.setValue('shoppingList', finalTranscriptRef.current + interimTranscript);
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
        // Don't clear the transcript, allow appending
        // finalTranscriptRef.current = ''; 
        // form.setValue('shoppingList', '');
        setStructuredList([]);
        speechRecognitionRef.current?.start();
    }
  };

 const handleUnderstandList = async () => {
    if (!firestore) return;
    const transcribedText = form.getValues('shoppingList');
    if (!transcribedText) {
        toast({ variant: 'destructive', title: 'No list to understand', description: 'Please record or type your shopping list first.' });
        return;
    }

    setIsProcessing(true);
    setStructuredList([]);
    try {
        const items = await parseShoppingListFromText(transcribedText, firestore);
        
        if (items.length > 0) {
            setStructuredList(items);
            toast({ title: "List Understood!", description: `Found ${items.length} item(s) from your list.` });
        } else {
            throw new Error("Could not find any matching products in the master catalog based on your list.");
        }
    } catch (error) {
        console.error("List parsing error:", error);
        toast({
            variant: 'destructive',
            title: 'Processing Failed',
            description: (error as Error).message || 'Could not understand the items in your list.'
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

    const isVoiceOrder = cartItems.length === 0 && structuredList.length > 0;
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
        const voiceOrderSubtotal = structuredList.reduce((acc, item) => acc + (item.price || 0), 0);
        const totalAmount = isVoiceOrder ? voiceOrderSubtotal + DELIVERY_FEE : cartTotal + DELIVERY_FEE;
        
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
            orderData.translatedList = data.shoppingList;
            orderData.items = structuredList.map(item => ({
                productName: item.productName,
                variantWeight: item.variant.weight,
                price: item.price || 0,
                productId: item.variant.sku, // using sku as a reference
                variantSku: item.variant.sku,
                quantity: 1, // Assume quantity of 1 for each line item in voice order
            }));
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
            finalTranscriptRef.current = '';

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

  const hasItemsInCart = cartItems.length > 0;
  const voiceOrderSubtotal = structuredList.reduce((acc, item) => acc + (item.price || 0), 0);
  const finalTotal = hasItemsInCart ? cartTotal + DELIVERY_FEE : voiceOrderSubtotal + DELIVERY_FEE;

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
                        {hasItemsInCart ? (
                            <>
                                {cartItems.map((item) => {
                                    const image = images[item.variant.sku] || { imageUrl: 'https://placehold.co/48x48/E2E8F0/64748B?text=...', imageHint: 'loading' };
                                    return <OrderSummaryItem key={item.variant.sku} item={item} image={image} />
                                })}
                                <div className="flex justify-between items-center border-t pt-4">
                                    <p className="font-medium">Subtotal</p>
                                    <p>₹{cartTotal.toFixed(2)}</p>
                                </div>
                                <div className="flex justify-between items-center">
                                    <p className="font-medium">Delivery Fee</p>
                                    <p>₹{DELIVERY_FEE.toFixed(2)}</p>
                                </div>
                            </>
                        ) : (
                            <div className="space-y-4">
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Create a Shopping List by Voice</CardTitle>
                                        <UiCardDescription>No need to browse. Just tell us what you need, and a local shopkeeper will handle it.</UiCardDescription>
                                    </CardHeader>
                                    <CardContent className="flex flex-col items-center justify-center space-y-4">
                                        <Button
                                            type="button"
                                            onClick={handleToggleListening}
                                            variant={isListening ? 'destructive' : 'default'}
                                            size="lg"
                                            className="w-48"
                                        >
                                            {isListening ? <StopCircle className="mr-2 h-5 w-5" /> : <Mic className="mr-2 h-5 w-5" />}
                                            {isListening ? 'Stop Listening' : 'Record List'}
                                        </Button>
                                        <p className="text-sm text-muted-foreground text-center">
                                            {isListening ? "I'm listening..." : "Click to record your shopping list."}
                                        </p>
                                    </CardContent>
                                </Card>

                                <FormField
                                    control={form.control}
                                    name="shoppingList"
                                    render={({ field }) => (
                                        <FormItem>
                                        <FormLabel>Your Transcribed List</FormLabel>
                                        <FormControl>
                                            <Textarea placeholder="Your transcribed list will appear here." {...field} rows={4}/>
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
                                                        <TableHead className="text-right">Price</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {structuredList.map((item, index) => (
                                                        <TableRow key={index}>
                                                            <TableCell>{item.productName}</TableCell>
                                                            <TableCell>{item.quantity}</TableCell>
                                                            <TableCell className="text-right">{item.price ? `₹${item.price.toFixed(2)}` : 'N/A'}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                                <TableFooter>
                                                    <TableRow>
                                                        <TableCell colSpan={2} className="text-right">Subtotal</TableCell>
                                                        <TableCell className="text-right font-bold">₹{voiceOrderSubtotal.toFixed(2)}</TableCell>
                                                    </TableRow>
                                                </TableFooter>
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
                                {structuredList.length > 0 && (
                                    <div className="flex justify-between items-center border-t pt-4">
                                        <p className="font-medium">Delivery Fee</p>
                                        <p>₹{DELIVERY_FEE.toFixed(2)}</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </CardContent>
                    <CardFooter className="flex justify-between font-bold text-lg border-t pt-4">
                        <span>Total</span>
                        <span>₹{finalTotal.toFixed(2)}</span>
                    </CardFooter>
                </Card>
                </div>
            </form>
        </Form>
    </div>
  );
}
