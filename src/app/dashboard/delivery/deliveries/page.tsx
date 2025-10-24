
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

  // This query now targets the 'voice-orders' collection, which is more secure and specific.
  // This prevents trying to read all documents from the main 'orders' collection.
  const deliveriesQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'voice-orders');
  }, [firestore]);

  const { data: deliveries, isLoading } = useCollection<Order>(deliveriesQuery);

  const openInGoogleMaps = (address: string) => {
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="container mx-auto py-12 px-4 md:px-6">
      <h1 className="text-4xl font-bold mb-8 font-headline">Voice Memo Deliveries</h1>
      <Card>
        <CardHeader>
          <CardTitle>New Voice Orders to Fulfill</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p>Loading deliveries...</p>
          ) : !deliveries || deliveries.length === 0 ? (
            <p className="text-muted-foreground">No new voice orders are currently available for delivery.</p>
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
                       <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openInGoogleMaps(order.deliveryAddress)}
                        >
                          <MapPin className="mr-2 h-4 w-4" />
                          View on Map
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
