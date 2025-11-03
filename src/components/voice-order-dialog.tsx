
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
import { useTransition, useState, useCallback, useEffect, useRef } from 'react';
import { useFirebase, errorEmitter, useDoc, useMemoFirebase } from '@/firebase';
import { collection, addDoc, serverTimestamp, getDocs, doc } from 'firebase/firestore';
import { FirestorePermissionError } from '@/firebase/errors';
import { CheckCircle, MapPin, Loader2, Store as StoreIcon, HelpCircle } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import type { ProductPrice, ProductVariant, Store, User as AppUser } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getStores, getStore } from '@/lib/data';
import { useCheckoutStore } from '@/app/checkout/page';
import { translateProductNames } from '@/ai/flows/translation-flow';


const checkoutSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().min(10, 'Please enter a valid phone number'),
  shoppingList: z.string().optional(),
  storeId: z.string().optional(),
});

type CheckoutFormValues = z.infer<typeof checkoutSchema>;

export type VoiceOrderInfo = {
  shoppingList: string;
  storeId: string;
};

type StructuredListItem = {
    productName: string;
    quantity: number;
    price: number | null;
    variant: ProductVariant;
};

const DELIVERY_FEE = 30;

async function matchItemsToCatalog(text: string, db: any): Promise<StructuredListItem[]> {
    if (!text || !db) return [];

    const productPricesRef = collection(db, 'productPrices');
    const productSnapshot = await getDocs(productPricesRef);
    const masterProductList = productSnapshot.docs.map(doc => doc.data() as ProductPrice);

    if (masterProductList.length === 0) {
        console.warn("Master product catalog is empty.");
        return [];
    }
    
    let cleanedText = text.replace(/(\d+\s*kg\s*)\1+/gi, '$1');
    cleanedText = cleanedText.replace(/(one\s*kg\s*)\1+/gi, '$1');
    cleanedText = cleanedText.replace(/(one\s*kilo\s*)\1+/gi, '$1');

    const matchedItems: StructuredListItem[] = [];
    const pattern = /(one|\d+)\s*(kg|kilo|kilogram|grams|gm|g)?\s*([a-zA-Z\s]+)/gi;
    let match;

    while ((match = pattern.exec(cleanedText)) !== null) {
        const quantityStr = match[1].toLowerCase();
        const quantity = quantityStr === 'one' ? 1 : parseInt(quantityStr, 10);
        let unit = (match[2] || 'kg').toLowerCase(); // Default to 'kg' if no unit
        const itemName = match[3].trim().toLowerCase();

        if (unit.startsWith('g')) unit = 'gm';
        if (unit.startsWith('kilo')) unit = 'kg';

        const targetWeight = `${quantity}${unit}`;
        
        const productMatch = masterProductList.find(p => 
            itemName.includes(p.productName.toLowerCase())
        );

        if (productMatch) {
            const variantMatch = productMatch.variants.find(v => 
                v.weight.replace(/\s/g, '') === targetWeight
            );
            
            if (variantMatch) {
                matchedItems.push({
                    productName: productMatch.productName,
                    quantity: 1,
                    price: variantMatch.price,
                    variant: variantMatch
                });
            }
        }
    }
    return matchedItems;
}


export function VoiceOrderDialog({ isOpen, onClose, orderInfo }: { isOpen: boolean; onClose: () => void; orderInfo: VoiceOrderInfo | null; }) {
  const { clearCart } = useCart();
  const router = useRouter();
  const { toast } = useToast();
  const [isPlacingOrder, startPlaceOrderTransition] = useTransition();
  const { firestore, user } = useFirebase();

  const [isProcessing, setIsProcessing] = useState(false);
  const [structuredList, setStructuredList] = useState<StructuredListItem[]>([]);
  const [availableStores, setAvailableStores] = useState<Store[]>([]);
  
  const [deliveryCoords, setDeliveryCoords] = useState<{lat: number, lng: number} | null>(null);

  const placeOrderBtnRef = useRef<HTMLButtonElement>(null);
  const { setPlaceOrderBtnRef, setFinalTotalGetter, setShouldPromptForLocation, setHandleGetLocation } = useCheckoutStore();
  
  const handleGetLocation = useCallback(() => {
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
                    toast({ variant: 'destructive', title: "Location Error", description: "Could not retrieve your location. Please ensure permissions are enabled." });
                }
            );
        } else {
            toast({ variant: 'destructive', title: "Not Supported", description: "Geolocation is not supported by your browser." });
        }
  }, [toast]);

  const shouldPromptForLocation = isOpen && !deliveryCoords;
  const voiceOrderSubtotal = structuredList.reduce((acc, item) => acc + ((item.price || 0) * item.quantity), 0);
  const finalTotal = voiceOrderSubtotal + DELIVERY_FEE;

  useEffect(() => {
    if (shouldPromptForLocation) {
        // Auto-trigger location capture
        const timeoutId = setTimeout(() => handleGetLocation(), 1000);
        return () => clearTimeout(timeoutId);
    }
  }, [shouldPromptForLocation, handleGetLocation]);

  useEffect(() => {
    if (isOpen) {
        setPlaceOrderBtnRef(placeOrderBtnRef);
        setFinalTotalGetter(() => finalTotal);
        setShouldPromptForLocation(shouldPromptForLocation);
        // We set the handler, but the VoiceCommander will call it.
        setHandleGetLocation(() => handleGetLocation); 
    } else {
        setPlaceOrderBtnRef(null);
        setFinalTotalGetter(() => 0);
        setShouldPromptForLocation(false);
        setHandleGetLocation(() => {});
        setDeliveryCoords(null);
        setStructuredList([]);
    }
  }, [isOpen, placeOrderBtnRef, setPlaceOrderBtnRef, finalTotal, setFinalTotalGetter, shouldPromptForLocation, setShouldPromptForLocation, handleGetLocation, setHandleGetLocation]);



  const userDocRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);
  const { data: userData, isLoading: isProfileLoading } = useDoc<AppUser>(userDocRef);

  const form = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { name: '', phone: '', shoppingList: '', storeId: '' },
  });

  useEffect(() => {
    if (userData) {
      form.reset({
        name: `${userData.firstName} ${userData.lastName}`,
        phone: userData.phoneNumber,
        shoppingList: orderInfo?.shoppingList || '',
        storeId: orderInfo?.storeId || '',
      });
    }
  }, [userData, orderInfo, form]);

  const handleUnderstandList = useCallback(async (text: string) => {
    if (!firestore || !text) return;

    setIsProcessing(true);
    setStructuredList([]);
    try {
        const items = await matchItemsToCatalog(text, firestore);
        
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
  }, [firestore, toast]);

  useEffect(() => {
    async function fetchStores() {
      if (!firestore) return;
      try {
        const stores = await getStores(firestore);
        setAvailableStores(stores);
      } catch (err) {
        console.error(err);
        toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch available stores.' });
      }
    }
    fetchStores();
  }, [firestore, toast]);

  useEffect(() => {
    if (isOpen && orderInfo) {
      form.setValue('shoppingList', orderInfo.shoppingList);
      form.setValue('storeId', orderInfo.storeId);
      handleUnderstandList(orderInfo.shoppingList);
    }
  }, [isOpen, orderInfo, form, handleUnderstandList]);

  const onSubmit = (data: CheckoutFormValues) => {
    if (!firestore || !user) {
        toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in to place an order.' });
        return;
    }
    if (!deliveryCoords) {
        toast({ variant: 'destructive', title: 'Location Required', description: 'Please capture your current location for delivery.' });
        return;
    }
    if (structuredList.length === 0) {
        toast({ variant: 'destructive', title: 'Error', description: 'No items were understood from your list.' });
        return;
    }

    const storeId = data.storeId;
    if (!storeId) {
        toast({ variant: 'destructive', title: 'Store Required', description: 'Please select a store to fulfill your voice order.' });
        return;
    }

    startPlaceOrderTransition(async () => {
        const storeData = await getStore(firestore, storeId);
        if (!storeData) {
            toast({ variant: 'destructive', title: 'Error', description: 'Selected store could not be found.' });
            return;
        }
        
        const totalAmount = finalTotal;

        // Generate translated list
        const productNames = structuredList.map(item => item.productName);
        const translations = await translateProductNames(productNames);
        const translatedListString = translations.map(t => `${t.englishName} (${t.teluguName})`).join(', ');
        
        let orderData: any = {
            userId: user.uid,
            storeId: storeId,
            storeOwnerId: storeData.ownerId, // Denormalized store owner ID
            customerName: data.name,
            deliveryAddress: 'Delivery via captured GPS coordinates',
            deliveryLat: deliveryCoords.lat,
            deliveryLng: deliveryCoords.lng,
            phone: data.phone,
            email: user.email,
            orderDate: serverTimestamp(),
            status: 'Pending' as 'Pending',
            totalAmount,
            translatedList: translatedListString,
            items: structuredList.map(item => ({
                productName: item.productName,
                variantWeight: item.variant.weight,
                price: item.price || 0,
                productId: item.variant.sku, // using sku as a reference
                variantSku: item.variant.sku,
                quantity: item.quantity,
            })),
        };

        const colRef = collection(firestore, 'orders'); // Save to the main 'orders' collection
        addDoc(colRef, orderData).then(() => {
            clearCart();
            setStructuredList([]);
            setDeliveryCoords(null);
            form.reset();
            onClose();

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

  const storeName = availableStores.find(s => s.id === orderInfo?.storeId)?.name || '...';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-3xl">
            <DialogHeader>
                <DialogTitle>Voice Order from {storeName}</DialogTitle>
                <DialogDescription>
                    Confirm the items from your voice command and provide delivery details.
                </DialogDescription>
            </DialogHeader>

            <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid md:grid-cols-2 gap-8 max-h-[70vh] overflow-hidden">
                <ScrollArea className="md:pr-4">
                    <div className="space-y-6">
                        <Card>
                             <CardHeader>
                                <CardTitle>Understood Shopping List</CardTitle>
                             </CardHeader>
                             <CardContent>
                                {isProcessing ? (
                                    <div className="flex items-center justify-center text-muted-foreground">
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        <span>Understanding your list...</span>
                                    </div>
                                ) : structuredList.length > 0 ? (
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Item</TableHead>
                                                <TableHead>Quantity</TableHead>
                                                <TableHead className="text-right">Price</TableHead>
                                                <TableHead className="text-right">Subtotal</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {structuredList.map((item, index) => (
                                                <TableRow key={index}>
                                                    <TableCell className="capitalize">{item.productName}</TableCell>
                                                    <TableCell>{item.variant.weight}</TableCell>
                                                    <TableCell className="text-right">{item.price ? `₹${item.price.toFixed(2)}` : 'N/A'}</TableCell>
                                                    <TableCell className="text-right font-medium">{item.price ? `₹${(item.price * item.quantity).toFixed(2)}` : 'N/A'}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                         <TableFooter>
                                            <TableRow>
                                                <TableCell colSpan={3} className="text-right font-bold">Subtotal</TableCell>
                                                <TableCell className="text-right font-bold">₹{voiceOrderSubtotal.toFixed(2)}</TableCell>
                                            </TableRow>
                                        </TableFooter>
                                    </Table>
                                ) : (
                                    <p className="text-destructive text-sm">Could not understand any items from your list. Please try again.</p>
                                )}
                             </CardContent>
                        </Card>
                        <Card>
                            <CardHeader><CardTitle>Your Original Command</CardTitle></CardHeader>
                            <CardContent>
                                <p className="text-muted-foreground italic">"{form.getValues('shoppingList')}"</p>
                            </CardContent>
                        </Card>
                    </div>
                </ScrollArea>

                <ScrollArea className="md:pr-4">
                    <div className="space-y-6">
                        <Card>
                            <CardHeader><CardTitle>Delivery Details</CardTitle></CardHeader>
                            <CardContent className="space-y-4">
                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Full Name</FormLabel>
                                        <FormControl><Input placeholder="John Doe" {...field} readOnly={!!userData?.firstName} /></FormControl>
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
                                        <FormControl><Input placeholder="(555) 123-4567" {...field} readOnly={!!userData?.phoneNumber} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                    )}
                                />
                                <div className="space-y-2">
                                    <FormLabel>Delivery Location</FormLabel>
                                    {deliveryCoords ? (
                                        <div className="flex items-center gap-4 pt-1">
                                             <div className="flex items-center text-green-600">
                                                <CheckCircle className="mr-2 h-5 w-5" />
                                                <span>Location captured!</span>
                                            </div>
                                            <Button type="button" variant="outline" size="sm" onClick={handleGetLocation}>
                                                <MapPin className="mr-2 h-4 w-4" /> Re-capture
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 text-muted-foreground p-3 bg-muted/50 rounded-md">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            <span>Getting your current location...</span>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                         
                        <Card>
                            <CardHeader><CardTitle>Order Summary</CardTitle></CardHeader>
                            <CardContent className="space-y-2">
                                <div className="flex justify-between"><span>Subtotal</span><span>₹{voiceOrderSubtotal.toFixed(2)}</span></div>
                                <div className="flex justify-between"><span>Delivery Fee</span><span>₹{DELIVERY_FEE.toFixed(2)}</span></div>
                            </CardContent>
                             <CardFooter className="flex justify-between font-bold text-lg border-t pt-4 mt-4">
                                <span>Total</span>
                                <span>₹{finalTotal.toFixed(2)}</span>
                             </CardFooter>
                        </Card>
                         <Button ref={placeOrderBtnRef} type="submit" disabled={isPlacingOrder || structuredList.length === 0} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground">
                            {isPlacingOrder ? 'Placing Order...' : 'Place Order'}
                        </Button>
                    </div>
                 </ScrollArea>
            </form>
            </Form>
        </DialogContent>
    </Dialog>
  );
}

    