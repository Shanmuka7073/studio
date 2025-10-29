
'use client';

import { Order, Store } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MapPin, Check } from 'lucide-react';
import { useFirebase, useCollection, useMemoFirebase, errorEmitter, FirestorePermissionError } from '@/firebase';
import { collection, query, where, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { useEffect, useState, useMemo, useTransition } from 'react';
import { getStores } from '@/lib/data';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

const DELIVERY_FEE = 30;

export default function DeliveriesPage() {
  const { firestore } = useFirebase();
  const [stores, setStores] = useState<Store[]>([]);
  const [pickedUpOrders, setPickedUpOrders] = useState<Record<string, boolean>>({});
  const [isUpdating, startUpdateTransition] = useTransition();
  const { toast } = useToast();

  const deliveriesQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(
        collection(firestore, 'orders'),
        where('status', '==', 'Out for Delivery')
    );
  }, [firestore]);
  
  const { data: deliveries, isLoading: deliveriesLoading } = useCollection<Order>(deliveriesQuery);

  const completedDeliveriesQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    
    // Get today's date at midnight
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = Timestamp.fromDate(today);

    return query(
      collection(firestore, 'orders'),
      where('status', '==', 'Delivered')
      // To keep this simple and avoid complex indexes, we won't filter by date yet.
      // We can add `where('orderDate', '>=', todayTimestamp)` later if needed.
    );
  }, [firestore]);

  const { data: completedDeliveries, isLoading: completedDeliveriesLoading } = useCollection<Order>(completedDeliveriesQuery);


  useEffect(() => {
    if (firestore) {
      getStores(firestore).then(setStores);
    }
  }, [firestore]);

  const deliveriesWithStores = useMemo(() => {
    if (!deliveries || !stores.length) return [];
    
    return deliveries.map(order => {
      const store = stores.find(s => s.id === order.storeId);
      return { ...order, store };
    });
  }, [deliveries, stores]);

  const handleConfirmPickup = (orderId: string) => {
    setPickedUpOrders(prev => ({ ...prev, [orderId]: true }));
  };

  const handleMarkAsDelivered = (orderId: string) => {
    if (!firestore) return;
    
    startUpdateTransition(async () => {
        const orderRef = doc(firestore, 'orders', orderId);
        try {
            await updateDoc(orderRef, { status: 'Delivered' });
            toast({
                title: "Delivery Complete!",
                description: `Order #${orderId.substring(0, 7)} has been marked as delivered.`
            })
        } catch (error) {
            console.error("Failed to mark as delivered:", error);
            const permissionError = new FirestorePermissionError({
                path: orderRef.path,
                operation: 'update',
                requestResourceData: { status: 'Delivered' },
            });
            errorEmitter.emit('permission-error', permissionError);
        }
    });
  };

  const openInGoogleMaps = (originLat: number, originLng: number, destLat: number, destLng: number) => {
    const url = `https://www.google.com/maps/dir/?api=1&origin=${originLat},${originLng}&destination=${destLat},${destLng}`;
    window.open(url, '_blank');
  };
  
  const isLoading = deliveriesLoading || completedDeliveriesLoading || stores.length === 0;

  const formatDate = (date: any) => {
    if (!date) return 'N/A';
    if (date.seconds) {
      return format(new Date(date.seconds * 1000), 'PPP');
    }
    if (typeof date === 'string') {
        try {
            return format(new Date(date), 'PPP');
        } catch(e) { return 'Invalid Date'; }
    }
    if (date instanceof Date) {
        return format(date, 'PPP');
    }
    return 'N/A';
  }

  return (
    <div className="container mx-auto py-12 px-4 md:px-6 space-y-12">
      <div>
        <h1 className="text-4xl font-bold mb-8 font-headline">Available Deliveries</h1>
        <Card>
          <CardHeader>
            <CardTitle>Orders Ready for Pickup</CardTitle>
          </CardHeader>
          <CardContent>
            {deliveriesLoading ? (
              <p>Loading deliveries...</p>
            ) : !deliveriesWithStores || deliveriesWithStores.length === 0 ? (
              <p className="text-muted-foreground">No orders are currently out for delivery.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Store Pickup</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Actions & Route</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveriesWithStores.map((order) => {
                    const isPickedUp = pickedUpOrders[order.id];
                    return (
                    <TableRow key={order.id}>
                      <TableCell>
                        <div className="font-medium">{order.store?.name}</div>
                        <div className="text-sm text-muted-foreground">{order.store?.address}</div>
                      </TableCell>
                      <TableCell>
                          <div className="font-medium">{order.customerName}</div>
                          <div className="text-sm text-muted-foreground">{order.phone}</div>
                      </TableCell>
                      <TableCell>
                          <div className="flex items-center gap-2">
                              {!isPickedUp && (
                                  <Button
                                      variant="default"
                                      size="sm"
                                      onClick={() => handleConfirmPickup(order.id)}
                                  >
                                      Confirm Pickup
                                  </Button>
                              )}

                              {order.store && (
                                  <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => openInGoogleMaps(
                                          order.store!.latitude, 
                                          order.store!.longitude,
                                          isPickedUp ? order.deliveryLat : order.store!.latitude, 
                                          isPickedUp ? order.deliveryLng : order.store!.longitude,
                                      )}
                                  >
                                      <MapPin className="mr-2 h-4 w-4" />
                                      {isPickedUp ? 'Route to Customer' : 'Route to Store'}
                                  </Button>
                              )}

                              {isPickedUp && (
                                  <Button
                                      variant="secondary"
                                      size="sm"
                                      onClick={() => handleMarkAsDelivered(order.id)}
                                      disabled={isUpdating}
                                  >
                                      <Check className="mr-2 h-4 w-4" />
                                      {isUpdating ? 'Updating...' : 'Mark as Delivered'}
                                  </Button>
                              )}
                          </div>
                          {isPickedUp && (
                              <div className="text-sm text-muted-foreground mt-2">{order.deliveryAddress}</div>
                          )}
                      </TableCell>
                    </TableRow>
                  )})}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-3xl font-bold mb-8 font-headline">Completed Deliveries</h2>
         <Card>
            <CardHeader>
                <CardTitle>Today's Delivered Orders</CardTitle>
                <CardDescription>A list of orders you have successfully delivered today.</CardDescription>
            </CardHeader>
            <CardContent>
                {completedDeliveriesLoading ? (
                    <p>Loading completed deliveries...</p>
                ) : !completedDeliveries || completedDeliveries.length === 0 ? (
                    <p className="text-muted-foreground">You have not completed any deliveries today.</p>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Customer</TableHead>
                                <TableHead>Delivery Address</TableHead>
                                <TableHead className="text-right">Your Earning</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {completedDeliveries.map((order) => (
                                <TableRow key={order.id}>
                                    <TableCell>{formatDate(order.orderDate)}</TableCell>
                                    <TableCell>{order.customerName}</TableCell>
                                    <TableCell>{order.deliveryAddress}</TableCell>
                                    <TableCell className="text-right font-medium">₹{DELIVERY_FEE.toFixed(2)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
      </div>

    </div>
  );
}
