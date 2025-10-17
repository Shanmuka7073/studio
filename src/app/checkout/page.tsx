'use client';

import { useCart } from '@/lib/cart';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { getProductImage } from '@/lib/data';
import { MapPin } from 'lucide-react';
import { useState, useTransition } from 'react';
import { useFirebase, errorEmitter } from '@/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { FirestorePermissionError } from '@/firebase/errors';

const checkoutSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  address: z.string().min(10, 'Please enter a valid address'),
  phone: z.string().min(10, 'Please enter a valid phone number'),
  email: z.string().email('Please enter a valid email address'),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

type CheckoutFormValues = z.infer<typeof checkoutSchema>;

export default function CheckoutPage() {
  const { cartItems, cartTotal, clearCart } = useCart();
  const router = useRouter();
  const { toast } = useToast();
  const [isLocating, setIsLocating] = useState(false);
  const [isPlacingOrder, startTransition] = useTransition();
  const { firestore, user } = useFirebase();

  const form = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      name: '',
      address: '',
      phone: '',
      email: '',
    },
  });

  const handleGetCurrentLocation = () => {
    if (navigator.geolocation) {
      setIsLocating(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          form.setValue('latitude', latitude);
          form.setValue('longitude', longitude);
          
          // For now, we'll just use the coordinates for delivery.
          // In a real app, you'd use a geocoding service to convert coords to an address.
          if (!form.getValues('address')) {
              form.setValue('address', `GPS: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`, { shouldValidate: true });
          }

          setIsLocating(false);
          toast({
            title: 'Location Found',
            description: 'Your current location has been captured for delivery.',
          });
        },
        (error) => {
          console.error("Geolocation error:", error);
          toast({
            variant: "destructive",
            title: 'Location Error',
            description: 'Could not get your location. Please enter address manually.',
          });
          setIsLocating(false);
        }
      );
    } else {
       toast({
        variant: "destructive",
        title: 'Unsupported',
        description: 'Geolocation is not supported by your browser.',
      });
    }
  };

  const onSubmit = (data: CheckoutFormValues) => {
    if (!firestore || !user) {
        toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in to place an order.' });
        return;
    }

    // Assume all items in the cart are from the same store for this example
    const storeId = cartItems[0]?.product.storeId;
    if (!storeId) {
        toast({ variant: 'destructive', title: 'Error', description: 'Could not determine the store for this order.' });
        return;
    }

    startTransition(async () => {
        const orderData = {
            userId: user.uid,
            storeId: storeId,
            customerName: data.name,
            deliveryAddress: data.address,
            deliveryLat: data.latitude,
            deliveryLng: data.longitude,
            phone: data.phone,
            email: data.email,
            orderDate: serverTimestamp(),
            totalAmount: cartTotal,
            status: 'Pending',
            items: cartItems.map(item => ({
                productId: item.product.id,
                name: item.product.name,
                quantity: item.quantity,
                price: item.product.price,
            }))
        };

        try {
            const ordersCol = collection(firestore, 'orders');
            await addDoc(ordersCol, orderData);
            
            clearCart();
            toast({
                title: "Order Placed!",
                description: "Thank you for your purchase.",
            });
            router.push('/order-confirmation');

        } catch (e) {
            console.error('Error placing order:', e);
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'orders',
                operation: 'create',
                requestResourceData: orderData
            }));
        }
    });
  };

  if (cartItems.length === 0) {
    return (
        <div className="container mx-auto py-24 text-center">
            <h1 className="text-4xl font-bold mb-4">Your cart is empty.</h1>
            <p className="text-muted-foreground mb-8">Cannot proceed to checkout without items.</p>
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
                        <div className="flex justify-between items-center">
                          <FormLabel>Shipping Address</FormLabel>
                          <Button 
                            type="button" 
                            variant="outline" 
                            size="sm" 
                            onClick={handleGetCurrentLocation}
                            disabled={isLocating}
                          >
                            <MapPin className="mr-2 h-4 w-4" />
                            {isLocating ? 'Locating...' : 'Use Current Location'}
                          </Button>
                        </div>
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
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Address</FormLabel>
                        <FormControl>
                          <Input placeholder="john.doe@example.com" {...field} />
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
            </CardContent>
            <CardFooter className="flex justify-between font-bold text-lg">
                <span>Total</span>
                <span>${cartTotal.toFixed(2)}</span>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
