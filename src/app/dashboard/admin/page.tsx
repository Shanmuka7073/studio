'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Users, Store, Truck, ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { useFirebase } from '@/firebase';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { getAdminStats } from './actions';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

const ADMIN_EMAIL = 'admin@gmail.com';

type AdminStats = {
    totalUsers: number;
    totalStores: number;
    totalDeliveryPartners: number;
    totalOrdersDelivered: number;
};

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
    const { user, isUserLoading } = useFirebase();
    const router = useRouter();
    const [stats, setStats] = useState<AdminStats | null>(null);
    const [statsLoading, setStatsLoading] = useState(true);

    useEffect(() => {
        if (!isUserLoading && (!user || user.email !== ADMIN_EMAIL)) {
            router.replace('/dashboard');
        }
    }, [isUserLoading, user, router]);

    useEffect(() => {
        async function fetchStats() {
            setStatsLoading(true);
            const fetchedStats = await getAdminStats();
            setStats(fetchedStats);
            setStatsLoading(false);
        }

        if (user && user.email === ADMIN_EMAIL) {
            fetchStats();
        }
    }, [user]);

    if (isUserLoading || !user || user.email !== ADMIN_EMAIL) {
        return <p>Loading admin dashboard...</p>
    }

    const statItems = [
        { title: 'Total Customers', value: stats?.totalUsers ?? 0, icon: Users },
        { title: 'Total Stores', value: stats?.totalStores ?? 0, icon: Store },
        { title: 'Delivery Partners', value: stats?.totalDeliveryPartners ?? 0, icon: Truck },
        { title: 'Orders Delivered', value: stats?.totalOrdersDelivered ?? 0, icon: ShoppingBag },
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
