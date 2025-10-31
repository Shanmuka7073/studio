'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Users, Store, Truck, ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { collection, query, where } from 'firebase/firestore';
import type { Order } from '@/lib/types';

const ADMIN_EMAIL = 'admin@gmail.com';

function StatCard({ title, value, icon: Icon, loading }: { title: string, value: number, icon: React.ElementType, loading?: boolean }) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                {loading ? <Skeleton className="h-8 w-20" /> : <div className="text-2xl font-bold">{value}</div>}
            </CardContent>
        </Card>
    )
}

export default function AdminDashboardPage() {
    const { user, isUserLoading, firestore } = useFirebase();
    const router = useRouter();

    // Queries for stats
    const storesQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'stores'), where('isClosed', '!=', true)) : null, [firestore]);
    const partnersQuery = useMemoFirebase(() => firestore ? collection(firestore, 'deliveryPartners') : null, [firestore]);
    const deliveredOrdersQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'orders'), where('status', '==', 'Delivered')) : null, [firestore]);
    const deliveredVoiceOrdersQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'voice-orders'), where('status', '==', 'Delivered')) : null, [firestore]);

    const { data: stores, isLoading: storesLoading } = useCollection(storesQuery);
    const { data: partners, isLoading: partnersLoading } = useCollection(partnersQuery);
    const { data: deliveredOrders, isLoading: ordersLoading } = useCollection<Order>(deliveredOrdersQuery);
    const { data: deliveredVoiceOrders, isLoading: voiceOrdersLoading } = useCollection<Order>(deliveredVoiceOrdersQuery);

    const stats = useMemo(() => ({
        totalUsers: 0, // This is disabled
        totalStores: stores?.length ?? 0,
        totalDeliveryPartners: partners?.length ?? 0,
        totalOrdersDelivered: (deliveredOrders?.length ?? 0) + (deliveredVoiceOrders?.length ?? 0),
    }), [stores, partners, deliveredOrders, deliveredVoiceOrders]);

    const statsLoading = isUserLoading || storesLoading || partnersLoading || ordersLoading || voiceOrdersLoading;

    if (!isUserLoading && (!user || user.email !== ADMIN_EMAIL)) {
        router.replace('/dashboard');
        return <p>Loading admin dashboard...</p>
    }

    const statItems = [
        { title: 'Total Customers', value: stats.totalUsers, icon: Users },
        { title: 'Total Stores', value: stats.totalStores, icon: Store },
        { title: 'Delivery Partners', value: stats.totalDeliveryPartners, icon: Truck },
        { title: 'Orders Delivered', value: stats.totalOrdersDelivered, icon: ShoppingBag },
    ];

    return (
        <div className="container mx-auto py-12 px-4 md:px-6">
            <div className="text-center mb-12">
                <h1 className="text-4xl font-bold font-headline">Admin Dashboard</h1>
                <p className="text-lg text-muted-foreground mt-2">A high-level overview of your application's activity.</p>
            </div>
            
            <Alert className="mb-8">
                <Users className="h-4 w-4" />
                <AlertTitle>User Count Disabled</AlertTitle>
                <AlertDescription>
                    The "Total Customers" count has been temporarily disabled to resolve a server authentication issue. All other stats are live.
                </AlertDescription>
            </Alert>
            
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
                {statItems.map(item => (
                    <StatCard 
                        key={item.title} 
                        title={item.title}
                        value={item.value}
                        icon={item.icon}
                        loading={statsLoading}
                    />
                ))}
            </div>
        </div>
    );
}
