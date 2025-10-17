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
import { Upload } from 'lucide-react';
import { createStoreAction } from '@/app/actions';
import type { Store } from '@/lib/types';
import { getStore } from '@/lib/data';

const storeSchema = z.object({
  name: z.string().min(3, 'Store name must be at least 3 characters'),
  description: z
    .string()
    .min(10, 'Description must be at least 10 characters'),
  address: z.string().min(10, 'Please enter a valid address'),
  // We're not handling file uploads yet, so we can make this optional
  // logo: z.any().refine(files => files?.length === 1, 'Logo is required.'),
});

type StoreFormValues = z.infer<typeof storeSchema>;

// In a real app, this would be the logged-in user's store ID.
// We'll hardcode it for now to simulate a user owning store '4'.
const MY_STORE_ID = '4';

export default function MyStorePage() {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [myStore, setMyStore] = useState<Store | null>(null);

  useEffect(() => {
    // Check if the user's store already exists when the component loads.
    const existingStore = getStore(MY_STORE_ID);
    if (existingStore) {
      setMyStore(existingStore);
    }
  }, []);


  const form = useForm<StoreFormValues>({
    resolver: zodResolver(storeSchema),
    defaultValues: {
      name: '',
      description: '',
      address: '',
    },
  });

  const onSubmit = (data: StoreFormValues) => {
    startTransition(async () => {
      // We pass the hardcoded ID to the action
      const result = await createStoreAction({
        ...data,
        id: MY_STORE_ID,
      });
      if (result.success && result.store) {
        toast({
          title: 'Store Created!',
          description: `Your store "${result.store.name}" has been successfully created.`,
        });
        setMyStore(result.store);
      } else {
        toast({
          variant: 'destructive',
          title: 'Error creating store',
          description: result.error,
        });
      }
    });
  };

  if (myStore) {
    // Render the store management view if a store already exists.
    return (
      <div className="container mx-auto py-12 px-4 md:px-6">
        <h1 className="text-4xl font-bold font-headline mb-8">
          Manage {myStore.name}
        </h1>
        <Card>
          <CardHeader>
            <CardTitle>Welcome, Store Owner!</CardTitle>
            <CardDescription>
              This is your dashboard. You can add products, view orders, and
              edit your store details here.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>Coming soon:</p>
            <ul className="list-disc list-inside text-muted-foreground">
              <li>A form to add new products to your store.</li>
              <li>A table to view and manage your existing products.</li>
              <li>An overview of incoming orders.</li>
            </ul>
            <Button className="mt-4">Add a New Product</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Render the create store form if no store exists.
  return (
    <div className="container mx-auto py-12 px-4 md:px-6">
      <Card className="max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle className="text-3xl font-headline">
            Create Your Store
          </CardTitle>
          <CardDescription>
            Fill out the details below to get your shop listed on LocalBasket.
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
              <FormField
                control={form.control}
                name="logo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Store Logo (Optional)</FormLabel>
                    <FormControl>
                      <div className="flex items-center gap-4">
                        <div className="w-full">
                          <label
                            htmlFor="logo-upload"
                            className="flex items-center gap-2 cursor-pointer rounded-md border border-input p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                          >
                            <Upload className="h-4 w-4" />
                            <span>
                              {field.value?.[0]?.name ?? 'Upload a file'}
                            </span>
                          </label>
                          <Input
                            id="logo-upload"
                            type="file"
                            className="sr-only"
                            accept="image/*"
                            onBlur={field.onBlur}
                            name={field.name}
                            onChange={(e) => {
                              field.onChange(e.target.files);
                            }}
                            ref={field.ref}
                            disabled
                          />
                        </div>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
                disabled={isPending}
              >
                {isPending ? 'Creating...' : 'Create Store'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
