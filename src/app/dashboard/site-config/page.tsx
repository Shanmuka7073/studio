'use client';

import { useState, useTransition } from 'react';
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
import placeholderImagesData from '@/lib/placeholder-images.json';
import { updateImages } from '@/ai/flows/update-images-flow';
import { Trash2 } from 'lucide-react';
import { ADMIN_USER_ID } from '@/lib/config';

const imageSchema = z.object({
  id: z.string().min(1, 'ID is required'),
  imageUrl: z.string().url('Must be a valid URL'),
  imageHint: z.string().min(1, 'Hint is required'),
});

const formSchema = z.object({
  images: z.array(imageSchema),
});

type FormValues = z.infer<typeof formSchema>;

export default function SiteConfigPage() {
  const { user, isUserLoading } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      images: placeholderImagesData.placeholderImages,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'images',
  });

  if (!isUserLoading && (!user || user.uid !== ADMIN_USER_ID)) {
    router.replace('/');
    return (
        <div className="container mx-auto py-12">
            <p>Access Denied. Redirecting...</p>
        </div>
    );
  }

  const onSubmit = (data: FormValues) => {
    startTransition(async () => {
      try {
        await updateImages(data.images);
        toast({
          title: 'Images Updated!',
          description: 'The placeholder image catalog has been saved successfully.',
        });
      } catch (error) {
        console.error('Failed to update images:', error);
        toast({
          variant: 'destructive',
          title: 'Update Failed',
          description: 'Could not save the image catalog. Please try again.',
        });
      }
    });
  };
  
  if (isUserLoading || !user) {
    return <div className="container mx-auto py-12">Loading admin dashboard...</div>
  }

  return (
    <div className="container mx-auto py-12 px-4 md:px-6">
      <h1 className="text-4xl font-bold font-headline mb-8">
        Site Configuration
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>Image Catalog Management</CardTitle>
          <CardDescription>
            Update the URLs and hints for all placeholder images used across the site.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-4">
                {fields.map((field, index) => (
                  <Card key={field.id} className="p-4">
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                       <FormField
                          control={form.control}
                          name={`images.${index}.id`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Image ID</FormLabel>
                              <FormControl>
                                <Input {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                         <FormField
                          control={form.control}
                          name={`images.${index}.imageUrl`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Image URL</FormLabel>
                              <FormControl>
                                <Input {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                         <FormField
                          control={form.control}
                          name={`images.${index}.imageHint`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Image Hint</FormLabel>
                              <div className="flex gap-2">
                                <FormControl>
                                    <Input {...field} />
                                </FormControl>
                                <Button
                                    type="button"
                                    variant="destructive"
                                    size="icon"
                                    onClick={() => remove(index)}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                     </div>
                  </Card>
                ))}
              </div>

               <div className="flex justify-between items-center pt-4 border-t">
                 <Button
                    type="button"
                    variant="outline"
                    onClick={() => append({ id: `new-image-${fields.length}`, imageUrl: '', imageHint: '' })}
                 >
                    Add New Image
                </Button>
                <Button type="submit" disabled={isPending}>
                    {isPending ? 'Saving...' : 'Save All Changes'}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
