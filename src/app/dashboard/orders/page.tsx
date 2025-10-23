'use client';

import { useFirebase } from '@/firebase';
import { Order, Store } from '@/lib/types';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import { useCollection, useMemoFirebase } from '@/firebase';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';


function OrderDetailsDialog({ order, isOpen, onClose }: { order: Order | null; isOpen: boolean; onClose: () => void }) {
    if (!order) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Order Details</DialogTitle>
                    <DialogDescription>Order ID: {order.id.substring(0, 7)}</DialogDescription>
                </DialogHeader>
                <ScrollArea className="max-h-[60vh]">
                <div className="grid gap-4 py-4 pr-6">
                    {order.translatedList && (
                         <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">Translated Shopping List</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <pre className="text-sm whitespace-pre-wrap font-sans bg-muted/50 p-4 rounded-md">
                                    {order.translatedList}
                                </pre>
                            </CardContent>
                        </Card>
                    )}
                     {order.voiceMemoUrl && (
                        <Card>
                            <CardHeader><CardTitle className="text-lg">Customer Voice Memo</CardTitle></CardHeader>
                            <CardContent>
                                 <audio src={order.voiceMemoUrl} controls className="w-full" />
                            </CardContent>
                        </Card>
                    )}
                    {order.items && order.items.length > 0 && (
                       <Card>
                            <CardHeader><CardTitle className="text-lg">Items from Cart</CardTitle></CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Item</TableHead>
                                            <TableHead>Qty</TableHead>
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
                            </CardContent>
                        </Card>
                    )}
                     <Card>
                        <CardHeader><CardTitle className="text-lg">Customer Details</CardTitle></CardHeader>
                        <CardContent className="text-sm space-y-2">
                             <p><strong>Name:</strong> {order.customerName}</p>
                             <p><strong>Address:</strong> {order.deliveryAddress}</p>
                             <p><strong>Email:</strong> {order.email}</p>
                             <p><strong>Phone:</strong> {order.phone}</p>
                        </CardContent>
                    </Card>
                </div>
                </ScrollArea>
                <DialogFooter>
                    <Button onClick={onClose}>Close</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}


export default function OrdersDashboardPage() {
  const { firestore, user, isUserLoading } = useFirebase();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // 1. Get the current user's store
  const storeQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(collection(firestore, 'stores'), where('ownerId', '==', user.uid));
  }, [firestore, user]);
  const { data: stores, isLoading: isStoreLoading } = useCollection<Store>(storeQuery);
  const myStore = stores?.[0];

  // 2. Get orders for that store using a client-side listener
  const ordersQuery = useMemoFirebase(() => {
    if (!firestore || !myStore) return null;
    return query(
        collection(firestore, 'orders'), 
        where('storeId', '==', myStore.id),
        orderBy('orderDate', 'desc')
    );
  }, [firestore, myStore]);
  const { data: orders, isLoading: areOrdersLoading } = useCollection<Order>(ordersQuery);


  const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
        case 'Delivered': return 'default';
        case 'Processing': return 'secondary';
        case 'Out for Delivery': return 'outline';
        default: return 'secondary';
    }
  }

  const formatDate = (date: any) => {
    if (!date) return 'N/A';
    if (date.seconds) {
      return format(new Date(date.seconds * 1000), 'PPP');
    }
    return format(parseISO(date as string), 'PPP');
  }

  const isLoading = isUserLoading || isStoreLoading || (myStore && areOrdersLoading);

  return (
    <div className="container mx-auto py-12 px-4 md:px-6">
       <OrderDetailsDialog order={selectedOrder} isOpen={!!selectedOrder} onClose={() => setSelectedOrder(null)} />
      <h1 className="text-4xl font-bold mb-8 font-headline">Order Management</h1>
      <Card>
        <CardHeader>
          <CardTitle>{myStore ? `Incoming Orders for ${myStore.name}` : 'Your Orders'}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p>Loading orders...</p>
          ) : !myStore ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">You need to create a store to see your orders.</p>
              <Button asChild>
                <Link href="/dashboard/my-store">Create Store</Link>
              </Button>
            </div>
          ) : orders && orders.length === 0 ? (
            <p className="text-muted-foreground">No orders found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders && orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium truncate max-w-[100px]">{order.id}</TableCell>
                    <TableCell>{order.customerName}</TableCell>
                    <TableCell>{formatDate(order.orderDate)}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(order.status)}>{order.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">${order.totalAmount.toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => setSelectedOrder(order)}>
                            View Details
                        </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
