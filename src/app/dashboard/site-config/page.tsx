'use client';

import { useState, useEffect, useTransition } from 'react';
import { useForm } from 'react-hook-form';
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
import { useFirebase, useDoc, useMemoFirebase, errorEmitter } from '@/firebase';
import { doc, setDoc } from 'firebase/firestore';
import type { SiteConfig } from '@/lib/types';
import { FirestorePermissionError } from '@/firebase/errors';

const configSchema = z.object({
  siteTitle: z.string().min(3, 'Site title must be at least 3 characters'),
});

type ConfigFormValues = z.infer<typeof configSchema>;

export default function SiteConfigPage() {
  const { toast } = useToast();
  const [isSaving, startTransition] = useTransition();
  const { firestore, user } = useFirebase();

  // Define the reference to the config document
  const siteConfigRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, 'config', 'site');
  }, [firestore]);

  // Use the useDoc hook to get live data
  const { data: siteConfig, isLoading } = useDoc<SiteConfig>(siteConfigRef);

  const form = useForm<ConfigFormValues>({
    resolver: zodResolver(configSchema),
    defaultValues: {
      siteTitle: '',
    },
  });
  
  // When the data loads from Firestore, update the form's default values
  useEffect(() => {
    if (siteConfig) {
      form.reset({ siteTitle: siteConfig.siteTitle });
    }
  }, [siteConfig, form]);


  const onSubmit = (data: ConfigFormValues) => {
    if (!user || !firestore) {
      toast({
        variant: 'destructive',
        title: 'Authentication Error',
        description: 'You must be logged in to change settings.',
      });
      return;
    }

    startTransition(() => {
      if (!siteConfigRef) return;
      
      // Use the setDoc function from Firebase to save the data
      setDoc(siteConfigRef, data, { merge: true })
        .then(() => {
          toast({
            title: 'Settings Saved!',
            description: 'Your new site title has been saved.',
          });
        })
        .catch(async (serverError) => {
          const permissionError = new FirestorePermissionError({
            path: siteConfigRef.path,
            operation: 'write',
            requestResourceData: data,
          });
          errorEmitter.emit('permission-error', permissionError);
        });
    });
  };

  return (
    <div className="container mx-auto py-12 px-4 md:px-6">
      <h1 className="text-4xl font-bold font-headline mb-8">
        Site Configuration
      </h1>
      
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Edit Site Settings</CardTitle>
          <CardDescription>
            These settings are saved to the backend (Firestore) and will be reflected across the site for all users.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <FormField
                control={form.control}
                name="siteTitle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Site Title</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., My Awesome Shop"
                        {...field}
                        disabled={isLoading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <Button
                type="submit"
                className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
                disabled={isSaving || isLoading || !user}
              >
                {isSaving ? 'Saving...' : 'Save Settings'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
    