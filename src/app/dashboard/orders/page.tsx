'use client';

import { useFirebase } from '@/firebase';
import { Order, Store } from '@/lib/types';
import { collection, query, where } from 'firebase/firestore';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import { useState, useEffect } from 'react';
import { getOrdersAction } from '@/app/actions';
import { useCollection, useMemoFirebase } from '@/firebase';


export default function OrdersDashboardPage() {
  const { firestore, user, isUserLoading } = useFirebase();
  const [orders, setOrders] = useState<Order[]>([]);
  const [areOrdersLoading, setAreOrdersLoading] = useState(true);

  // 1. Get the current user's store
  const storeQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(collection(firestore, 'stores'), where('ownerId', '==', user.uid));
  }, [firestore, user]);
  const { data: stores, isLoading: isStoreLoading } = useCollection<Store>(storeQuery);
  const myStore = stores?.[0];

  // 2. Get orders for that store using the server action
  useEffect(() => {
    // Only proceed if we have a store object.
    if (myStore) {
      setAreOrdersLoading(true);
      getOrdersAction({ by: 'storeId', value: myStore.id })
        .then(fetchedOrders => {
          // Ensure dates are parsed correctly for display and sorting.
          const ordersWithDates = fetchedOrders.map(o => ({
            ...o,
            orderDate: parseISO(o.orderDate as string), // Server action now returns ISO strings
          }));
          setOrders(ordersWithDates as any);
        })
        .catch(console.error) // Basic error logging
        .finally(() => {
          setAreOrdersLoading(false);
        });
    } else {
        // If there's no store, we shouldn't be in a loading state for orders.
        // This handles the case where a user without a store visits this page.
        if (!isStoreLoading) {
             setAreOrdersLoading(false);
        }
    }
  }, [myStore, isStoreLoading]); // Re-run this effect when the store is found.

  const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
        case 'Delivered': return 'default';
        case 'Processing': return 'secondary';
        case 'Out for Delivery': return 'outline';
        default: return 'secondary';
    }
  }

  // Combine loading states for a clearer UI
  const isLoading = isUserLoading || isStoreLoading || areOrdersLoading;

  return (
    <div className="container mx-auto py-12 px-4 md:px-6">
      <h1 className="text-4xl font-bold mb-8 font-headline">Order Management</h1>
      <Card>
        <CardHeader>
          <CardTitle>{myStore ? `Incoming Orders for ${myStore.name}` : 'Your Orders'}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p>Loading orders...</p>
          ) : !myStore ? (
            <p className="text-muted-foreground">You need to create a store to see orders.</p>
          ) : !orders || orders.length === 0 ? (
            <p className="text-muted-foreground">No orders found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium truncate max-w-[100px]">{order.id}</TableCell>
                    <TableCell>{order.customerName}</TableCell>
                    <TableCell>{order.deliveryAddress}</TableCell>
                    <TableCell>{format(order.orderDate, 'PPP')}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(order.status)}>{order.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">${order.totalAmount.toFixed(2)}</TableCell>
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
