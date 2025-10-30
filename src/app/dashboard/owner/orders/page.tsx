
'use client';

import { useFirebase, errorEmitter, FirestorePermissionError, useCollection, useMemoFirebase } from '@/firebase';
import { Order, Store } from '@/lib/types';
import { collection, query, where, orderBy, getDocs, doc, updateDoc } from 'firebase/firestore';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useState, useEffect, useTransition, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useRouter } from 'next/navigation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

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


const formatDateSafe = (date: any) => {
    if (!date) return 'N/A';
    if (date.seconds) {
        return format(new Date(date.seconds * 1000), 'PPP p');
    }
    if (typeof date === 'string') {
        try {
        return format(new Date(date), 'PPP p');
        } catch {
        return 'Invalid Date';
        }
    }
    if (date instanceof Date) {
        return format(date, 'PPP p');
    }
    return 'N/A';
}

function OrderDetailsDialog({ order, isOpen, onClose }: { order: Order | null; isOpen: boolean; onClose: () => void }) {
    if (!order) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Order Details</DialogTitle>
                    <DialogDescription>
                        ID: {order.id} | Placed on: {formatDateSafe(order.orderDate)}
                    </DialogDescription>
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
                                                <TableCell className="text-right">₹{item.price.toFixed(2)}</TableCell>
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
            <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="Update status" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="Processing">Processing</SelectItem>
                <SelectItem value="Out for Delivery">Out for Delivery</SelectItem>
                <SelectItem value="Delivered">Delivered</SelectItem>
                <SelectItem value="Cancelled">Cancelled</SelectItem>
            </SelectContent>
        </Select>
    )
}


export default function OrdersDashboardPage() {
  const { firestore, user, isUserLoading } = useFirebase();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [newOrderAlert, setNewOrderAlert] = useState<Order | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login?redirectTo=/dashboard/owner/orders');
    }
  }, [isUserLoading, user, router]);

  const storeQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(collection(firestore, 'stores'), where('ownerId', '==', user.uid));
  }, [firestore, user]);
  
  const { data: stores, isLoading: isStoreLoading } = useCollection<Store>(storeQuery);
  const myStore = useMemo(() => stores?.[0], [stores]);

  const regularOrdersQuery = useMemoFirebase(() => {
      if (!firestore || !myStore) return null;
      return query(
          collection(firestore, 'orders'),
          where('storeId', '==', myStore.id),
          orderBy('orderDate', 'desc')
      );
  }, [firestore, myStore]);

  const pendingVoiceOrdersQuery = useMemoFirebase(() => {
      if (!firestore || !user) return null; // Guard against no user
      // Fetch all pending voice orders, as they are unassigned.
      return query(
          collection(firestore, 'voice-orders'),
          where('status', '==', 'Pending')
      );
  }, [firestore, user]);

  const assignedVoiceOrdersQuery = useMemoFirebase(() => {
      if (!firestore || !myStore) return null;
      return query(
          collection(firestore, 'voice-orders'),
          where('storeId', '==', myStore.id)
      )
  }, [firestore, myStore]);
  
  const { data: regularOrders, isLoading: regularOrdersLoading } = useCollection<Order>(regularOrdersQuery);
  const { data: pendingVoiceOrders, isLoading: voiceOrdersLoading } = useCollection<Order>(pendingVoiceOrdersQuery);
  const { data: assignedVoiceOrders, isLoading: assignedVoiceOrdersLoading } = useCollection<Order>(assignedVoiceOrdersQuery);

  const allOrders = useMemo(() => {
      const combined = [
          ...(regularOrders || []),
          ...(pendingVoiceOrders || []),
          ...(assignedVoiceOrders || [])
      ];
      
      const uniqueOrders = Array.from(new Map(combined.map(order => [order.id, order])).values());

      return uniqueOrders.sort((a, b) => {
        const dateA = a.orderDate as any;
        const dateB = b.orderDate as any;
        if (!dateA || !dateB) return 0;
        const secondsA = dateA.seconds || new Date(dateA).getTime() / 1000;
        const secondsB = dateB.seconds || new Date(dateB).getTime() / 1000;
        return secondsB - secondsA;
      });
  }, [regularOrders, pendingVoiceOrders, assignedVoiceOrders]);

  const prevOrdersRef = useRef<Map<string, Order>>(new Map());

  useEffect(() => {
    const currentOrdersMap = new Map(allOrders.map(order => [order.id, order]));
    
    // Don't run on the very first load of data
    if (prevOrdersRef.current.size > 0) {
        currentOrdersMap.forEach((currentOrder, orderId) => {
            const prevOrder = prevOrdersRef.current.get(orderId);

            // A new order with "Pending" status appeared
            if (!prevOrder && currentOrder.status === 'Pending' && !newOrderAlert) {
                // If it's a voice order, only alert if storeId is missing (unclaimed)
                if (currentOrder.voiceMemoUrl && !currentOrder.storeId) {
                    setNewOrderAlert(currentOrder);
                    playAlarm();
                } 
                // If it's a regular cart order, alert if it belongs to my store
                else if (currentOrder.storeId === myStore?.id) {
                    setNewOrderAlert(currentOrder);
                    playAlarm();
                }
            }
            // An existing order changed status
            else if (prevOrder && prevOrder.status !== currentOrder.status) {
              const toastMessage = `Order #${currentOrder.id.substring(0, 7)} for ${currentOrder.customerName} is now "${currentOrder.status}".`;
              toast({
                title: "Order Status Updated",
                description: toastMessage,
              });

              if (currentOrder.status === 'Out for Delivery' || currentOrder.status === 'Delivered') {
                playAlarm();
              }
            }
      });
    }

    prevOrdersRef.current = currentOrdersMap;
  }, [allOrders, toast, myStore?.id, newOrderAlert]);


  const handleStatusChange = (orderId: string, collectionName: 'orders' | 'voice-orders', newStatus: Order['status']) => {
    if (!firestore) return;
    
    const orderDocRef = doc(firestore, collectionName, orderId);
    
    const updatePayload: any = { status: newStatus };
    
    if (collectionName === 'voice-orders' && newStatus !== 'Pending' && myStore) {
        updatePayload.storeId = myStore.id;
    }
    
    if (newStatus === 'Out for Delivery') {
        updatePayload.deliveryPartnerId = null;
    }

    updateDoc(orderDocRef, updatePayload)
        .then(() => {
            toast({
                title: "Status Updated",
                description: `Order ${orderId.substring(0,7)} marked as ${newStatus}.`,
            });
            if (newOrderAlert?.id === orderId) {
                setNewOrderAlert(null);
            }
        })
        .catch(async (serverError) => {
            const permissionError = new FirestorePermissionError({
                path: orderDocRef.path,
                operation: 'update',
                requestResourceData: updatePayload,
            });
            errorEmitter.emit('permission-error', permissionError);
        });
  };

  const handleAlertAction = (action: 'accept' | 'reject') => {
    if (!newOrderAlert) return;
    const newStatus = action === 'accept' ? 'Processing' : 'Cancelled';
    const collectionName = newOrderAlert.voiceMemoUrl ? 'voice-orders' : 'orders';
    handleStatusChange(newOrderAlert.id, collectionName, newStatus);
  };

  const formatDate = (date: any) => {
    if (!date) return 'N/A';
    if (date.seconds) {
      return format(new Date(date.seconds * 1000), 'PPP');
    }
    try {
        return format(new Date(date as string), 'PPP');
    } catch {
        return 'Invalid Date';
    }
  }

  const finalLoading = isUserLoading || isStoreLoading || regularOrdersLoading || voiceOrdersLoading || assignedVoiceOrdersLoading;

  return (
    <div className="container mx-auto py-12 px-4 md:px-6">
       <OrderDetailsDialog order={selectedOrder} isOpen={!!selectedOrder} onClose={() => setSelectedOrder(null)} />
       
       <AlertDialog open={!!newOrderAlert} onOpenChange={() => {}}>
          <AlertDialogContent>
              <AlertDialogHeader>
                  <AlertDialogTitle>You Have a New Order!</AlertDialogTitle>
                  <AlertDialogDescription>
                      A new order has been placed by {newOrderAlert?.customerName}. Please review the details and accept or reject it.
                  </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="p-1">
                 <ScrollArea className="max-h-[50vh]">
                    <div className="grid gap-4 py-4 pr-6">
                         {newOrderAlert?.translatedList && (
                             <Card>
                                <CardHeader>
                                    <CardTitle className="text-lg">Translated Shopping List</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <pre className="text-sm whitespace-pre-wrap font-sans bg-muted/50 p-4 rounded-md">
                                        {newOrderAlert.translatedList}
                                    </pre>
                                </CardContent>
                            </Card>
                        )}
                         {newOrderAlert?.voiceMemoUrl && (
                            <Card>
                                <CardHeader><CardTitle className="text-lg">Customer Voice Memo</CardTitle></CardHeader>
                                <CardContent>
                                     <audio src={newOrderAlert.voiceMemoUrl} controls className="w-full" />
                                </CardContent>
                            </Card>
                        )}
                        {newOrderAlert?.items && newOrderAlert.items.length > 0 && (
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
                                            {newOrderAlert.items.map((item, index) => (
                                                <TableRow key={index}>
                                                    <TableCell>{item.name}</TableCell>
                                                    <TableCell>{item.quantity}</TableCell>
                                                    <TableCell className="text-right">₹{item.price.toFixed(2)}</TableCell>
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
                                 <p><strong>Name:</strong> {newOrderAlert?.customerName}</p>
                                 <p><strong>Address:</strong> {newOrderAlert?.deliveryAddress}</p>
                                 <p><strong>Email:</strong> {newOrderAlert?.email}</p>
                                 <p><strong>Phone:</strong> {newOrderAlert?.phone}</p>
                            </CardContent>
                        </Card>
                    </div>
                </ScrollArea>
              </div>
              <AlertDialogFooter>
                  <AlertDialogAction asChild>
                      <Button variant="destructive" onClick={() => handleAlertAction('reject')}>Reject Order</Button>
                  </AlertDialogAction>
                  <AlertDialogAction asChild>
                      <Button onClick={() => handleAlertAction('accept')}>Accept Order</Button>
                  </AlertDialogAction>
              </AlertDialogFooter>
          </AlertDialogContent>
       </AlertDialog>

      <h1 className="text-4xl font-bold font-headline mb-8">Order Management</h1>
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
          ) : !myStore ? (
             <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">You have not created a store yet. Please create one to see orders.</p>
              <Button asChild>
                <Link href="/dashboard/owner/my-store">Create Store</Link>
              </Button>
            </div>
          ) : allOrders.length === 0 ? (
            <p className="text-muted-foreground">No new orders found.</p>
          ) : (
            <>
            {/* Mobile Card View */}
            <div className="md:hidden space-y-4">
                {allOrders.map(order => (
                    <Card key={order.id}>
                        <CardHeader>
                             <div className="flex justify-between items-start">
                                <div>
                                    <CardTitle className="text-lg">{order.customerName}</CardTitle>
                                    <p className="text-xs text-muted-foreground">ID: {order.id.substring(0,7)}...</p>
                                </div>
                                <Badge variant={order.voiceMemoUrl ? 'outline' : 'secondary'}>
                                    {order.voiceMemoUrl ? 'Voice' : 'Cart'}
                                </Badge>
                             </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                             <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground">Date</span>
                                <span>{formatDate(order.orderDate)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground">Total</span>
                                <span className="font-bold">₹{order.totalAmount.toFixed(2)}</span>
                            </div>
                             <div className="space-y-2">
                                <label className="text-sm font-medium text-muted-foreground">Status</label>
                                <StatusManager order={order} onStatusChange={handleStatusChange} />
                            </div>
                            <Button variant="outline" size="sm" onClick={() => setSelectedOrder(order)} className="w-full">
                                View Details
                            </Button>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block">
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
                        <TableCell className="text-right">₹{order.totalAmount.toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                            <Button variant="outline" size="sm" onClick={() => setSelectedOrder(order)}>
                                View Details
                            </Button>
                        </TableCell>
                    </TableRow>
                    ))}
                </TableBody>
                </Table>
            </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
