
'use client';

import { useFirebase } from '@/firebase';
import { Order, Store } from '@/lib/types';
import { collection, query, where, orderBy, getDocs, doc, updateDoc } from 'firebase/firestore';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import { useCollection, useMemoFirebase } from '@/firebase';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useState, useEffect, useTransition } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useRouter } from 'next/navigation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';


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

function StatusManager({ order, onStatusChange }: { order: Order; onStatusChange: (orderId: string, collection: 'orders' | 'voice-orders', newStatus: Order['status']) => void; }) {
    const [isUpdating, startTransition] = useTransition();

    const handleStatusChange = (newStatus: Order['status']) => {
        startTransition(() => {
            const collectionName = order.voiceMemoUrl ? 'voice-orders' : 'orders';
            onStatusChange(order.id, collectionName, newStatus);
        });
    }

    return (
        <Select onValueChange={handleStatusChange} defaultValue={order.status} disabled={isUpdating}>
            <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Update status" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="Processing">Processing</SelectItem>
                <SelectItem value="Out for Delivery">Out for Delivery</SelectItem>
                <SelectItem value="Delivered">Delivered</SelectItem>
            </SelectContent>
        </Select>
    )
}


export default function OrdersDashboardPage() {
  const { firestore, user, isUserLoading } = useFirebase();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const { toast } = useToast();

  // 1. Redirect if user is not logged in
  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login?redirectTo=/dashboard/owner/orders');
    }
  }, [isUserLoading, user, router]);

  // 2. Get the current user's store
  const storeQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(collection(firestore, 'stores'), where('ownerId', '==', user.uid));
  }, [firestore, user]);
  const { data: stores, isLoading: isStoreLoading } = useCollection<Store>(storeQuery);
  const myStore = stores?.[0];

  const fetchOrders = async () => {
    if (!firestore) return;
    
    setIsLoading(true);
    try {
        let regularOrders: Order[] = [];
        if (myStore) {
            const regularOrdersQuery = query(
                collection(firestore, 'orders'), 
                where('storeId', '==', myStore.id),
                orderBy('orderDate', 'desc')
            );
            const regularOrdersSnapshot = await getDocs(regularOrdersQuery);
            regularOrders = regularOrdersSnapshot.docs.map(doc => ({...doc.data(), id: doc.id})) as Order[];
        }

        // Fetch all pending voice orders, as they are not assigned to a store yet.
        const voiceOrdersQuery = query(
            collection(firestore, 'voice-orders'),
            where('status', '==', 'Pending') 
        );
        const voiceOrdersSnapshot = await getDocs(voiceOrdersQuery);
        const voiceOrders = voiceOrdersSnapshot.docs.map(doc => ({...doc.data(), id: doc.id})) as Order[];
        
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
        console.error("Failed to fetch orders:", error);
    } finally {
        setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isUserLoading && !isStoreLoading) {
        fetchOrders();
    }
  }, [firestore, myStore, isUserLoading, isStoreLoading]);

  const handleStatusChange = async (orderId: string, collectionName: 'orders' | 'voice-orders', newStatus: Order['status']) => {
    if (!firestore) return;
    
    const orderDocRef = doc(firestore, collectionName, orderId);
    
    try {
        // When a store owner processes a voice order, assign their store ID to it.
        const updatePayload: { status: Order['status'], storeId?: string } = { status: newStatus };
        if (collectionName === 'voice-orders' && myStore) {
            updatePayload.storeId = myStore.id;
        }

        await updateDoc(orderDocRef, updatePayload);

        toast({
            title: "Status Updated",
            description: `Order ${orderId.substring(0,7)} marked as ${newStatus}.`,
        });
        // Refetch orders to update the list
        fetchOrders();
    } catch (error) {
        console.error("Failed to update status:", error);
        toast({
            variant: "destructive",
            title: "Update Failed",
            description: "Could not update the order status.",
        });
    }
  };


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
    try {
        return format(parseISO(date as string), 'PPP');
    } catch {
        return format(date, 'PPP');
    }
  }

  const finalLoading = isLoading || isUserLoading || isStoreLoading;

  return (
    <div className="container mx-auto py-12 px-4 md:px-6">
       <OrderDetailsDialog order={selectedOrder} isOpen={!!selectedOrder} onClose={() => setSelectedOrder(null)} />
      <h1 className="text-4xl font-bold mb-8 font-headline">Order Management</h1>
      <Card>
        <CardHeader>
          <CardTitle>{myStore ? `Incoming Orders for ${myStore.name}` : 'Your Orders'}</CardTitle>
          <CardDescription>A combined view of orders from your store and available voice orders.</CardDescription>
        </CardHeader>
        <CardContent>
          {finalLoading ? (
            <p>Loading orders...</p>
          ) : !user ? (
             <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">Please log in to manage orders.</p>
              <Button asChild>
                <Link href="/login?redirectTo=/dashboard/owner/orders">Login</Link>
              </Button>
            </div>
          ) : allOrders.length === 0 ? (
            <p className="text-muted-foreground">No new orders found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                   <TableHead>Type</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium truncate max-w-[100px]">{order.id}</TableCell>
                     <TableCell>
                      {order.voiceMemoUrl ? (
                        <Badge variant="outline">Voice</Badge>
                      ) : (
                        <Badge variant="secondary">Cart</Badge>
                      )}
                    </TableCell>
                    <TableCell>{order.customerName}</TableCell>
                    <TableCell>{formatDate(order.orderDate)}</TableCell>
                    <TableCell>
                      <StatusManager order={order} onStatusChange={handleStatusChange} />
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
