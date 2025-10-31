
'use client';

import { useState, useEffect, useTransition } from 'react';
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
import { useFirebase } from '@/firebase';
import { useRouter } from 'next/navigation';
import { getUniqueProductNames, getProductPrices } from '../actions';
import { saveProductPrices } from '../server-actions';
import { Trash2, PlusCircle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ProductVariant } from '@/lib/types';

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
  const { user, isUserLoading } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();
  const [isSaving, startSaveTransition] = useTransition();

  const [uniqueProducts, setUniqueProducts] = useState<string[]>([]);
  const [allPrices, setAllPrices] = useState<Record<string, ProductVariant[]>>({});
  const [isLoading, setIsLoading] = useState(true);

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
    async function fetchData() {
        setIsLoading(true);
        const [names, prices] = await Promise.all([
            getUniqueProductNames(),
            getProductPrices()
        ]);
        setUniqueProducts(names);
        setAllPrices(prices);
        setIsLoading(false);
    }
    fetchData();
  }, []);
  
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
    startSaveTransition(async () => {
      const result = await saveProductPrices(data.productName, data.variants);
      if (result.success) {
        toast({
          title: 'Prices Updated!',
          description: `Pricing for ${data.productName} has been saved.`,
        });
        // Refetch prices to update the local state
        const updatedPrices = await getProductPrices();
        setAllPrices(updatedPrices);
      } else {
        toast({
          variant: 'destructive',
          title: 'Update Failed',
          description: result.error || 'Could not save prices.',
        });
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
