'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Users, Store, Truck, ShoppingBag, AlertCircle, ArrowRight, Settings, Mic } from 'lucide-react';
import Link from 'next/link';
import { useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { collection, query, where } from 'firebase/firestore';
import type { Order, Store as StoreType } from '@/lib/types';
import { Button } from '@/components/ui/button';

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

function CreateMasterStoreCard() {
    return (
        <Alert variant="destructive" className="mb-8">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Action Required: Create Master Store</AlertTitle>
            <AlertDescription>
                The master store for setting platform-wide product prices has not been created yet. This is required for the application to function correctly.
                <Button asChild className="mt-4">
                    <Link href="/dashboard/owner/my-store">
                        Create Master Store <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                </Button>
            </AlertDescription>
        </Alert>
    )
}

function AdminActionCard({ title, description, href, icon: Icon }: { title: string, description: string, href: string, icon: React.ElementType }) {
    return (
        <Link href={href} className="block hover:shadow-lg transition-shadow rounded-lg">
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-4">
                        <Icon className="h-8 w-8 text-primary" />
                        <CardTitle>{title}</CardTitle>
                    </div>
                </CardHeader>
                <CardContent>
                    <CardDescription>{description}</CardDescription>
                </CardContent>
            </Card>
        </Link>
    );
}

export default function AdminDashboardPage() {
    const { user, isUserLoading, firestore } = useFirebase();
    const router = useRouter();

    // Queries for stats
    const usersQuery = useMemoFirebase(() => firestore ? collection(firestore, 'users') : null, [firestore]);
    const storesQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'stores'), where('isClosed', '!=', true)) : null, [firestore]);
    const partnersQuery = useMemoFirebase(() => firestore ? collection(firestore, 'deliveryPartners') : null, [firestore]);
    const deliveredOrdersQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'orders'), where('status', '==', 'Delivered')) : null, [firestore]);
    
    // Query to check for the master store
    const adminStoreQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'stores'), where('name', '==', 'LocalBasket'));
    }, [firestore]);


    const { data: users, isLoading: usersLoading } = useCollection(usersQuery);
    const { data: stores, isLoading: storesLoading } = useCollection(storesQuery);
    const { data: partners, isLoading: partnersLoading } = useCollection(partnersQuery);
    const { data: deliveredOrders, isLoading: ordersLoading } = useCollection<Order>(deliveredOrdersQuery);
    const { data: adminStores, isLoading: adminStoreLoading } = useCollection<StoreType>(adminStoreQuery);

    const masterStoreExists = useMemo(() => adminStores && adminStores.length > 0, [adminStores]);

    const stats = useMemo(() => ({
        totalUsers: users?.length ?? 0,
        totalStores: stores?.length ?? 0,
        totalDeliveryPartners: partners?.length ?? 0,
        totalOrdersDelivered: deliveredOrders?.length ?? 0,
    }), [users, stores, partners, deliveredOrders]);

    const statsLoading = isUserLoading || usersLoading || storesLoading || partnersLoading || ordersLoading;

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

    if (isUserLoading || adminStoreLoading) {
        return <p>Loading admin dashboard...</p>
    }

    return (
        <div className="container mx-auto py-12 px-4 md:px-6">
            <div className="text-center mb-12">
                <h1 className="text-4xl font-bold font-headline">Admin Dashboard</h1>
                <p className="text-lg text-muted-foreground mt-2">A high-level overview of your application's activity.</p>
            </div>
            
            {!masterStoreExists && <CreateMasterStoreCard />}

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

            <div className="mt-16">
                 <h2 className="text-2xl font-bold text-center mb-8 font-headline">Admin Tools</h2>
                <div className="grid gap-8 md:grid-cols-2 max-w-4xl mx-auto">
                    <AdminActionCard 
                        title="Manage Master Store & Products"
                        description="Add or edit products in the master catalog and set canonical prices."
                        href="/dashboard/owner/my-store"
                        icon={Store}
                    />
                    <AdminActionCard 
                        title="Voice Commands Control"
                        description="View and manage the voice commands users can say to navigate the app."
                        href="/dashboard/voice-commands"
                        icon={Mic}
                    />
                </div>
            </div>
        </div>
    );
}
