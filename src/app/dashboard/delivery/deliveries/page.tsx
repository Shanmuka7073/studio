
'use client';

import { Order, Store, DeliveryPartner } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MapPin, Check, Banknote } from 'lucide-react';
import { useFirebase, useCollection, useDoc, useMemoFirebase, errorEmitter, FirestorePermissionError } from '@/firebase';
import { collection, query, where, doc, updateDoc, Timestamp, increment, writeBatch } from 'firebase/firestore';
import { useEffect, useState, useMemo, useTransition } from 'react';
import { getStores } from '@/lib/data';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

const DELIVERY_FEE = 30;

function PayoutCard({ partnerData, isLoading, onPayout }: { partnerData: DeliveryPartner | null, isLoading: boolean, onPayout: () => void }) {
    const [isCashingOut, startCashOutTransition] = useTransition();

    const handlePayout = () => {
        startCashOutTransition(() => {
            onPayout();
        });
    }

    const totalEarnings = partnerData?.totalEarnings || 0;

    return (
        <Card className="bg-primary/5">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Banknote className="h-6 w-6 text-primary" />
                    <span>Earnings & Payouts</span>
                </CardTitle>
                <CardDescription>
                    Your current withdrawable balance. Payout requests are processed within 24 hours.
                </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="text-center md:text-left">
                    <p className="text-sm text-muted-foreground">Current Balance</p>
                    {isLoading ? (
                        <p className="text-3xl font-bold">Loading...</p>
                    ) : (
                        <p className="text-3xl font-bold">₹{totalEarnings.toFixed(2)}</p>
                    )}
                </div>
                <Button 
                    size="lg" 
                    onClick={handlePayout}
                    disabled={isCashingOut || isLoading || totalEarnings <= 0}
                >
                    {isCashingOut ? 'Processing...' : 'Request Payout'}
                </Button>
            </CardContent>
        </Card>
    )
}


export default function DeliveriesPage() {
  const { firestore, user } = useFirebase();
  const [stores, setStores] = useState<Store[]>([]);
  const [pickedUpOrders, setPickedUpOrders] = useState<Record<string, boolean>>({});
  const [isUpdating, startUpdateTransition] = useTransition();
  const { toast } = useToast();

  const deliveriesQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(
        collection(firestore, 'orders'),
        where('status', '==', 'Processing'),
        where('deliveryPartnerId', '==', null)
    );
  }, [firestore]);
  
  const { data: deliveries, isLoading: deliveriesLoading } = useCollection<Order>(deliveriesQuery);

  const completedDeliveriesQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    // Secure query: Only fetch deliveries completed by the current user.
    return query(
      collection(firestore, 'orders'),
      where('status', '==', 'Delivered'),
      where('deliveryPartnerId', '==', user.uid)
    );
  }, [firestore, user]);

  const { data: completedDeliveries, isLoading: completedDeliveriesLoading } = useCollection<Order>(completedDeliveriesQuery);

  const partnerDocRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, 'deliveryPartners', user.uid);
  }, [firestore, user]);

  const { data: partnerData, isLoading: partnerLoading } = useDoc<DeliveryPartner>(partnerDocRef);


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
    if (!firestore || !user) return;
     startUpdateTransition(async () => {
        const orderRef = doc(firestore, 'orders', orderId);
        try {
            await updateDoc(orderRef, {
                status: 'Out for Delivery',
                deliveryPartnerId: user.uid,
            });
            setPickedUpOrders(prev => ({ ...prev, [orderId]: true }));
             toast({
                title: "Pickup Confirmed!",
                description: `You are now assigned to deliver order #${orderId.substring(0, 7)}.`
            });
        } catch (error) {
             console.error("Failed to confirm pickup:", error);
            const permissionError = new FirestorePermissionError({
                path: orderRef.path,
                operation: 'update',
                requestResourceData: { status: 'Out for Delivery', deliveryPartnerId: user.uid },
            });
            errorEmitter.emit('permission-error', permissionError);
        }
     });
  };

  const handleMarkAsDelivered = (orderId: string) => {
    if (!firestore || !user) return;
    
    startUpdateTransition(async () => {
        const orderRef = doc(firestore, 'orders', orderId);
        const partnerRef = doc(firestore, 'deliveryPartners', user.uid);
        
        try {
            const batch = writeBatch(firestore);
            
            // 1. Update the order status
            batch.update(orderRef, { status: 'Delivered' });

            // 2. Increment the partner's earnings
            batch.set(partnerRef, { 
                totalEarnings: increment(DELIVERY_FEE),
                userId: user.uid,
                payoutsEnabled: true,
             }, { merge: true });

            await batch.commit();

            toast({
                title: "Delivery Complete!",
                description: `Order #${orderId.substring(0, 7)} marked as delivered. ₹${DELIVERY_FEE} added to your earnings.`
            });
        } catch (error) {
            console.error("Failed to mark as delivered:", error);
            // Since this is a batch, we can't be sure which part failed for a specific error.
            // A generic error is acceptable here for the UI.
            toast({
                variant: 'destructive',
                title: 'Update Failed',
                description: 'Could not update the order status and your earnings. Please try again.'
            });
        }
    });
  };

  const handlePayoutRequest = async () => {
      if (!firestore || !user || !partnerData || partnerData.totalEarnings <= 0) {
          toast({ variant: 'destructive', title: 'Payout Error', description: 'No balance available to cash out.' });
          return;
      }

      const payoutAmount = partnerData.totalEarnings;
      
      try {
        const batch = writeBatch(firestore);
        
        // 1. Create a new payout request document
        const newPayoutRef = doc(collection(firestore, `deliveryPartners/${user.uid}/payouts`));
        batch.set(newPayoutRef, {
            amount: payoutAmount,
            partnerId: user.uid,
            requestDate: Timestamp.now(),
            status: 'pending',
        });

        // 2. Reset the partner's earnings balance
        const partnerRef = doc(firestore, 'deliveryPartners', user.uid);
        batch.update(partnerRef, {
            totalEarnings: 0,
            lastPayoutDate: Timestamp.now(),
        });
        
        await batch.commit();

        toast({
            title: 'Payout Requested!',
            description: `Your request for ₹${payoutAmount.toFixed(2)} has been submitted for processing.`
        });

      } catch (error) {
          console.error("Failed to request payout:", error);
          toast({
              variant: 'destructive',
              title: 'Payout Failed',
              description: 'There was an error submitting your payout request. Please try again.'
          });
      }
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

  const totalEarnings = (completedDeliveries?.length || 0) * DELIVERY_FEE;

  // Filter for orders that the current partner has picked up.
  const myActiveDeliveries = useMemo(() => {
    return deliveriesWithStores.filter(order => order.deliveryPartnerId === user?.uid && order.status === 'Out for Delivery');
  }, [deliveriesWithStores, user]);

  const availableDeliveries = useMemo(() => {
    return deliveriesWithStores.filter(order => order.status === 'Processing');
  }, [deliveriesWithStores]);


  return (
    <div className="container mx-auto py-12 px-4 md:px-6 space-y-12">
      
      <PayoutCard partnerData={partnerData} isLoading={partnerLoading} onPayout={handlePayoutRequest} />
      
      <div>
        <h1 className="text-4xl font-bold mb-8 font-headline">My Active Deliveries</h1>
        <Card>
          <CardHeader>
            <CardTitle>Orders You Are Delivering</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p>Loading your active deliveries...</p>
            ) : !myActiveDeliveries || myActiveDeliveries.length === 0 ? (
              <p className="text-muted-foreground">You have no active deliveries. Pick one from the available list below.</p>
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
                  {myActiveDeliveries.map((order) => (
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
                               {order.store && (
                                  <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => openInGoogleMaps(
                                          order.store!.latitude, 
                                          order.store!.longitude,
                                          order.deliveryLat,
                                          order.deliveryLng,
                                      )}
                                  >
                                      <MapPin className="mr-2 h-4 w-4" />
                                      Route to Customer
                                  </Button>
                              )}
                               <Button
                                      variant="secondary"
                                      size="sm"
                                      onClick={() => handleMarkAsDelivered(order.id)}
                                      disabled={isUpdating}
                                  >
                                      <Check className="mr-2 h-4 w-4" />
                                      {isUpdating ? 'Updating...' : 'Mark as Delivered'}
                                  </Button>
                          </div>
                          <div className="text-sm text-muted-foreground mt-2">{order.deliveryAddress}</div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>


      <div>
        <h2 className="text-3xl font-bold mb-8 font-headline">Available Deliveries</h2>
        <Card>
          <CardHeader>
            <CardTitle>Orders Ready for Pickup</CardTitle>
             <CardDescription>Accept a job to see customer details and delivery route.</CardDescription>
          </CardHeader>
          <CardContent>
            {deliveriesLoading ? (
              <p>Loading deliveries...</p>
            ) : !availableDeliveries || availableDeliveries.length === 0 ? (
              <p className="text-muted-foreground">No orders are currently ready for delivery.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Store Pickup</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {availableDeliveries.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>
                        <div className="font-medium">{order.store?.name}</div>
                        <div className="text-sm text-muted-foreground">{order.store?.address}</div>
                      </TableCell>
                      <TableCell>
                          <div className="font-medium">{order.customerName}</div>
                      </TableCell>
                      <TableCell>
                          <div className="flex items-center gap-2">
                              <Button
                                  variant="default"
                                  size="sm"
                                  onClick={() => handleConfirmPickup(order.id)}
                                  disabled={isUpdating}
                              >
                                  Accept Job & Confirm Pickup
                              </Button>
                          </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-3xl font-bold mb-8 font-headline">Earnings & Completed Deliveries</h2>
         <Card>
            <CardHeader>
                <CardTitle>This Month's Delivered Orders</CardTitle>
                <CardDescription>
                  This is a record of your completed deliveries for the current cycle. Earnings from the 1st to the 30th of the month are paid out on the last day of the month.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {completedDeliveriesLoading ? (
                    <p>Loading completed deliveries...</p>
                ) : !completedDeliveries || completedDeliveries.length === 0 ? (
                    <p className="text-muted-foreground">You have not completed any deliveries yet.</p>
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
                        <TableFooter>
                            <TableRow>
                                <TableCell colSpan={3} className="text-right font-bold text-lg">Total Deliveries in this period</TableCell>
                                <TableCell className="text-right font-bold text-lg">{completedDeliveries.length}</TableCell>
                            </TableRow>
                        </TableFooter>
                    </Table>
                )}
            </CardContent>
        </Card>
      </div>

    </div>
  );
}
