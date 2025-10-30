'use client';

import { Order, Store, DeliveryPartner, Payout } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MapPin, Check, Banknote, History, Landmark, Receipt, CreditCard, ChevronDown, ChevronUp } from 'lucide-react';
import { useFirebase, useCollection, useDoc, useMemoFirebase, errorEmitter, FirestorePermissionError } from '@/firebase';
import { collection, query, where, doc, updateDoc, Timestamp, increment, writeBatch, orderBy, setDoc } from 'firebase/firestore';
import { useEffect, useState, useMemo, useTransition } from 'react';
import { getStores } from '@/lib/data';
import { useToast } from '@/hooks/use-toast';
import { format, formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

const DELIVERY_FEE = 30;
const DELIVERY_PROXIMITY_THRESHOLD_KM = 0.1; // 100 meters

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in kilometers
}


const payoutDetailsSchema = z.object({
  payoutMethod: z.enum(['bank', 'upi']),
  upiId: z.string().optional(),
  accountHolderName: z.string().optional(),
  accountNumber: z.string().optional(),
  ifscCode: z.string().optional(),
}).refine(data => {
    if (data.payoutMethod === 'upi') {
        return !!data.upiId && data.upiId.includes('@');
    }
    if (data.payoutMethod === 'bank') {
        return !!data.accountHolderName && !!data.accountNumber && !!data.ifscCode;
    }
    return false;
}, {
    message: "Please fill in all required fields for the selected payout method.",
    path: ['payoutMethod'],
});

type PayoutDetailsFormValues = z.infer<typeof payoutDetailsSchema>;

function OrderDetailsDialog({ order, isOpen, onClose, onAccept }: { order: Order | null; isOpen: boolean; onClose: () => void, onAccept?: () => void }) {
    if (!order) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Order Details</DialogTitle>
                    <DialogDescription>
                        ID: {order.id} | Placed by: {order.customerName}
                    </DialogDescription>
                </DialogHeader>
                <ScrollArea className="max-h-[60vh]">
                    <div className="grid gap-4 py-4 pr-6">
                        {order.items && order.items.length > 0 ? (
                           <Card>
                                <CardHeader><CardTitle className="text-lg">Order Items</CardTitle></CardHeader>
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
                        ) : (
                            <p>No items listed for this order.</p>
                        )}
                         <Card>
                            <CardHeader><CardTitle className="text-lg">Delivery Details</CardTitle></CardHeader>
                            <CardContent className="text-sm space-y-2">
                                 <p><strong>Pickup:</strong> {order.store?.name} - {order.store?.address}</p>
                                 <p><strong>Drop-off:</strong> {order.customerName} - {order.deliveryAddress}</p>
                            </CardContent>
                        </Card>
                    </div>
                </ScrollArea>
                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={onClose}>Close</Button>
                    {onAccept && <Button onClick={onAccept}>Accept Job & Confirm Pickup</Button>}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function PayoutSettingsCard({ partnerData, isLoading, partnerId }: { partnerData: DeliveryPartner | null, isLoading: boolean, partnerId: string }) {
    const { firestore } = useFirebase();
    const { toast } = useToast();
    const [isSaving, startSaveTransition] = useTransition();
    const [isEditing, setIsEditing] = useState(false);

    const form = useForm<PayoutDetailsFormValues>({
        resolver: zodResolver(payoutDetailsSchema),
        defaultValues: {
            payoutMethod: partnerData?.payoutMethod || 'bank',
            upiId: partnerData?.upiId || '',
            accountHolderName: partnerData?.bankDetails?.accountHolderName || '',
            accountNumber: partnerData?.bankDetails?.accountNumber || '',
            ifscCode: partnerData?.bankDetails?.ifscCode || '',
        }
    });
    
    const watchPayoutMethod = form.watch('payoutMethod');

    useEffect(() => {
        if (!isLoading && partnerData) {
            form.reset({
                payoutMethod: partnerData.payoutMethod || 'bank',
                upiId: partnerData.upiId || '',
                accountHolderName: partnerData.bankDetails?.accountHolderName || '',
                accountNumber: partnerData.bankDetails?.accountNumber || '',
                ifscCode: partnerData.bankDetails?.ifscCode || '',
            });
        }
    }, [partnerData, form, isLoading, isEditing]);


    const onSubmit = (data: PayoutDetailsFormValues) => {
        if (!firestore || !partnerId) return;

        const updateData: Partial<DeliveryPartner> = {
            payoutMethod: data.payoutMethod,
            upiId: data.payoutMethod === 'upi' ? data.upiId : '',
            bankDetails: data.payoutMethod === 'bank' ? {
                accountHolderName: data.accountHolderName!,
                accountNumber: data.accountNumber!,
                ifscCode: data.ifscCode!,
            } : { accountHolderName: '', accountNumber: '', ifscCode: '' },
        };
        
        startSaveTransition(async () => {
            const partnerRef = doc(firestore, 'deliveryPartners', partnerId);
            try {
                await setDoc(partnerRef, updateData, { merge: true });
                toast({ title: "Payout details saved!", description: "Your payment information has been updated." });
                setIsEditing(false);
            } catch (error) {
                const permissionError = new FirestorePermissionError({
                    path: partnerRef.path,
                    operation: 'update',
                    requestResourceData: updateData,
                });
                errorEmitter.emit('permission-error', permissionError);
            }
        });
    };
    
    const hasDetails = partnerData?.payoutMethod && (partnerData.upiId || partnerData.bankDetails?.accountNumber);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Landmark className="h-6 w-6 text-primary" />
                    <span>Payout Settings</span>
                </CardTitle>
                <CardDescription>Manage your bank account or UPI details for receiving payments.</CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading ? <p>Loading settings...</p> : (
                    !isEditing && hasDetails ? (
                        <div className="space-y-4">
                            {partnerData.payoutMethod === 'upi' ? (
                                <div>
                                    <p className="text-sm font-medium">UPI ID</p>
                                    <p className="text-lg font-mono bg-muted/50 p-2 rounded-md">{partnerData.upiId}</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <p className="text-sm font-medium">Bank Account</p>
                                    <div className="text-lg bg-muted/50 p-3 rounded-md text-sm space-y-1 font-mono">
                                        <p><strong>Holder:</strong> {partnerData.bankDetails?.accountHolderName}</p>
                                        <p><strong>A/C No:</strong> {partnerData.bankDetails?.accountNumber}</p>
                                        <p><strong>IFSC:</strong> {partnerData.bankDetails?.ifscCode}</p>
                                    </div>
                                </div>
                            )}
                            <Button variant="outline" onClick={() => setIsEditing(true)}>Change Details</Button>
                        </div>
                    ) : (
                         <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                                <FormField
                                    control={form.control}
                                    name="payoutMethod"
                                    render={({ field }) => (
                                        <FormItem className="space-y-3">
                                            <FormLabel>Payout Method</FormLabel>
                                            <FormControl>
                                                <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex gap-4">
                                                    <FormItem className="flex items-center space-x-3 space-y-0">
                                                        <FormControl><RadioGroupItem value="bank" /></FormControl>
                                                        <FormLabel className="font-normal">Bank Account</FormLabel>
                                                    </FormItem>
                                                    <FormItem className="flex items-center space-x-3 space-y-0">
                                                        <FormControl><RadioGroupItem value="upi" /></FormControl>
                                                        <FormLabel className="font-normal">UPI</FormLabel>
                                                    </FormItem>
                                                </RadioGroup>
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                                
                                {watchPayoutMethod === 'upi' && (
                                    <FormField control={form.control} name="upiId" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>UPI ID</FormLabel>
                                            <FormControl><Input placeholder="yourname@bank" {...field} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                )}

                                {watchPayoutMethod === 'bank' && (
                                    <div className="space-y-4">
                                        <FormField control={form.control} name="accountHolderName" render={({ field }) => (
                                            <FormItem><FormLabel>Account Holder Name</FormLabel><FormControl><Input placeholder="John Doe" {...field} /></FormControl><FormMessage /></FormItem>
                                        )} />
                                        <FormField control={form.control} name="accountNumber" render={({ field }) => (
                                            <FormItem><FormLabel>Account Number</FormLabel><FormControl><Input placeholder="1234567890" {...field} /></FormControl><FormMessage /></FormItem>
                                        )} />
                                         <FormField control={form.control} name="ifscCode" render={({ field }) => (
                                            <FormItem><FormLabel>IFSC Code</FormLabel><FormControl><Input placeholder="SBIN0001234" {...field} /></FormControl><FormMessage /></FormItem>
                                        )} />
                                    </div>
                                )}
                                <div className="flex gap-2">
                                     <Button type="submit" disabled={isSaving}>{isSaving ? 'Saving...' : 'Save Details'}</Button>
                                     {hasDetails && <Button variant="ghost" onClick={() => setIsEditing(false)}>Cancel</Button>}
                                </div>
                            </form>
                         </Form>
                    )
                )}
            </CardContent>
        </Card>
    );
}

function PayoutCard({ partnerData, isLoading, onPayout }: { partnerData: DeliveryPartner | null, isLoading: boolean, onPayout: () => void }) {
    const [isCashingOut, startCashOutTransition] = useTransition();

    const handlePayout = () => {
        startCashOutTransition(() => {
            onPayout();
        });
    }

    const totalEarnings = partnerData?.totalEarnings || 0;
    const hasPayoutDetails = partnerData && (partnerData.bankDetails?.accountNumber || partnerData.upiId);

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
                    disabled={isCashingOut || isLoading || totalEarnings <= 0 || !hasPayoutDetails}
                    title={!hasPayoutDetails ? "Please set up your payout details first" : ""}
                >
                    {isCashingOut ? 'Processing...' : 'Request Payout'}
                </Button>
            </CardContent>
        </Card>
    )
}

function PayoutHistoryCard({ partnerId }: { partnerId: string }) {
    const { firestore } = useFirebase();

    const payoutsQuery = useMemoFirebase(() => {
        if (!firestore || !partnerId) return null;
        return query(
            collection(firestore, `deliveryPartners/${partnerId}/payouts`),
            orderBy('requestDate', 'desc')
        );
    }, [firestore, partnerId]);

    const { data: payouts, isLoading } = useCollection<Payout>(payoutsQuery);
    
    const getStatusVariant = (status: Payout['status']): "default" | "secondary" | "destructive" | "outline" => {
        switch (status) {
            case 'completed': return 'default';
            case 'pending': return 'secondary';
            case 'failed': return 'destructive';
            default: return 'outline';
        }
    }

    const formatDateSafe = (date: any) => {
        if (!date) return 'N/A';
        const jsDate = date.seconds ? new Date(date.seconds * 1000) : new Date(date);
        return `${format(jsDate, 'PPP')} (${formatDistanceToNow(jsDate, { addSuffix: true })})`
    }

    return (
         <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <History className="h-6 w-6 text-primary" />
                    <span>Payout History</span>
                </CardTitle>
                <CardDescription>A record of all your payout requests.</CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading ? <p>Loading payout history...</p> : 
                !payouts || payouts.length === 0 ? <p className="text-muted-foreground">You have not requested any payouts yet.</p> : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Amount</TableHead>
                                <TableHead className="text-right">Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {payouts.map((payout) => (
                                <TableRow key={payout.id}>
                                    <TableCell>{formatDateSafe(payout.requestDate)}</TableCell>
                                    <TableCell className="font-medium">₹{payout.amount.toFixed(2)}</TableCell>
                                    <TableCell className="text-right">
                                        <Badge variant={getStatusVariant(payout.status)}>{payout.status}</Badge>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    )
}


export default function DeliveriesPage() {
  const { firestore, user } = useFirebase();
  const [stores, setStores] = useState<Store[]>([]);
  const [isUpdating, startUpdateTransition] = useTransition();
  const { toast } = useToast();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Query 1: Get orders assigned to the current delivery partner.
  const myActiveDeliveriesQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
        collection(firestore, 'orders'),
        where('status', '==', 'Out for Delivery'),
        where('deliveryPartnerId', '==', user.uid)
    );
  }, [firestore, user?.uid]);

  // Query 2: Get orders that are ready for pickup and have no partner assigned.
  const availableDeliveriesQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
        collection(firestore, 'orders'),
        where('status', '==', 'Out for Delivery'),
        where('deliveryPartnerId', '==', null)
    );
  }, [firestore, user?.uid]);

  // Query 3: Get completed orders for the earnings history.
  const completedDeliveriesQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
      collection(firestore, 'orders'),
      where('status', '==', 'Delivered'),
      where('deliveryPartnerId', '==', user.uid)
    );
  }, [firestore, user?.uid]);

  // Hooks for each query
  const { data: myActiveDeliveries, isLoading: activeDeliveriesLoading } = useCollection<Order>(myActiveDeliveriesQuery);
  const { data: availableDeliveries, isLoading: availableDeliveriesLoading } = useCollection<Order>(availableDeliveriesQuery);
  const { data: completedDeliveries, isLoading: completedDeliveriesLoading } = useCollection<Order>(completedDeliveriesQuery);

  const partnerDocRef = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return doc(firestore, 'deliveryPartners', user.uid);
  }, [firestore, user?.uid]);
  const { data: partnerData, isLoading: partnerLoading } = useDoc<DeliveryPartner>(partnerDocRef);

  useEffect(() => {
    if (firestore) {
      getStores(firestore).then(setStores);
    }
  }, [firestore]);

  // Memoize to join store data with orders
  const joinStoresToOrders = (orders: Order[] | null) => {
    if (!orders || !stores.length) return [];
    return orders.map(order => {
      const store = stores.find(s => s.id === order.storeId);
      return { ...order, store };
    });
  };

  const myActiveDeliveriesWithStores = useMemo(() => joinStoresToOrders(myActiveDeliveries), [myActiveDeliveries, stores]);
  const availableDeliveriesWithStores = useMemo(() => joinStoresToOrders(availableDeliveries), [availableDeliveries, stores]);


  const handleConfirmPickup = (orderId: string) => {
    if (!firestore || !user?.uid) return;
     startUpdateTransition(async () => {
        const orderRef = doc(firestore, 'orders', orderId);
        try {
            await updateDoc(orderRef, {
                deliveryPartnerId: user.uid,
            });
             toast({
                title: "Pickup Confirmed!",
                description: `You are now assigned to deliver order #${orderId.substring(0, 7)}.`
            });
            setSelectedOrder(null);
        } catch (error) {
             console.error("Failed to confirm pickup:", error);
            const permissionError = new FirestorePermissionError({
                path: orderRef.path,
                operation: 'update',
                requestResourceData: { deliveryPartnerId: user.uid },
            });
            errorEmitter.emit('permission-error', permissionError);
        }
     });
  };

  const handleMarkAsDelivered = (order: Order) => {
    if (!navigator.geolocation) {
        toast({
            variant: 'destructive',
            title: 'Geolocation Not Supported',
            description: "Cannot verify your location.",
        });
        return;
    }

    startUpdateTransition(async () => {
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude: partnerLat, longitude: partnerLng } = position.coords;
                const distance = haversineDistance(partnerLat, partnerLng, order.deliveryLat, order.deliveryLng);

                if (distance > DELIVERY_PROXIMITY_THRESHOLD_KM) {
                    toast({
                        variant: 'destructive',
                        title: 'Too Far Away',
                        description: `You must be within ${DELIVERY_PROXIMITY_THRESHOLD_KM * 1000} meters of the delivery location. You are currently ${Math.round(distance * 1000)}m away.`,
                    });
                    return;
                }

                if (!firestore || !user?.uid) return;

                const orderRef = doc(firestore, 'orders', order.id);
                const partnerRef = doc(firestore, 'deliveryPartners', user.uid);

                try {
                    const batch = writeBatch(firestore);

                    batch.update(orderRef, { status: 'Delivered' });
                    batch.set(partnerRef, {
                        totalEarnings: increment(DELIVERY_FEE),
                        userId: user.uid,
                        payoutsEnabled: true,
                    }, { merge: true });

                    await batch.commit();

                    toast({
                        title: "Delivery Complete!",
                        description: `Order #${order.id.substring(0, 7)} marked as delivered. ₹${DELIVERY_FEE} added to your earnings.`
                    });
                } catch (error) {
                    console.error("Failed to mark as delivered:", error);
                    toast({
                        variant: 'destructive',
                        title: 'Update Failed',
                        description: 'Could not update the order status and your earnings. Please try again.'
                    });
                }
            },
            (error) => {
                console.error("Geolocation error:", error);
                toast({
                    variant: 'destructive',
                    title: 'Location Error',
                    description: 'Could not get your current location. Please enable location services and try again.',
                });
            }
        );
    });
  };

  const handlePayoutRequest = async () => {
      if (!firestore || !user || !partnerData || partnerData.totalEarnings <= 0) {
          toast({ variant: 'destructive', title: 'Payout Error', description: 'No balance available to cash out.' });
          return;
      }
       if (!partnerData.payoutMethod || (!partnerData.upiId && !partnerData.bankDetails?.accountNumber)) {
        toast({ variant: 'destructive', title: 'Payout Details Missing', description: 'Please set up your bank or UPI details in Payout Settings before requesting a payout.' });
        return;
      }

      const payoutAmount = partnerData.totalEarnings;
      const payoutDetails = partnerData.payoutMethod === 'upi' ? { upiId: partnerData.upiId } : { bankDetails: partnerData.bankDetails };

      try {
        const batch = writeBatch(firestore);

        // This creates a new document with a random ID in the subcollection.
        const newPayoutRef = doc(collection(firestore, `deliveryPartners/${user.uid}/payouts`));
        batch.set(newPayoutRef, {
            id: newPayoutRef.id, // Explicitly set the ID in the document data
            amount: payoutAmount,
            partnerId: user.uid,
            requestDate: Timestamp.now(),
            status: 'pending',
            payoutMethod: partnerData.payoutMethod,
            payoutDetails: payoutDetails,
        });

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

  const openInGoogleMaps = (destLat: number, destLng: number, originLat?: number, originLng?: number) => {
    let url = `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}`;
    if (originLat && originLng) {
        url += `&origin=${originLat},${originLng}`;
    }
    window.open(url, '_blank');
  };

  const isLoading = activeDeliveriesLoading || availableDeliveriesLoading || completedDeliveriesLoading || stores.length === 0;

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
        {selectedOrder && (
             <OrderDetailsDialog 
                order={selectedOrder} 
                isOpen={!!selectedOrder}
                onClose={() => setSelectedOrder(null)}
                onAccept={selectedOrder.status === 'Out for Delivery' && !selectedOrder.deliveryPartnerId ? () => handleConfirmPickup(selectedOrder.id) : undefined}
             />
        )}
      <div className="grid md:grid-cols-2 gap-8">
        <PayoutCard partnerData={partnerData} isLoading={partnerLoading} onPayout={handlePayoutRequest} />
        {user && <PayoutSettingsCard partnerData={partnerData} isLoading={partnerLoading} partnerId={user.uid} />}
      </div>
      
      {user && <PayoutHistoryCard partnerId={user.uid} />}

      <div>
        <h1 className="text-4xl font-bold mb-8 font-headline">My Active Deliveries</h1>
        <Card>
          <CardHeader>
            <CardTitle>Orders You Are Delivering</CardTitle>
          </CardHeader>
          <CardContent>
            {activeDeliveriesLoading ? (
              <p>Loading your active deliveries...</p>
            ) : myActiveDeliveriesWithStores.length === 0 ? (
              <p className="text-muted-foreground">You have no active deliveries. Pick one from the available list below.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pickup Location (Store)</TableHead>
                    <TableHead>Drop-off Location (Customer)</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {myActiveDeliveriesWithStores.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>
                        <div className="font-medium">{order.store?.name}</div>
                        <div className="text-sm text-muted-foreground">{order.store?.address}</div>
                        {order.store && (
                          <Button
                              variant="link"
                              size="sm"
                              className="px-0 h-auto"
                              onClick={() => openInGoogleMaps(order.store!.latitude, order.store!.longitude)}
                          >
                              <MapPin className="mr-2 h-4 w-4" />
                              Route to Store
                          </Button>
                        )}
                      </TableCell>
                      <TableCell>
                          <div className="font-medium">{order.customerName}</div>
                          <div className="text-sm text-muted-foreground">{order.deliveryAddress}</div>
                          <Button
                            variant="link"
                            size="sm"
                            className="px-0 h-auto"
                            onClick={() => openInGoogleMaps(order.deliveryLat, order.deliveryLng, order.store?.latitude, order.store?.longitude)}
                          >
                               <MapPin className="mr-2 h-4 w-4" />
                              Route to Customer
                          </Button>
                      </TableCell>
                      <TableCell className="text-right">
                           <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => handleMarkAsDelivered(order)}
                                  disabled={isUpdating}
                              >
                                  <Check className="mr-2 h-4 w-4" />
                                  {isUpdating ? 'Updating...' : 'Mark as Delivered'}
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


      <div>
        <h2 className="text-3xl font-bold mb-8 font-headline">Available Deliveries</h2>
        <Card>
          <CardHeader>
            <CardTitle>Orders Ready for Pickup</CardTitle>
             <CardDescription>Accept a job to see customer details and delivery route.</CardDescription>
          </CardHeader>
          <CardContent>
            {availableDeliveriesLoading ? (
              <p>Loading deliveries...</p>
            ) : availableDeliveriesWithStores.length === 0 ? (
              <p className="text-muted-foreground">No orders are currently ready for delivery.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Store Pickup</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Order Value</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {availableDeliveriesWithStores.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>
                        <div className="font-medium">{order.store?.name}</div>
                        <div className="text-sm text-muted-foreground">{order.store?.address}</div>
                      </TableCell>
                      <TableCell>
                          <div className="font-medium">{order.customerName}</div>
                      </TableCell>
                      <TableCell className="font-medium">
                        ₹{order.totalAmount.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedOrder(order)}
                              >
                                View Details
                              </Button>
                              <Button
                                  variant="default"
                                  size="sm"
                                  onClick={() => handleConfirmPickup(order.id)}
                                  disabled={isUpdating}
                              >
                                  Accept Job
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
