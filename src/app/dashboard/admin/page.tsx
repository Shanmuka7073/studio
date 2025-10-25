
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Settings, ArrowRight,Languages } from 'lucide-react';
import Link from 'next/link';
import { useFirebase } from '@/firebase';
import { useRouter } from 'next/navigation';
import placeholderImagesData from '@/lib/placeholder-images.json';
import groceryData from '@/lib/grocery-data.json';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { useTransition } from 'react';
import { useToast } from '@/hooks/use-toast';
import { translateAndSaveAllProductNames } from '@/app/actions';

const ADMIN_EMAIL = 'admin@gmail.com';

const adminCards = [
    {
        title: 'Site Configuration',
        description: 'Manage global settings, such as the placeholder image catalog.',
        href: '/dashboard/site-config',
        icon: Settings,
    },
];

const createSlug = (text: string) => {
  return text
    .toLowerCase()
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(/[^\w-]+/g, '') // Remove all non-word chars
    .replace(/--+/g, '-') // Replace multiple - with single -
    .replace(/^-+/, '') // Trim - from start of text
    .replace(/-+$/, ''); // Trim - from end of text
};

const allProductNames = groceryData.categories.flatMap(category => Array.isArray(category.items) ? category.items : []);
const uniqueProductNames = [...new Set(allProductNames)]; // Ensure uniqueness
const imageMap = new Map(placeholderImagesData.placeholderImages.map(img => [img.id, img]));

function TranslationCard() {
    const [isTranslating, startTranslation] = useTransition();
    const { toast } = useToast();

    const handleTranslate = () => {
        startTranslation(async () => {
            try {
                const result = await translateAndSaveAllProductNames();
                if (result.success) {
                    toast({
                        title: 'Translation Complete!',
                        description: `${result.count} product names were translated and saved.`,
                    });
                } else {
                    throw new Error(result.error || 'Unknown error');
                }
            } catch (error: any) {
                 toast({
                    variant: 'destructive',
                    title: 'Translation Failed',
                    description: error.message || 'An unexpected error occurred.',
                });
            }
        });
    }
    
    return (
        <Card className="h-full flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-2xl font-bold font-headline">Product Localization</CardTitle>
                <Languages className="h-8 w-8 text-primary" />
            </CardHeader>
            <CardContent className="flex-1 flex flex-col justify-between">
                <CardDescription>Use AI to translate all product names into Telugu and save them permanently to the database for all users.</CardDescription>
                <Button onClick={handleTranslate} disabled={isTranslating} className="mt-4">
                    {isTranslating ? 'Translating...' : 'Translate Product Names'}
                </Button>
            </CardContent>
        </Card>
    );
}


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
                <p className="text-lg text-muted-foreground mt-2">Manage your application's settings and view all products.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto mb-12">
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
                 <div className="md:col-span-1">
                    <TranslationCard />
                </div>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>All Available Products</CardTitle>
                    <CardDescription>A complete catalog of all products in the system and their current images.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-4">
                        {uniqueProductNames.map(productName => {
                            const imageId = `prod-${createSlug(productName)}`;
                            const image = imageMap.get(imageId) || { imageUrl: 'https://placehold.co/300x300/E2E8F0/64748B?text=No+Image', imageHint: 'none' };
                            return (
                                <Card key={productName} className="overflow-hidden">
                                    <Image
                                        src={image.imageUrl}
                                        alt={productName}
                                        width={200}
                                        height={200}
                                        className="w-full h-32 object-cover"
                                        data-ai-hint={image.imageHint}
                                    />
                                    <CardContent className="p-2">
                                        <p className="text-sm font-medium truncate">{productName}</p>
                                    </CardContent>
                                </Card>
                            )
                        })}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
