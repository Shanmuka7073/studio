'use client';

import { useState, useTransition, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import { revalidateStorePaths, revalidateProductPaths } from '@/app/actions';
import type { Store, Product } from '@/lib/types';
import { useFirebase, useCollection, useMemoFirebase, errorEmitter, FirestorePermissionError } from '@/firebase';
import { collection, query, where, addDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { MapPin } from 'lucide-react';

const storeSchema = z.object({
  name: z.string().min(3, 'Store name must be at least 3 characters'),
  description: z
    .string()
    .min(10, 'Description must be at least 10 characters'),
  address: z.string().min(10, 'Please enter a valid address'),
  latitude: z.number(),
  longitude: z.number(),
});

const productSchema = z.object({
  name: z.string().min(3, 'Product name is required'),
  price: z.coerce.number().positive('Price must be a positive number'),
  description: z.string().optional(),
});

type StoreFormValues = z.infer<typeof storeSchema>;
type ProductFormValues = z.infer<typeof productSchema>;

function AddProductForm({ storeId }: { storeId: string }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const { firestore } = useFirebase();

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: { name: '', price: 0, description: '' },
  });

  const onSubmit = (data: ProductFormValues) => {
    if (!firestore) return;

    startTransition(() => {
        const productData = {
            ...data,
            storeId,
            imageId: `prod-${Math.floor(Math.random() * 20)}`,
            quantity: 1, // Default quantity
            category: 'Uncategorized' // Default category
        };
        
        const productsCol = collection(firestore, 'stores', storeId, 'products');
        
        addDoc(productsCol, productData).then(() => {
            revalidateProductPaths(storeId);
            toast({
                title: 'Product Added!',
                description: `${data.name} has been added to your store.`,
            });
            form.reset();
        }).catch(async (serverError) => {
            const permissionError = new FirestorePermissionError({
              path: productsCol.path,
              operation: 'create',
              requestResourceData: productData,
            });
            errorEmitter.emit('permission-error', permissionError);
        });
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a New Product</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Product Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Organic Apples" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="price"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Price ($)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Product Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Describe the product" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={isPending} className="bg-accent hover:bg-accent/90 text-accent-foreground">
              {isPending ? 'Adding...' : 'Add Product'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function ManageStoreView({ store }: { store: Store }) {
    const { firestore } = useFirebase();

    const productsQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return collection(firestore, 'stores', store.id, 'products');
    }, [firestore, store.id]);

    const { data: products, isLoading } = useCollection<Product>(productsQuery);

    return (
        <div className="grid md:grid-cols-2 gap-8">
          <div>
            <Card>
                <CardHeader>
                    <CardTitle>Manage {store.name}</CardTitle>
                    <CardDescription>
                        Add new products and view your existing inventory.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                   <AddProductForm storeId={store.id} />
                </CardContent>
            </Card>
          </div>
          <div>
            <Card>
                <CardHeader>
                    <CardTitle>Your Products</CardTitle>
                </CardHeader>
                <CardContent>
                   {isLoading ? (
                     <p>Loading products...</p>
                   ) : products && products.length > 0 ? (
                     <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Price</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {products.map(product => (
                                <TableRow key={product.id}>
                                    <TableCell>{product.name}</TableCell>
                                    <TableCell>${product.price.toFixed(2)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                     </Table>
                   ) : (
                    <p className="text-muted-foreground">You haven't added any products yet.</p>
                   )}
                </CardContent>
            </Card>
          </div>
        </div>
    )
}

export default function MyStorePage() {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const { firestore, user, isUserLoading } = useFirebase();
  const router = useRouter();
  const [isLocating, setIsLocating] = useState(false);

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login?redirectTo=/dashboard/my-store');
    }
  }, [isUserLoading, user, router]);

  const storeQuery = useMemoFirebase(() => {
      if (!firestore || !user) return null;
      return query(collection(firestore, 'stores'), where('ownerId', '==', user.uid));
  }, [firestore, user]);

  const { data: stores, isLoading: isStoreLoading } = useCollection<Store>(storeQuery);

  const myStore = stores?.[0];

  const form = useForm<StoreFormValues>({
    resolver: zodResolver(storeSchema),
    defaultValues: {
      name: '',
      description: '',
      address: '',
      latitude: 0,
      longitude: 0,
    },
  });

  const handleGetCurrentLocation = () => {
    if (navigator.geolocation) {
      setIsLocating(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          form.setValue('latitude', position.coords.latitude);
          form.setValue('longitude', position.coords.longitude);
          setIsLocating(false);
          toast({
            title: 'Location Set!',
            description: 'Your store\'s location has been set to your current position.',
          });
        },
        (error) => {
          console.error("Geolocation error:", error);
          toast({
            variant: "destructive",
            title: 'Location Error',
            description: 'Could not get your location.',
          });
          setIsLocating(false);
        }
      );
    } else {
       toast({
        variant: "destructive",
        title: 'Unsupported',
        description: 'Geolocation is not supported by your browser.',
      });
    }
  };


  const onSubmit = (data: StoreFormValues) => {
    if (!user || !firestore) {
        toast({
            variant: 'destructive',
            title: 'Authentication Error',
            description: 'You must be logged in to create a store.',
        });
        return;
    }
    
    if (data.latitude === 0 && data.longitude === 0) {
      toast({
        variant: 'destructive',
        title: 'Location Required',
        description: 'Please set your store location before creating it.',
      });
      return;
    }

    startTransition(() => {
        const storeData = {
            ...data,
            ownerId: user.uid,
            imageId: `store-${Math.floor(Math.random() * 10)}`,
        };
        const storesCol = collection(firestore, 'stores');
        
        addDoc(storesCol, storeData).then(async () => {
            await revalidateStorePaths();
            toast({
              title: 'Store Created!',
              description: `Your store "${data.name}" has been successfully created.`,
            });
        }).catch(async (serverError) => {
            const permissionError = new FirestorePermissionError({
              path: storesCol.path,
              operation: 'create',
              requestResourceData: storeData,
            });
            errorEmitter.emit('permission-error', permissionError);
        });
    });
  };

  if (isUserLoading || isStoreLoading) {
    return <div className="container mx-auto py-12 px-4 md:px-6">Loading your store...</div>
  }

  return (
    <div className="container mx-auto py-12 px-4 md:px-6">
      <h1 className="text-4xl font-bold font-headline mb-8">
        {myStore ? `Dashboard: ${myStore.name}` : 'Create Your Store'}
      </h1>

      {myStore ? (
        <ManageStoreView store={myStore} />
      ) : (
        <Card className="max-w-3xl mx-auto">
          <CardHeader>
            <CardTitle className="text-3xl font-headline">
              Create Your Store
            </CardTitle>
            <CardDescription>
              Fill out the details below to get your shop listed on mkservices.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Store Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., Patel Kirana Store"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Store Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Describe what makes your store special."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Store Address</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="123 Market Street, Mumbai"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormItem>
                    <FormLabel>Store Location</FormLabel>
                    <div className="flex items-center gap-4">
                        <Button 
                        type="button" 
                        variant="outline" 
                        onClick={handleGetCurrentLocation}
                        disabled={isLocating}
                        >
                        <MapPin className="mr-2 h-4 w-4" />
                        {isLocating ? 'Locating...' : 'Set to My Current Location'}
                        </Button>
                        {(form.watch('latitude') !== 0 || form.watch('longitude') !== 0) && (
                            <span className="text-sm text-muted-foreground">Location set!</span>
                        )}
                    </div>
                     <FormMessage>{form.formState.errors.latitude?.message || form.formState.errors.longitude?.message}</FormMessage>
                </FormItem>

                <Button
                  type="submit"
                  className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
                  disabled={isPending || isUserLoading}
                >
                  {isPending ? 'Creating...' : 'Create Store'}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
