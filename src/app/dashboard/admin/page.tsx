
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Settings, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useFirebase } from '@/firebase';
import { useRouter } from 'next/navigation';

const ADMIN_EMAIL = 'admin@gmail.com';

const adminCards = [
    {
        title: 'Site Configuration',
        description: 'Manage global settings, such as the placeholder image catalog.',
        href: '/dashboard/site-config',
        icon: Settings,
    },
];

export default function AdminDashboardPage() {
    const { user, isUserLoading } = useFirebase();
    const router = useRouter();

    if (!isUserLoading && (!user || user.email !== ADMIN_EMAIL)) {
        router.replace('/dashboard');
        return <p>Access Denied. Redirecting...</p>;
    }
    
    if (isUserLoading || !user) {
        return <p>Loading admin dashboard...</p>
    }

    return (
        <div className="container mx-auto py-12 px-4 md:px-6">
            <div className="text-center mb-12">
                <h1 className="text-4xl font-bold font-headline">Admin Dashboard</h1>
                <p className="text-lg text-muted-foreground mt-2">Manage your application's settings and content.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
                {adminCards.map((card) => (
                     <Link href={card.href} key={card.title} className="block hover:shadow-xl transition-shadow rounded-lg">
                        <Card className="h-full flex flex-col">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-2xl font-bold font-headline">{card.title}</CardTitle>
                                <card.icon className="h-8 w-8 text-primary" />
                            </CardHeader>
                            <CardContent className="flex-1 flex flex-col justify-between">
                                <CardDescription>{card.description}</CardDescription>
                                <div className="flex items-center text-primary font-semibold mt-4">
                                    <span>Go to {card.title}</span>
                                    <ArrowRight className="ml-2 h-4 w-4" />
                                </div>
                            </CardContent>
                        </Card>
                    </Link>
                ))}
            </div>
        </div>
    );
}
