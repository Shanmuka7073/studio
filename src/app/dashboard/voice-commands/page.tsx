'use client';

import { useState, useTransition, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2, PlusCircle, Save, X } from 'lucide-react';
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
        const newAliasInput = newCommands[actionKey]?.trim();
        if (!newAliasInput) {
            toast({
                variant: 'destructive',
                title: 'Cannot add empty command',
            });
            return;
        }

        const aliasesToAdd = newAliasInput.split(',').map(alias => alias.trim().toLowerCase()).filter(Boolean);
        let addedCount = 0;
        let duplicates: string[] = [];

        const updatedCommands = { ...commands };

        aliasesToAdd.forEach(newAlias => {
            if (!updatedCommands[actionKey].aliases.includes(newAlias)) {
                updatedCommands[actionKey].aliases.push(newAlias);
                addedCount++;
            } else {
                duplicates.push(newAlias);
            }
        });
        
        if (addedCount > 0) {
            setCommands(updatedCommands);
        }

        if (duplicates.length > 0) {
             toast({
                variant: 'destructive',
                title: 'Duplicate Command(s)',
                description: `The command(s) "${duplicates.join(', ')}" already exist.`,
            });
        }
        
        // Clear input
        setNewCommands(prev => ({...prev, [actionKey]: ''}));
    };

    const handleRemoveCommand = (actionKey: string, aliasToRemove: string) => {
        const updatedCommands = { ...commands };
        updatedCommands[actionKey].aliases = updatedCommands[actionKey].aliases.filter(
            alias => alias !== aliasToRemove
        );
        setCommands(updatedCommands);
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
                        Each action can be triggered by multiple phrases. Add new phrases (comma-separated) or remove existing ones. The "Go to [Store Name]" commands are generated automatically and cannot be edited here.
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
                                                    <Badge key={index} variant="secondary" className="relative pr-6 group">
                                                        {alias}
                                                         <button
                                                            onClick={() => handleRemoveCommand(key, alias)}
                                                            className="absolute top-1/2 -translate-y-1/2 right-1 rounded-full p-0.5 bg-background/50 hover:bg-background text-muted-foreground hover:text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                                                        >
                                                            <X className="h-3 w-3" />
                                                            <span className="sr-only">Remove {alias}</span>
                                                        </button>
                                                    </Badge>
                                                ))}
                                            </div>
                                             <div className="flex items-center gap-2 pt-4 border-t">
                                                <Input
                                                    placeholder="Add new phrase(s), comma-separated..."
                                                    value={newCommands[key] || ''}
                                                    onChange={(e) => setNewCommands(prev => ({...prev, [key]: e.target.value}))}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            e.preventDefault();
                                                            handleAddCommand(key);
                                                        }
                                                    }}
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
