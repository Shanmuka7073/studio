
'use client';

import { useFirebase, errorEmitter, useCollection, useMemoFirebase } from '@/firebase';
import { Order } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { collection, query, where, orderBy, doc, writeBatch, increment } from 'firebase/firestore';
import { useState, useEffect, useMemo, useRef, useTransition } from 'react';
import { FirestorePermissionError } from '@/firebase/errors';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle } from 'lucide-react';

const DELIVERY_FEE = 30;

const playAlarm = () => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (!audioContext) return;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // A5 note
    gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
    
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 1); // Play for 1 second
};


export default function MyOrdersPage() {
  const { user, isUserLoading, firestore } = useFirebase();
  const { toast } = useToast();
  const [isUpdating, startUpdateTransition] = useTransition();
  
  const ordersQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
        collection(firestore, 'orders'),
        where('userId', '==', user.uid),
        orderBy('orderDate', 'desc')
    );
  }, [firestore, user?.uid]);

  const { data: allOrders, isLoading: ordersLoading } = useCollection<Order>(ordersQuery);

  const prevOrdersRef = useRef<Map<string, Order>>(new Map());

  useEffect(() => {
    if (allOrders && allOrders.length > 0) {
      const currentOrdersMap = new Map(allOrders.map(order => [order.id, order]));
      
      currentOrdersMap.forEach((currentOrder, orderId) => {
        const prevOrder = prevOrdersRef.current.get(orderId);
        
        if (prevOrder && prevOrder.status !== currentOrder.status) {
          const toastMessage = `Your order #${currentOrder.id.substring(0, 7)} is now "${currentOrder.status}".`;
          toast({
            title: "Order Status Updated",
            description: toastMessage,
          });
          
          if (currentOrder.status === 'Out for Delivery' || currentOrder.status === 'Delivered') {
            playAlarm();
          }
        }
      });

      prevOrdersRef.current = currentOrdersMap;
    }
  }, [allOrders, toast]);

  const handleConfirmDelivery = (order: Order) => {
    if (!firestore || !user?.uid || !order.deliveryPartnerId) {
        toast({ variant: 'destructive', title: 'Error', description: 'Could not confirm delivery. Partner information is missing.' });
        return;
    }

    startUpdateTransition(async () => {
        const orderRef = doc(firestore, 'orders', order.id);
        const partnerRef = doc(firestore, 'deliveryPartners', order.deliveryPartnerId!);

        try {
            const batch = writeBatch(firestore);

            batch.update(orderRef, { status: 'Delivered' });
            batch.set(partnerRef, {
                totalEarnings: increment(DELIVERY_FEE),
            }, { merge: true });

            await batch.commit();

            toast({
                title: "Order Confirmed!",
                description: "Thank you for confirming your delivery."
            });
        } catch (error) {
            console.error("Failed to confirm delivery by customer:", error);
            const permissionError = new FirestorePermissionError({
                path: orderRef.path,
                operation: 'update',
                requestResourceData: { status: 'Delivered' },
            });
            errorEmitter.emit('permission-error', permissionError);
        }
    });
  };

  const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
        case 'Delivered': return 'default';
        case 'Processing': return 'secondary';
        case 'Out for Delivery': return 'outline';
        case 'Pending': return 'secondary';
        case 'Cancelled': return 'destructive';
        default: return 'secondary';
    }
  }

  const effectiveLoading = isUserLoading || ordersLoading;

  const formatDate = (date: any) => {
    if (!date) return 'N/A';
    if (date.seconds) {
      return format(new Date(date.seconds * 1000), 'PPP p');
    }
    if (typeof date === 'string') {
        try {
            return format(parseISO(date), 'PPP p');
        } catch (e) {
             try {
                return format(new Date(date), 'PPP p');
             } catch(e2) {
                return 'Invalid Date';
             }
        }
    }
    if (date instanceof Date) {
        return format(date, 'PPP p');
    }
    return 'N/A';
  }

  return (
    <div className="container mx-auto py-12 px-4 md:px-6">
      <h1 className="text-4xl font-bold mb-8 font-headline">My Orders</h1>
      <Card>
        <CardHeader>
          <CardTitle>Your Order History</CardTitle>
        </CardHeader>
        <CardContent>
          {effectiveLoading ? (
            <p>Loading your orders...</p>
          ) : !user ? (
            <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">Please log in to see your orders.</p>
                <Button asChild>
                    <Link href="/login">Login</Link>
                </Button>
            </div>
          ) : allOrders && allOrders.length === 0 ? (
            <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">You haven't placed any orders yet.</p>
                <Button asChild>
                    <Link href="/stores">Start Shopping</Link>
                </Button>
            </div>
          ) : (
            <Accordion type="single" collapsible className="w-full">
              {allOrders && allOrders.map((order) => (
                <AccordionItem value={order.id} key={order.id}>
                  <AccordionTrigger>
                    <div className="flex justify-between w-full pr-4">
                        <div className="flex-1 text-left">
                            <p className="font-medium">Order #{order.id.substring(0, 7)}...</p>
                            <p className="text-sm text-muted-foreground">{formatDate(order.orderDate)}</p>
                        </div>
                        <div className="flex-1 text-center">
                            <Badge variant={getStatusVariant(order.status)}>{order.status}</Badge>
                        </div>
                        <div className="flex-1 text-right">
                             <p className="font-medium">₹{order.totalAmount.toFixed(2)}</p>
                        </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="p-4 bg-muted/50 rounded-md">
                        {order.items && order.items.length > 0 ? (
                            <>
                                <h4 className="font-semibold mb-2">Order Items</h4>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Product</TableHead>
                                            <TableHead>Quantity</TableHead>
                                            <TableHead className="text-right">Price</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {order.items.map((item, index) => (
                                            <TableRow key={index}>
                                                <TableCell>{item.productName}</TableCell>
                                                <TableCell>{item.quantity}</TableCell>
                                                <TableCell className="text-right">₹{item.price.toFixed(2)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                                <div className="flex justify-end mt-4 text-sm">
                                    <div className="w-full max-w-xs space-y-2">
                                        <div className="flex justify-between">
                                            <span>Subtotal</span>
                                            <span>₹{(order.totalAmount - DELIVERY_FEE).toFixed(2)}</span>
                                        </div>
                                         <div className="flex justify-between">
                                            <span>Delivery Fee</span>
                                            <span>₹{DELIVERY_FEE.toFixed(2)}</span>
                                        </div>
                                         <div className="flex justify-between font-bold">
                                            <span>Total</span>
                                            <span>₹{order.totalAmount.toFixed(2)}</span>
                                        </div>
                                    </div>
                                </div>
                            </>
                        ) : order.translatedList ? (
                             <div className="space-y-4">
                                <h4 className="font-semibold">Voice Order</h4>
                                <p className="italic text-muted-foreground">"{order.translatedList}"</p>
                                <div className="flex justify-end font-bold">
                                  <span>Total (incl. delivery): ₹{order.totalAmount.toFixed(2)}</span>
                                </div>
                            </div>
                        ) : (
                            <p>This order has no items listed.</p>
                        )}
                        <div className="mt-4">
                            <h4 className="font-semibold">Delivery Address</h4>
                            <p className="text-sm text-muted-foreground">{order.deliveryAddress}</p>
                        </div>
                        {order.status === 'Out for Delivery' && (
                            <div className="mt-6 border-t pt-4 text-center">
                                <p className="text-sm text-muted-foreground mb-2">Has your order arrived?</p>
                                <Button
                                    onClick={() => handleConfirmDelivery(order)}
                                    disabled={isUpdating}
                                >
                                    <CheckCircle className="mr-2 h-4 w-4" />
                                    {isUpdating ? 'Confirming...' : 'Confirm Delivery Received'}
                                </Button>
                            </div>
                        )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

    