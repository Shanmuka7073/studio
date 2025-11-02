'use client';

import { useState, useTransition, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2, PlusCircle, Save } from 'lucide-react';
import { getCommands, saveCommands } from '@/app/actions';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

type CommandGroup = {
  display: string;
  aliases: string[];
};

export default function VoiceCommandsPage() {
    const [isProcessing, startTransition] = useTransition();
    const [commands, setCommands] = useState<Record<string, CommandGroup>>({});
    const [newCommands, setNewCommands] = useState<Record<string, string>>({});

    const { toast } = useToast();

    useEffect(() => {
        startTransition(async () => {
            const fetchedCommands = await getCommands();
            setCommands(fetchedCommands);
        });
    }, []);

    const handleAddCommand = (actionKey: string) => {
        const newAlias = newCommands[actionKey]?.trim().toLowerCase(); // Convert to lowercase
        if (!newAlias) {
            toast({
                variant: 'destructive',
                title: 'Cannot add empty command',
            });
            return;
        }

        const updatedCommands = { ...commands };
        if (!updatedCommands[actionKey].aliases.includes(newAlias)) {
             updatedCommands[actionKey].aliases.push(newAlias);
             setCommands(updatedCommands);
        } else {
            toast({
                variant: 'destructive',
                title: 'Duplicate Command',
                description: `The command "${newAlias}" already exists for this action.`,
            });
        }

        // Clear input
        setNewCommands(prev => ({...prev, [actionKey]: ''}));
    };

    const handleSaveAll = () => {
        startTransition(async () => {
            try {
                await saveCommands(commands);
                toast({
                    title: 'Commands Saved!',
                    description: 'Your new voice commands have been saved successfully.',
                });
            } catch (error) {
                 toast({
                    variant: 'destructive',
                    title: 'Save Failed',
                    description: (error as Error).message || 'Could not save commands.',
                });
            }
        });
    };

    return (
        <div className="container mx-auto py-12 px-4 md:px-6">
             <div className="text-center mb-12">
                <h1 className="text-4xl font-bold font-headline">Voice Commands Control</h1>
                <p className="text-lg text-muted-foreground mt-2">View and add new phrases (aliases) for voice-activated actions.</p>
            </div>

            <Card className="max-w-4xl mx-auto">
                <CardHeader>
                    <CardTitle>Manage Command Aliases</CardTitle>
                    <CardDescription>
                        Each action can be triggered by multiple phrases. Add new phrases to make voice navigation easier for your users. The "Go to [Store Name]" commands are generated automatically from your store list and cannot be edited here.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {isProcessing && Object.keys(commands).length === 0 ? (
                        <div className="flex items-center justify-center">
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                            <span>Loading commands...</span>
                        </div>
                    ) : (
                         <Accordion type="multiple" className="w-full">
                            {Object.entries(commands).map(([key, group]) => (
                                <AccordionItem value={key} key={key}>
                                    <AccordionTrigger>
                                        <span className="font-semibold text-lg">{group.display}</span>
                                    </AccordionTrigger>
                                    <AccordionContent>
                                        <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                                            <div className="flex flex-wrap gap-2">
                                                {group.aliases.map((alias, index) => (
                                                    <Badge key={index} variant="secondary">{alias}</Badge>
                                                ))}
                                            </div>
                                             <div className="flex items-center gap-2 pt-4 border-t">
                                                <Input
                                                    placeholder="Add new phrase..."
                                                    value={newCommands[key] || ''}
                                                    onChange={(e) => setNewCommands(prev => ({...prev, [key]: e.target.value}))}
                                                    onKeyDown={(e) => e.key === 'Enter' && handleAddCommand(key)}
                                                />
                                                <Button size="sm" onClick={() => handleAddCommand(key)}>
                                                    <PlusCircle className="mr-2 h-4 w-4" /> Add
                                                </Button>
                                            </div>
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            ))}
                         </Accordion>
                    )}

                     <Button onClick={handleSaveAll} disabled={isProcessing} className="w-full mt-8">
                        {isProcessing ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Saving...
                            </>
                        ) : (
                             <>
                                <Save className="mr-2 h-4 w-4" />
                                Save All Changes
                            </>
                        )}
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
