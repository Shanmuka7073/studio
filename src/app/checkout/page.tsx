
'use client';

import { useCart } from '@/lib/cart';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
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
import { getProductImage, getStore, getStores } from '@/lib/data';
import { useTransition, useState, useCallback, useEffect, useMemo, RefObject, useRef } from 'react';
import { useFirebase, errorEmitter, useDoc, useMemoFirebase } from '@/firebase';
import { collection, addDoc, serverTimestamp, doc } from 'firebase/firestore';
import { FirestorePermissionError } from '@/firebase/errors';
import { CheckCircle, MapPin, Loader2, AlertCircle, Store as StoreIcon, Home, LocateFixed } from 'lucide-react';
import Link from 'next/link';
import type { User as AppUser, Store } from '@/lib/types';
import { create } from 'zustand';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAppStore } from '@/lib/store';
import { t } from '@/lib/locales';

const checkoutSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().min(10, 'Please enter a valid phone number'),
  deliveryAddress: z.string().min(10, 'Please provide a valid delivery address.'),
});

type CheckoutFormValues = z.infer<typeof checkoutSchema>;

const DELIVERY_FEE = 30;

function OrderSummaryItem({ item, image }) {
    const { product, variant, quantity } = item;
    const getProductName = useAppStore(state => state.getProductName);

    return (
        <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
                <Image src={image.imageUrl} alt={product.name} data-ai-hint={image.imageHint} width={48} height={48} className="rounded-md" />
                <div>
                    <p className="font-medium">{getProductName(product)} <span className="text-sm text-muted-foreground">({variant.weight})</span></p>
                    <p className="text-sm text-muted-foreground">Qty: {quantity}</p>
                </div>
            </div>
            <p>₹{(variant.price * quantity).toFixed(2)}</p>
        </div>
    );
}

// Minimal pass-through state needed by the voice commander.
interface PassThroughState {
  placeOrderBtnRef: RefObject<HTMLButtonElement> | null;
  setPlaceOrderBtnRef: (ref: RefObject<HTMLButtonElement> | null) => void;
  isWaitingForQuickOrderConfirmation: boolean;
  setIsWaitingForQuickOrderConfirmation: (isWaiting: boolean) => void;
  homeAddressBtnRef: RefObject<HTMLButtonElement> | null;
  setHomeAddressBtnRef: (ref: RefObject<HTMLButtonElement> | null) => void;
  currentLocationBtnRef: RefObject<HTMLButtonElement> | null;
  setCurrentLocationBtnRef: (ref: RefObject<HTMLButtonElement> | null) => void;
}

export const useCheckoutStore = create<PassThroughState>((set) => ({
  placeOrderBtnRef: null,
  setPlaceOrderBtnRef: (placeOrderBtnRef) => set({ placeOrderBtnRef }),
  isWaitingForQuickOrderConfirmation: false,
  setIsWaitingForQuickOrderConfirmation: (isWaiting) => set({ isWaitingForQuickOrderConfirmation: isWaiting }),
  homeAddressBtnRef: null,
  setHomeAddressBtnRef: (ref) => set({ homeAddressBtnRef: ref }),
  currentLocationBtnRef: null,
  setCurrentLocationBtnRef: (ref) => set({ currentLocationBtnRef: ref }),
}));

export default function CheckoutPage() {
  const { cartItems, cartTotal, clearCart, activeStoreId, setActiveStoreId } = useCart();
  const router = useRouter();
  const { toast } = useToast();
  const [isPlacingOrder, startPlaceOrderTransition] = useTransition();
  const { firestore, user } = useFirebase();

  const [deliveryCoords, setDeliveryCoords] = useState<{lat: number, lng: number} | null>(null);
  const [images, setImages] = useState({});
  const placeOrderBtnRef = useRef<HTMLButtonElement>(null);
  const homeAddressBtnRef = useRef<HTMLButtonElement>(null);
  const currentLocationBtnRef = useRef<HTMLButtonElement>(null);
  
  const { allStores, fetchInitialData } = useAppStore((state) => ({
    allStores: state.stores,
    fetchInitialData: state.fetchInitialData,
  }));

  const { 
      isWaitingForQuickOrderConfirmation, 
      setPlaceOrderBtnRef, 
      setIsWaitingForQuickOrderConfirmation,
      setHomeAddressBtnRef,
      setCurrentLocationBtnRef
    } = useCheckoutStore();

  const hasItemsInCart = cartItems.length > 0;
  const finalTotal = hasItemsInCart ? cartTotal + DELIVERY_FEE : 0;
  
  useEffect(() => {
    if (firestore) {
      fetchInitialData(firestore);
    }
  }, [firestore, fetchInitialData]);

  const handleUseCurrentLocation = useCallback(() => {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                setDeliveryCoords({ lat: latitude, lng: longitude });
                // We don't have a reverse geocoded address, so we use a placeholder.
                // A real app would use a Geocoding API here.
                form.setValue('deliveryAddress', `Current Location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`, { shouldValidate: true });
                toast({ title: "Location Fetched!", description: "Your current location has been set for delivery." });
            },
            () => {
                toast({ variant: 'destructive', title: "Location Error", description: "Could not retrieve your location. Please ensure permissions are enabled." });
            },
            { timeout: 10000 }
        );
    } else {
        toast({ variant: 'destructive', title: "Not Supported", description: "Geolocation is not supported by your browser." });
    }
  }, [toast]);

  useEffect(() => {
    setPlaceOrderBtnRef(placeOrderBtnRef);
    setHomeAddressBtnRef(homeAddressBtnRef);
    setCurrentLocationBtnRef(currentLocationBtnRef);
    return () => {
      setPlaceOrderBtnRef(null);
      setHomeAddressBtnRef(null);
      setCurrentLocationBtnRef(null);
      setIsWaitingForQuickOrderConfirmation(false);
    }
  }, [setPlaceOrderBtnRef, setHomeAddressBtnRef, setCurrentLocationBtnRef, setIsWaitingForQuickOrderConfirmation]);


   const userDocRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);
  const { data: userData } = useDoc<AppUser>(userDocRef);

  const form = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { name: '', phone: '', deliveryAddress: '' },
  });
  
  const handleUseHomeAddress = useCallback(() => {
    if (userData) {
      if(userData.address) {
        form.setValue('deliveryAddress', userData.address, { shouldValidate: true });
        toast({ title: "Home Address Set!", description: "Your saved home address will be used for delivery." });
        
        // Note: We don't have lat/lng for home address in this version.
        // A real app would geocode the address to get coordinates.
        // For now, we'll clear coords if they were set.
        setDeliveryCoords(null); 
      } else {
        toast({ variant: 'destructive', title: 'No Home Address', description: 'Please set your home address in your profile first.' });
      }
    }
  }, [userData, form, toast]);


  // Effect to pre-fill form with user data
  useEffect(() => {
    if (userData) {
      form.reset({
        name: `${userData.firstName} ${userData.lastName}`,
        phone: userData.phoneNumber,
        deliveryAddress: form.getValues('deliveryAddress') || '',
      });
    }
  }, [userData, form]);

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

  const onSubmit = (data: CheckoutFormValues) => {
    if (!firestore || !user) {
        toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in to place an order.' });
        return;
    }
    
    if (cartItems.length === 0) {
        toast({ variant: 'destructive', title: 'Error', description: 'Your cart is empty. Please add items before checking out.' });
        return;
    }
     if (!activeStoreId) {
        toast({ variant: 'destructive', title: 'Store Required', description: 'Please select a store to fulfill your order.' });
        return;
    }

    startPlaceOrderTransition(async () => {
        const storeData = await getStore(firestore, activeStoreId);
        if (!storeData) {
            toast({ variant: 'destructive', title: 'Error', description: 'Selected store could not be found.' });
            return;
        }
        
        const totalAmount = cartTotal + DELIVERY_FEE;
        
        let orderData: any = {
            userId: user.uid,
            storeId: activeStoreId,
            storeOwnerId: storeData.ownerId, // Denormalized store owner ID
            customerName: data.name,
            deliveryAddress: data.deliveryAddress,
            deliveryLat: deliveryCoords?.lat || 0, // Fallback to 0 if not set
            deliveryLng: deliveryCoords?.lng || 0, // Fallback to 0 if not set
            phone: data.phone,
            email: user.email,
            orderDate: serverTimestamp(),
            status: 'Pending' as 'Pending',
            totalAmount,
            items: cartItems.map(item => ({
                productId: item.product.id,
                productName: item.product.name,
                variantSku: item.variant.sku,
                variantWeight: item.variant.weight,
                quantity: item.quantity,
                price: item.variant.price,
            })),
        };

        const colRef = collection(firestore, 'orders');
        
        // --- OPTIMIZATION: Non-blocking write ---
        // 1. Immediately update UI for a snappy experience.
        clearCart();
        setDeliveryCoords(null);
        form.reset();
        toast({
            title: "Order Placed!",
            description: "Thank you for your purchase.",
        });
        router.push('/order-confirmation');

        // 2. Perform the database write in the background.
        addDoc(colRef, orderData).catch((e) => {
             console.error('Error placing order:', e);
             // If the write fails, we should inform the user.
             // This toast will appear on the confirmation page.
             toast({
                 variant: 'destructive',
                 title: "Order Sync Failed",
                 description: "Your order was not saved correctly. Please contact support."
             })
             const permissionError = new FirestorePermissionError({
                path: colRef.path,
                operation: 'create',
                requestResourceData: orderData
            });
            errorEmitter.emit('permission-error', permissionError);
        });
    });
  };

  if (!hasItemsInCart && !isWaitingForQuickOrderConfirmation) {
      return (
          <div className="container mx-auto py-24 text-center">
              <h1 className="text-4xl font-bold mb-4 font-headline">
                  {t('your-cart-is-empty')}
              </h1>
              <p className="text-muted-foreground mb-8">
                  {t('please-add-items-to-your-cart-before-proceeding')}
              </p>
              <Button asChild size="lg">
                  <Link href="/stores">{t('browse-stores')}</Link>
              </Button>
          </div>
      );
  }

  return (
    <div className="container mx-auto py-12 px-4 md:px-6">
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid md:grid-cols-2 gap-12">
                <div>
                <Card>
                    <CardHeader>
                    <CardTitle>{t('delivery-and-store-selection')}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t('full-name')}</FormLabel>
                                <FormControl>
                                <Input placeholder="John Doe" {...field} readOnly={!!userData?.firstName} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                            )}
                        />
                        <div className="space-y-4">
                            <FormLabel>{t('delivery-location')}</FormLabel>
                            <div className="grid grid-cols-2 gap-4">
                               <Button ref={homeAddressBtnRef} type="button" variant="outline" onClick={handleUseHomeAddress} disabled={!userData?.address}>
                                    <Home className="mr-2 h-4 w-4" /> Use Home Address
                               </Button>
                               <Button ref={currentLocationBtnRef} type="button" variant="outline" onClick={handleUseCurrentLocation}>
                                    <LocateFixed className="mr-2 h-4 w-4" /> Use Current Location
                               </Button>
                            </div>
                             <FormField
                                control={form.control}
                                name="deliveryAddress"
                                render={({ field }) => (
                                <FormItem>
                                    <FormControl>
                                    <Input placeholder="Select a delivery address above" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                        </div>
                        <FormField
                            control={form.control}
                            name="phone"
                            render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t('phone-number')}</FormLabel>
                                <FormControl>
                                <Input placeholder="(555) 123-4567" {...field} readOnly={!!userData?.phoneNumber} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                            )}
                        />

                        <div className="space-y-2">
                            <FormLabel>{t('fulfilling-store')}</FormLabel>
                            <Select onValueChange={setActiveStoreId} value={activeStoreId || ""}>
                                <SelectTrigger>
                                    <SelectValue placeholder={t('select-a-store-to-fulfill')} />
                                </SelectTrigger>
                                <SelectContent>
                                    {allStores.map(store => (
                                        <SelectItem key={store.id} value={store.id}>
                                            <div className="flex items-center gap-2">
                                                <StoreIcon className="h-4 w-4 text-muted-foreground" />
                                                <span>{store.name}</span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {!activeStoreId && !isWaitingForQuickOrderConfirmation && (
                                <Alert variant="destructive" id="action-required-alert">
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertTitle>{t('action-required')}</AlertTitle>
                                    <AlertDescription>
                                        {t('please-select-a-store-to-continue')}
                                    </AlertDescription>
                                </Alert>
                            )}
                             {isWaitingForQuickOrderConfirmation && !activeStoreId && (
                                <Alert variant="default" id="action-required-alert">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <AlertTitle>{t('waiting-for-store')}</AlertTitle>
                                    <AlertDescription>
                                       {t('the-store-you-selected-with-your-voice-is-being-set')}
                                    </AlertDescription>
                                </Alert>
                            )}
                        </div>

                        <Button ref={placeOrderBtnRef} type="submit" disabled={isPlacingOrder || !activeStoreId} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground">
                            {isPlacingOrder ? t('placing-order') : t('place-order')}
                        </Button>
                    </CardContent>
                </Card>
                </div>
                <div>
                <Card>
                    <CardHeader>
                    <CardTitle>{t('order-summary')}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {cartItems.map((item) => {
                            const image = images[item.variant.sku] || { imageUrl: 'https://placehold.co/48x48/E2E8F0/64748B?text=...', imageHint: 'loading' };
                            return <OrderSummaryItem key={item.variant.sku} item={item} image={image} />
                        })}
                         {cartItems.length === 0 && (
                            <div className="text-center text-muted-foreground py-8">
                                <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                                <p className="mt-2">{t('loading-your-quick-order-item')}</p>
                            </div>
                        )}
                        <div className="flex justify-between items-center border-t pt-4">
                            <p className="font-medium">{t('subtotal')}</p>
                            <p>₹{cartTotal.toFixed(2)}</p>
                        </div>
                        <div className="flex justify-between items-center">
                            <p className="font-medium">{t('delivery-fee')}</p>
                            <p>₹{DELIVERY_FEE.toFixed(2)}</p>
                        </div>
                    </CardContent>
                    <CardFooter className="flex justify-between font-bold text-lg border-t pt-4">
                        <span>{t('total')}</span>
                        <span id="final-total-amount">₹{finalTotal.toFixed(2)}</span>
                    </CardFooter>
                </Card>
                </div>
            </form>
        </Form>
    </div>
  );
}
