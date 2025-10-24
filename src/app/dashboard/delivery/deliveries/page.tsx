
'use client';

import { Order } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MapPin } from 'lucide-react';
import { useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';

export default function DeliveriesPage() {
  const { firestore } = useFirebase();

  const deliveriesQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    // This query is now more specific to prevent security rule violations.
    // In a real app, you might also add a where clause for a specific city or region.
    return query(collection(firestore, 'orders'), where('status', '==', 'Pending'));
  }, [firestore]);

  const { data: deliveries, isLoading } = useCollection<Order>(deliveriesQuery);

  const openInGoogleMaps = (lat: number, lng: number) => {
    const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    window.open(url, '_blank');
  };

  return (
    <div className="container mx-auto py-12 px-4 md:px-6">
      <h1 className="text-4xl font-bold mb-8 font-headline">Active Deliveries</h1>
      <Card>
        <CardHeader>
          <CardTitle>New Orders to Deliver</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p>Loading deliveries...</p>
          ) : !deliveries || deliveries.length === 0 ? (
            <p className="text-muted-foreground">No new orders are currently available for delivery.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Location</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveries.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium truncate max-w-[100px]">{order.id}</TableCell>
                    <TableCell>{order.customerName}</TableCell>
                    <TableCell>{order.deliveryAddress}</TableCell>
                    <TableCell>
                      {order.deliveryLat && order.deliveryLng ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openInGoogleMaps(order.deliveryLat!, order.deliveryLng!)}
                        >
                          <MapPin className="mr-2 h-4 w-4" />
                          View on Map
                        </Button>
                      ) : (
                        <span className="text-muted-foreground text-xs">No GPS data</span>
                      )}
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
