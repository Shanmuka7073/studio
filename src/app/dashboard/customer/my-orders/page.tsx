
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
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { useState, useEffect, useMemo, useRef }from 'react';
import { FirestorePermissionError } from '@/firebase/errors';
import { useToast } from '@/hooks/use-toast';

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
  
  const regularOrdersQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
        collection(firestore, 'orders'),
        where('userId', '==', user.uid),
        orderBy('orderDate', 'desc')
    );
  }, [firestore, user?.uid]);

  const voiceOrdersQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
        collection(firestore, 'voice-orders'),
        where('userId', '==', user.uid),
        orderBy('orderDate', 'desc')
    );
  }, [firestore, user?.uid]);

  const { data: regularOrders, isLoading: regularOrdersLoading } = useCollection<Order>(regularOrdersQuery);
  const { data: voiceOrders, isLoading: voiceOrdersLoading } = useCollection<Order>(voiceOrdersQuery);

  const allOrders = useMemo(() => {
    if (!regularOrders && !voiceOrders) return [];
    
    const combined = [...(regularOrders || []), ...(voiceOrders || [])];
    
    return combined.sort((a, b) => {
        const dateA = a.orderDate as any;
        const dateB = b.orderDate as any;
        if (!dateA || !dateB) return 0;
        const secondsA = dateA.seconds || (dateA.getTime ? dateA.getTime() / 1000 : 0);
        const secondsB = dateB.seconds || (dateB.getTime ? dateB.getTime() / 1000 : 0);
        return secondsB - secondsA;
    });

  }, [regularOrders, voiceOrders]);

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

  const effectiveLoading = isUserLoading || regularOrdersLoading || voiceOrdersLoading;

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
                                                <TableCell>{item.name}</TableCell>
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
                        ) : order.voiceMemoUrl ? (
                             <div className="space-y-4">
                                <h4 className="font-semibold">Voice Order</h4>
                                <audio src={order.voiceMemoUrl} controls className="w-full" />
                                {order.translatedList && (
                                    <div>
                                        <h5 className="font-semibold text-sm">Transcribed List:</h5>
                                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{order.translatedList}</p>
                                    </div>
                                )}
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

    
