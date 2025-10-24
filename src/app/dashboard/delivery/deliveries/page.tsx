
'use client';

import { Order, Store } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MapPin, Check } from 'lucide-react';
import { useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import { useEffect, useState, useMemo } from 'react';
import { getStores } from '@/lib/data';

export default function DeliveriesPage() {
  const { firestore } = useFirebase();
  const [stores, setStores] = useState<Store[]>([]);
  const [pickedUpOrders, setPickedUpOrders] = useState<Record<string, boolean>>({});

  const deliveriesQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(
        collection(firestore, 'orders'),
        where('status', '==', 'Out for Delivery')
    );
  }, [firestore]);
  
  const { data: deliveries, isLoading: deliveriesLoading } = useCollection<Order>(deliveriesQuery);

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

  const openInGoogleMaps = (origin: string, destination: string) => {
    const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`;
    window.open(url, '_blank');
  };
  
  const isLoading = deliveriesLoading || stores.length === 0;

  return (
    <div className="container mx-auto py-12 px-4 md:px-6">
      <h1 className="text-4xl font-bold mb-8 font-headline">Available Deliveries</h1>
      <Card>
        <CardHeader>
          <CardTitle>Orders Ready for Pickup</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p>Loading deliveries...</p>
          ) : !deliveriesWithStores || deliveriesWithStores.length === 0 ? (
            <p className="text-muted-foreground">No orders are currently out for delivery.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Store Pickup</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Customer Phone</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Route</TableHead>
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
                    <TableCell>{order.customerName}</TableCell>
                    <TableCell>{order.phone}</TableCell>
                     <TableCell>
                      <Button
                        variant={isPickedUp ? "secondary" : "default"}
                        size="sm"
                        onClick={() => handleConfirmPickup(order.id)}
                        disabled={isPickedUp}
                      >
                        {isPickedUp && <Check className="mr-2 h-4 w-4" />}
                        {isPickedUp ? 'Picked Up' : 'Confirm Pickup'}
                      </Button>
                    </TableCell>
                    <TableCell>
                       {order.store && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openInGoogleMaps(
                                order.store!.address, 
                                isPickedUp ? order.deliveryAddress : order.store!.address
                            )}
                          >
                            <MapPin className="mr-2 h-4 w-4" />
                            {isPickedUp ? 'View Route to Customer' : 'View Route to Store'}
                          </Button>
                       )}
                       {isPickedUp && (
                            <div className="text-sm text-muted-foreground mt-1">{order.deliveryAddress}</div>
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
  );
}
