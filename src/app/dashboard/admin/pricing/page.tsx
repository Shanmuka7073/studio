'use client';

import { useState, useEffect, useTransition, useMemo } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useFirebase, errorEmitter, FirestorePermissionError } from '@/firebase';
import { useRouter } from 'next/navigation';
import { Trash2, PlusCircle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import type { ProductVariant } from '@/lib/types';
import groceryData from '@/lib/grocery-data.json';
import { collection, doc, getDocs, writeBatch, query, where, collectionGroup } from 'firebase/firestore';

const ADMIN_EMAIL = 'admin@gmail.com';

const variantSchema = z.object({
  sku: z.string(),
  weight: z.string().min(1, 'Weight is required'),
  price: z.coerce.number().positive('Price must be a positive number'),
});

const formSchema = z.object({
  productName: z.string().min(1, 'Product selection is required'),
  variants: z.array(variantSchema).min(1, 'At least one price variant is required'),
});

type FormValues = z.infer<typeof formSchema>;

export default function PricingPage() {
  const { user, isUserLoading, firestore } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();
  const [isSaving, startSaveTransition] = useTransition();

  const [allPrices, setAllPrices] = useState<Record<string, ProductVariant[]>>({});
  const [isLoading, setIsLoading] = useState(true);

  const uniqueProducts = useMemo(() => {
    const nameSet = new Set<string>();
    groceryData.categories.forEach(category => {
        if (Array.isArray(category.items)) {
            category.items.forEach(item => {
                nameSet.add(item);
            });
        }
    });
    return Array.from(nameSet).sort();
  }, []);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      productName: '',
      variants: [],
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: 'variants',
  });

  const selectedProductName = form.watch('productName');

  useEffect(() => {
    async function fetchProductPrices() {
        if (!firestore) return;
        setIsLoading(true);
        try {
            const pricesSnapshot = await getDocs(collection(firestore, 'productPrices'));
            const priceMap: Record<string, ProductVariant[]> = {};
            if (!pricesSnapshot.empty) {
                pricesSnapshot.docs.forEach(doc => {
                    const data = doc.data();
                    priceMap[doc.id] = data.variants as ProductVariant[];
                });
            }
            setAllPrices(priceMap);
        } catch (error) {
            console.error('Failed to fetch product prices:', error);
        }
        setIsLoading(false);
    }
    fetchProductPrices();
  }, [firestore]);
  
  useEffect(() => {
    if (selectedProductName) {
      const variants = allPrices[selectedProductName.toLowerCase()] || [];
      replace(variants);
    } else {
      replace([]);
    }
  }, [selectedProductName, allPrices, replace]);

  if (!isUserLoading && (!user || user.email !== ADMIN_EMAIL)) {
    router.replace('/dashboard');
    return <p>Access Denied. Redirecting...</p>;
  }

  const onSubmit = (data: FormValues) => {
    if (!firestore) {
        toast({ variant: 'destructive', title: 'Firestore not available' });
        return;
    }
    startSaveTransition(async () => {
      try {
        const batch = writeBatch(firestore);
        const productName = data.productName.toLowerCase();

        // 1. Set the canonical price in /productPrices/{productName}
        const productPriceRef = doc(firestore, 'productPrices', productName);
        batch.set(productPriceRef, {
            productName: productName,
            variants: data.variants,
        });

        // 2. Find all existing products with this name and update their variants
        const productsQuery = query(collectionGroup(firestore, 'products'), where('name', '==', data.productName));
        const productsSnapshot = await getDocs(productsQuery);
        if (!productsSnapshot.empty) {
            productsSnapshot.docs.forEach(doc => {
                batch.update(doc.ref, { variants: data.variants });
            });
        }

        await batch.commit();

        toast({
          title: 'Prices Updated!',
          description: `Pricing for ${data.productName} has been saved and applied to all stores.`,
        });

        // Refetch prices to update the local state
        const updatedPricesSnapshot = await getDocs(collection(firestore, 'productPrices'));
        const priceMap: Record<string, ProductVariant[]> = {};
        updatedPricesSnapshot.forEach(doc => {
            priceMap[doc.id] = doc.data().variants as ProductVariant[];
        });
        setAllPrices(priceMap);

      } catch (error) {
        toast({
          variant: 'destructive',
          title: 'Update Failed',
          description: error instanceof Error ? error.message : 'Could not save prices.',
        });
        const permissionError = new FirestorePermissionError({
            path: `productPrices/${data.productName.toLowerCase()}`,
            operation: 'write',
            requestResourceData: data,
        });
        errorEmitter.emit('permission-error', permissionError);
      }
    });
  };
  
  const handleAddNewVariant = () => {
     if (!selectedProductName) {
        toast({
            variant: 'destructive',
            title: 'No Product Selected',
            description: 'Please select a product before adding a variant.',
        });
        return;
    }
    append({ 
        weight: '', 
        price: 0,
        sku: `${createSlug(selectedProductName)}-new-${fields.length}`
    });
  };
  
  const createSlug = (text: string) => text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '');


  return (
    <div className="container mx-auto py-12 px-4 md:px-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold font-headline mb-2">
          Product Price Management
        </h1>
        <p className="text-lg text-muted-foreground mb-8">
            Set the canonical prices for different weights/variants of products. These prices will be used across all stores.
        </p>

        <Card>
          <CardHeader>
            <CardTitle>Select a Product to Edit</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
                <Skeleton className="h-10 w-full" />
            ) : (
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                        <FormField
                            control={form.control}
                            name="productName"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Product</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select a product to set its price variants" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {uniqueProducts.map(productName => (
                                                <SelectItem key={productName} value={productName}>{productName}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        
                        {selectedProductName && (
                           <Card className="bg-muted/50 p-4">
                                <CardHeader className="p-2">
                                    <CardTitle className="text-lg">Price Variants for {selectedProductName}</CardTitle>
                                </CardHeader>
                                <CardContent className="p-2 space-y-4">
                                    {fields.map((field, index) => (
                                        <div key={field.id} className="flex items-end gap-4 p-4 border rounded-md bg-background">
                                            <FormField
                                                control={form.control}
                                                name={`variants.${index}.weight`}
                                                render={({ field }) => (
                                                    <FormItem className="flex-1">
                                                        <FormLabel>Weight (e.g., 500gm, 1kg)</FormLabel>
                                                        <FormControl><Input {...field} /></FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={form.control}
                                                name={`variants.${index}.price`}
                                                render={({ field }) => (
                                                    <FormItem className="flex-1">
                                                        <FormLabel>Price (₹)</FormLabel>
                                                        <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                             <FormField
                                                control={form.control}
                                                name={`variants.${index}.sku`}
                                                render={({ field }) => (
                                                    <FormItem className="flex-1">
                                                        <FormLabel>SKU</FormLabel>
                                                        <FormControl><Input {...field} placeholder="auto-generated on save" /></FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                            <Button type="button" variant="destructive" size="icon" onClick={() => remove(index)}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                    <Button type="button" variant="outline" onClick={handleAddNewVariant}>
                                        <PlusCircle className="mr-2 h-4 w-4" />
                                        Add Variant
                                    </Button>
                                </CardContent>
                           </Card>
                        )}
                        
                        <Button type="submit" disabled={isSaving || !selectedProductName}>
                            {isSaving ? 'Saving...' : 'Save Prices'}
                        </Button>
                    </form>
                </Form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
