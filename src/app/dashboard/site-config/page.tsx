'use client';

import { useState, useTransition } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Search } from 'lucide-react';
import { indexSiteContent } from '@/app/actions';

export default function SiteConfigPage() {
    const [isIndexing, startIndexingTransition] = useTransition();
    const [appUrl, setAppUrl] = useState('');
    const { toast } = useToast();

    const handleIndexSite = async () => {
        startIndexingTransition(async () => {
            toast({
                title: 'Starting Indexer...',
                description: 'Fetching all stores and products from the database.',
            });

            const result = await indexSiteContent();
            
            if (result.success) {
                toast({
                    title: 'Indexing Complete!',
                    description: result.message,
                });
            } else {
                 toast({
                    variant: 'destructive',
                    title: 'Indexing Failed',
                    description: result.message,
                });
            }
        });
    };

    return (
        <div className="container mx-auto py-12 px-4 md:px-6">
             <div className="text-center mb-12">
                <h1 className="text-4xl font-bold font-headline">Site Configuration</h1>
                <p className="text-lg text-muted-foreground mt-2">Manage how the voice assistant understands your app's content.</p>
            </div>

            <Card className="max-w-2xl mx-auto">
                <CardHeader>
                    <CardTitle>Voice Command Indexer</CardTitle>
                    <CardDescription>
                        Run the indexer to scan your database for all available stores and products. This process gathers the necessary data to build and update voice commands automatically. This replaces the need for a traditional web crawler.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <Label htmlFor="app-url">App URL (For Reference)</Label>
                        <Input 
                            id="app-url"
                            placeholder="https://yourapp.com"
                            value={appUrl}
                            onChange={(e) => setAppUrl(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                            This URL is for your reference and is not used by the indexing process, which reads directly from your database.
                        </p>
                    </div>

                    <Button onClick={handleIndexSite} disabled={isIndexing} className="w-full">
                        {isIndexing ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Indexing...
                            </>
                        ) : (
                             <>
                                <Search className="mr-2 h-4 w-4" />
                                Index Site for Voice Commands
                            </>
                        )}
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
