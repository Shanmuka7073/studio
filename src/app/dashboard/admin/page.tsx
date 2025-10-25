
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Settings, ArrowRight, Tag } from 'lucide-react';
import Link from 'next/link';
import { useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { useRouter } from 'next/navigation';
import placeholderImagesData from '@/lib/placeholder-images.json';
import groceryData from '@/lib/grocery-data.json';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { useTransition, useState, useEffect, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { updatePriceForProductByName } from '@/app/actions';
import { collectionGroup, query } from 'firebase/firestore';
import type { Product } from '@/lib/types';


const ADMIN_EMAIL = 'admin@gmail.com';

const adminCards = [
    {
        title: 'Site Configuration',
        description: 'Manage global settings, such as the placeholder image catalog.',
        href: '/dashboard/site-config',
        icon: Settings,
    },
];

function AdminProductCard({ productName, initialPrice, onUpdatePrice }: { productName: string, initialPrice: number, onUpdatePrice: (name: string, price: number) => void }) {
    const [isUpdating, startUpdateTransition] = useTransition();
    const [price, setPrice] = useState(initialPrice.toString());
    const { toast } = useToast();

    const imageId = `prod-${createSlug(productName)}`;
    const image = imageMap.get(imageId) || { imageUrl: 'https://placehold.co/300x300/E2E8F0/64748B?text=No+Image', imageHint: 'none' };
    
    const handleUpdatePrice = () => {
        const newPrice = parseFloat(price);
        if (isNaN(newPrice) || newPrice < 0) {
            toast({
                variant: 'destructive',
                title: 'Invalid Price',
                description: 'Please enter a valid, non-negative number.',
            });
            return;
        }

        startUpdateTransition(async () => {
            const result = await updatePriceForProductByName(productName, newPrice);
            if (result.success) {
                toast({
                    title: 'Price Updated!',
                    description: `Price for ${productName} set to ₹${newPrice.toFixed(2)} across ${result.updatedCount} store(s).`,
                });
                onUpdatePrice(productName, newPrice);
            } else {
                 toast({
                    variant: 'destructive',
                    title: 'Update Failed',
                    description: result.error || 'An unexpected error occurred.',
                });
            }
        });
    }

    return (
        <Card className="overflow-hidden">
            <Image
                src={image.imageUrl}
                alt={productName}
                width={200}
                height={200}
                className="w-full h-32 object-cover"
                data-ai-hint={image.imageHint}
            />
            <CardContent className="p-2 space-y-2">
                <p className="text-sm font-medium truncate text-center">{productName}</p>
                <div className="flex gap-2 items-center">
                     <span className="font-bold">₹</span>
                    <Input
                        type="number"
                        placeholder="Price"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        disabled={isUpdating}
                        className="h-8"
                    />
                </div>
                 <Button onClick={handleUpdatePrice} disabled={isUpdating} size="sm" className="w-full">
                    {isUpdating ? 'Updating...' : 'Update Price'}
                </Button>
            </CardContent>
        </Card>
    );
}


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
const uniqueProductNames = [...new Set(allProductNames)];
const imageMap = new Map(placeholderImagesData.placeholderImages.map(img => [img.id, img]));


export default function AdminDashboardPage() {
    const { user, isUserLoading, firestore } = useFirebase();
    const router = useRouter();

    const allProductsQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(collectionGroup(firestore, 'products'));
    }, [firestore]);

    const { data: allProducts, isLoading: productsLoading } = useCollection<Product>(allProductsQuery);

    const [productPrices, setProductPrices] = useState<Record<string, number>>({});

    useEffect(() => {
        if (allProducts) {
            const priceMap = allProducts.reduce((acc, product) => {
                if (!acc[product.name]) {
                    acc[product.name] = product.price;
                }
                return acc;
            }, {});
            setProductPrices(priceMap);
        }
    }, [allProducts]);

    const handlePriceUpdate = (productName: string, newPrice: number) => {
        setProductPrices(prev => ({ ...prev, [productName]: newPrice }));
    };

    if (!isUserLoading && (!user || user.email !== ADMIN_EMAIL)) {
        router.replace('/dashboard');
        return <p>Access Denied. Redirecting...</p>;
    }
    
    const isLoading = isUserLoading || productsLoading;

    if (isLoading || !user) {
        return <p>Loading admin dashboard...</p>
    }

    return (
        <div className="container mx-auto py-12 px-4 md:px-6">
            <div className="text-center mb-12">
                <h1 className="text-4xl font-bold font-headline">Admin Dashboard</h1>
                <p className="text-lg text-muted-foreground mt-2">Manage your application's settings and products.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto mb-12">
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
            <Card>
                <CardHeader>
                    <CardTitle>All Available Products</CardTitle>
                    <CardDescription>A complete catalog of all products in the system. Updating a price here will change it across all stores.</CardDescription>
                </CardHeader>
                <CardContent>
                     {isLoading ? <p>Loading products...</p> : (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {uniqueProductNames.map(productName => {
                                const initialPrice = productPrices[productName] || 0;
                                return (
                                    <AdminProductCard 
                                        key={productName}
                                        productName={productName}
                                        initialPrice={initialPrice}
                                        onUpdatePrice={handlePriceUpdate}
                                    />
                                )
                            })}
                        </div>
                     )}
                </CardContent>
            </Card>
        </div>
    );
}
