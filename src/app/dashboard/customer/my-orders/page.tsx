
'use client';

import { useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { Order } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { useState, useEffect } from 'react';


export default function MyOrdersPage() {
  const { user, isUserLoading, firestore } = useFirebase();
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!firestore || !user) {
      if (!isUserLoading) {
        setIsLoading(false);
      }
      return;
    }

    const fetchOrders = async () => {
      setIsLoading(true);
      try {
        const regularOrdersQuery = query(
          collection(firestore, 'orders'),
          where('userId', '==', user.uid),
          orderBy('orderDate', 'desc')
        );
        const voiceOrdersQuery = query(
          collection(firestore, 'voice-orders'),
          where('userId', '==', user.uid),
          orderBy('orderDate', 'desc')
        );

        const [regularOrdersSnapshot, voiceOrdersSnapshot] = await Promise.all([
            getDocs(regularOrdersQuery),
            getDocs(voiceOrdersQuery)
        ]);

        const regularOrders = regularOrdersSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as Order[];
        const voiceOrders = voiceOrdersSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as Order[];

        const combinedOrders = [...regularOrders, ...voiceOrders].sort((a, b) => {
            const dateA = a.orderDate as any;
            const dateB = b.orderDate as any;
            if (!dateA || !dateB) return 0;
            const secondsA = dateA.seconds || new Date(dateA).getTime() / 1000;
            const secondsB = dateB.seconds || new Date(dateB).getTime() / 1000;
            return secondsB - secondsA;
        });
        
        setAllOrders(combinedOrders);
      } catch (error) {
        console.error("Error fetching orders:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrders();
  }, [firestore, user, isUserLoading]);


  const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
        case 'Delivered': return 'default';
        case 'Processing': return 'secondary';
        case 'Out for Delivery': return 'outline';
        case 'Pending': return 'secondary';
        default: return 'secondary';
    }
  }

  const effectiveLoading = isLoading || isUserLoading;

  const formatDate = (date: any) => {
    if (!date) return 'N/A';
    // Firebase Timestamps may be objects with seconds/nanoseconds
    if (date.seconds) {
      return format(new Date(date.seconds * 1000), 'PPP');
    }
    // Or they may be ISO strings from older data
    return format(parseISO(date as string), 'PPP');
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
                             <p className="font-medium">${order.totalAmount.toFixed(2)}</p>
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
                                                <TableCell className="text-right">${item.price.toFixed(2)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
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
