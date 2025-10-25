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
import { updateImages } from '@/app/actions';
import { Trash2, Sparkles, Loader2 } from 'lucide-react';
import { generateAllImages } from '@/ai/flows/image-generator-flow';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';


const ADMIN_EMAIL = 'admin@gmail.com';

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
  const [isGenerating, startGenerationTransition] = useTransition();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      images: placeholderImagesData.placeholderImages,
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: 'images',
  });

  if (!isUserLoading && (!user || user.email !== ADMIN_EMAIL)) {
    router.replace('/');
    return (
        <div className="container mx-auto py-12">
            <p>Access Denied. Redirecting...</p>
        </div>
    );
  }

  const onSubmit = (data: FormValues) => {
    startTransition(async () => {
      const result = await updateImages(data.images);
      if (result.success) {
        toast({
          title: 'Images Updated!',
          description: 'The placeholder image catalog has been saved successfully.',
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Update Failed',
          description: result.error || 'Could not save the image catalog. Please try again.',
        });
      }
    });
  };

  const handleAiGenerate = () => {
    startGenerationTransition(async () => {
        try {
            toast({
                title: 'Starting AI Image Generation...',
                description: 'This may take several minutes. Please do not navigate away from this page.',
            });
            const newImages = await generateAllImages();
            
            // The AI flow returns data that matches our schema.
            // We can directly replace the form's field array state.
            replace(newImages);

            toast({
                title: 'AI Generation Complete!',
                description: 'All product images have been generated. Review and save your changes.',
            });

        } catch (error) {
            console.error("AI Image Generation Failed:", error);
            toast({
                variant: 'destructive',
                title: 'AI Generation Failed',
                description: 'An error occurred while generating images. Please check the console and try again.',
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
            Update the URLs and hints for all placeholder images used across the site. You can also use AI to generate all product images at once.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
               <Alert>
                  <Sparkles className="h-4 w-4" />
                  <AlertTitle>One-Click Image Generation</AlertTitle>
                  <AlertDescription className="flex justify-between items-center">
                    <p>
                      Use AI to generate and populate all product images automatically. 
                      This is a one-time operation and may take a few minutes.
                    </p>
                    <Button type="button" onClick={handleAiGenerate} disabled={isGenerating}>
                        {isGenerating ? (
                            <>
                               <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                               Generating...
                            </>
                        ) : (
                           <>
                             <Sparkles className="mr-2 h-4 w-4" />
                             Generate All Images with AI
                           </>
                        )}
                    </Button>
                  </AlertDescription>
                </Alert>

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
                                <Input {...field} readOnly className="bg-muted/50" />
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
                <Button type="submit" disabled={isPending || isGenerating}>
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
