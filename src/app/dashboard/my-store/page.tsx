'use client';

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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Upload } from 'lucide-react';

const storeSchema = z.object({
  name: z.string().min(3, 'Store name must be at least 3 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  address: z.string().min(10, 'Please enter a valid address'),
  logo: z.any().refine(files => files?.length === 1, 'Logo is required.'),
});

type StoreFormValues = z.infer<typeof storeSchema>;

export default function MyStorePage() {
  const { toast } = useToast();
  // In a real app, you would check if the user already has a store.
  const hasStore = false;

  const form = useForm<StoreFormValues>({
    resolver: zodResolver(storeSchema),
    defaultValues: {
      name: '',
      description: '',
      address: '',
    },
  });

  const onSubmit = (data: StoreFormValues) => {
    console.log('Store data submitted:', data);
    // Here you would typically call a server action to create/update the store.
    toast({
      title: 'Store Created!',
      description: `Your store "${data.name}" has been successfully created.`,
    });
    // You might want to redirect or update the UI state after submission.
  };
  
  if (hasStore) {
    // Render the store management view if a store already exists.
    // We can build this out next.
    return (
        <div className="container mx-auto py-12">
            <h1 className="text-4xl font-bold font-headline mb-8">Manage Your Store</h1>
            <p>Here you will be able to edit your store details, add products, and view your orders.</p>
        </div>
    )
  }

  // Render the create store form if no store exists.
  return (
    <div className="container mx-auto py-12 px-4 md:px-6">
        <Card className="max-w-3xl mx-auto">
            <CardHeader>
                <CardTitle className="text-3xl font-headline">Create Your Store</CardTitle>
                <CardDescription>Fill out the details below to get your shop listed on LocalBasket.</CardDescription>
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
                                <Input placeholder="e.g., Patel Kirana Store" {...field} />
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
                                <Textarea placeholder="Describe what makes your store special." {...field} />
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
                                <Input placeholder="123 Market Street, Mumbai" {...field} />
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
                                    <FormLabel>Store Logo</FormLabel>
                                    <FormControl>
                                        <div className="flex items-center gap-4">
                                            <div className="w-full">
                                                <label htmlFor="logo-upload" className="flex items-center gap-2 cursor-pointer rounded-md border border-input p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground">
                                                    <Upload className="h-4 w-4" />
                                                    <span>{field.value?.[0]?.name ?? 'Upload a file'}</span>
                                                </label>
                                                <Input
                                                    id="logo-upload"
                                                    type="file"
                                                    className="sr-only"
                                                    accept="image/*"
                                                    onBlur={field.onBlur}
                                                    name={field.name}
                                                    onChange={(e) => {
                                                        field.onChange(e.target.files)
                                                    }}
                                                    ref={field.ref}
                                                />
                                            </div>
                                        </div>
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <Button type="submit" className="w-full bg-accent hover:bg-accent/90 text-accent-foreground">
                            Create Store
                        </Button>
                    </form>
                </Form>
            </CardContent>
        </Card>
    </div>
  );
}
