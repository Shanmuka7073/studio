
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ArrowRight, ShoppingCart, Store, Truck, Mic } from 'lucide-react';
import Link from 'next/link';
import { t } from '@/lib/locales';

const roleCards = [
    {
        title: 'start-shopping',
        description: 'browse-local-stores-and-find-fresh-groceries',
        href: '/stores',
        icon: ShoppingCart,
    },
    {
        title: 'voice-order',
        description: 'record-your-shopping-list-and-have-a-local-shopkeeper-fulfill-it',
        href: '/checkout',
        icon: Mic,
    },
    {
        title: 'store-owner',
        description: 'manage-your-store-products-and-incoming-orders',
        href: '/dashboard/owner/my-store',
        icon: Store,
    },
    {
        title: 'delivery-partner',
        description: 'view-and-accept-available-delivery-jobs',
        href: '/dashboard/delivery/deliveries',
        icon: Truck,
    }
];

export default function DashboardPage() {
    return (
        <div className="container mx-auto py-12 px-4 md:px-6">
            <div className="text-center mb-12">
                <h1 className="text-4xl font-bold font-headline">{t('your-dashboard')}</h1>
                <p className="text-lg text-muted-foreground mt-2">{t('select-your-role-to-access-your-tools')}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-6xl mx-auto">
                {roleCards.map((card) => (
                     <Link href={card.href} key={card.title} className="block hover:shadow-xl transition-shadow rounded-lg">
                        <Card className="h-full flex flex-col">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-2xl font-bold font-headline">{t(card.title)}</CardTitle>
                                <card.icon className="h-8 w-8 text-primary" />
                            </CardHeader>
                            <CardContent className="flex-1 flex flex-col justify-between">
                                <CardDescription>{t(card.description)}</CardDescription>
                                <div className="flex items-center text-primary font-semibold mt-4">
                                    <span>{t('go-to')} {t(card.title)}</span>
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
