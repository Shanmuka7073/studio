'use client';

import { useFirebase } from '@/firebase';
import { Order } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import { getOrdersAction } from '@/app/actions';

export default function MyOrdersPage() {
  const { user, isUserLoading } = useFirebase();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchOrders() {
      if (user) {
        setIsLoading(true);
        const fetchedOrders = await getOrdersAction({ by: 'userId', value: user.uid });
        // The dates from the server action will be ISO strings, so we convert them back to Date objects for formatting
        const ordersWithDates = fetchedOrders.map(o => ({...o, orderDate: parseISO(o.orderDate as any)}));
        setOrders(ordersWithDates as any);
        setIsLoading(false);
      }
    }
    
    // We run the effect when the user object is available, not just when loading is finished.
    fetchOrders();

  }, [user]);

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
          ) : !orders || orders.length === 0 ? (
            <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">You haven't placed any orders yet.</p>
                <Button asChild>
                    <Link href="/stores">Start Shopping</Link>
                </Button>
            </div>
          ) : (
            <Accordion type="single" collapsible className="w-full">
              {orders.map((order) => (
                <AccordionItem value={order.id} key={order.id}>
                  <AccordionTrigger>
                    <div className="flex justify-between w-full pr-4">
                        <div className="flex-1 text-left">
                            <p className="font-medium">Order #{order.id.substring(0, 7)}</p>
                            <p className="text-sm text-muted-foreground">{format(order.orderDate, 'PPP')}</p>
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
