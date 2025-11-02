
'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2, PlusCircle, Save, X, Mic, MessageSquare } from 'lucide-react';
import { getCommands, saveCommands } from '@/app/actions';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Label } from '@/components/ui/label';

type CommandGroup = {
  display: string;
  reply: string;
  aliases: string[];
};

export default function VoiceCommandsPage() {
    const [isProcessing, startTransition] = useTransition();
    const [commands, setCommands] = useState<Record<string, CommandGroup>>({});
    const [newCommands, setNewCommands] = useState<Record<string, string>>({});
    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef<SpeechRecognition | null>(null);

    const { toast } = useToast();

    useEffect(() => {
        startTransition(async () => {
            const fetchedCommands = await getCommands();
            setCommands(fetchedCommands);
        });

        // Setup speech recognition
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            recognitionRef.current = new SpeechRecognition();
            const recognition = recognitionRef.current;
            recognition.continuous = false;
            recognition.lang = 'en-IN';
            recognition.interimResults = false;

            recognition.onstart = () => {
                setIsListening(true);
            };

            recognition.onend = () => {
                setIsListening(false);
            };

            recognition.onerror = (event) => {
                console.error("Speech recognition error:", event.error);
                toast({ variant: 'destructive', title: 'Voice Error', description: `An error occurred: ${event.error}` });
                setIsListening(false);
            };
        } else {
            console.warn("Speech recognition not supported in this browser.");
        }
    }, [toast]);

    const handleAddCommand = (actionKey: string) => {
        const newAliasInput = newCommands[actionKey]?.trim();
        if (!newAliasInput) {
            toast({
                variant: 'destructive',
                title: 'Cannot add empty command',
            });
            return;
        }

        addAlias(actionKey, newAliasInput);
        
        // Clear input
        setNewCommands(prev => ({...prev, [actionKey]: ''}));
    };

    const addAlias = (actionKey: string, newAliasString: string) => {
        const aliasesToAdd = newAliasString.split(',').map(alias => alias.trim().toLowerCase()).filter(Boolean);
        if (aliasesToAdd.length === 0) return;

        let addedCount = 0;
        let duplicates: string[] = [];
        
        setCommands(currentCommands => {
            // Create a deep copy to avoid state mutation issues
            const updatedCommands = JSON.parse(JSON.stringify(currentCommands));
            
            if (!updatedCommands[actionKey]) {
                updatedCommands[actionKey] = {
                    display: 'New Command Group',
                    reply: 'New reply.',
                    aliases: []
                };
            }
            
            aliasesToAdd.forEach(newAlias => {
                if (!updatedCommands[actionKey].aliases.includes(newAlias)) {
                    updatedCommands[actionKey].aliases.push(newAlias);
                    addedCount++;
                } else {
                    duplicates.push(newAlias);
                }
            });

            return updatedCommands;
        });

        if (duplicates.length > 0) {
             toast({
                variant: 'destructive',
                title: 'Duplicate Command(s)',
                description: `The command(s) "${duplicates.join(', ')}" already exist.`,
            });
        }
        if (addedCount > 0) {
            toast({
                title: 'Alias Added',
                description: `Added "${aliasesToAdd.join(', ')}" to the list.`
            })
        }
    };


    const handleRemoveCommand = (actionKey: string, aliasToRemove: string) => {
        setCommands(currentCommands => {
            const updatedCommands = { ...currentCommands };
            if (updatedCommands[actionKey]) {
                 updatedCommands[actionKey] = {
                    ...updatedCommands[actionKey],
                    aliases: updatedCommands[actionKey].aliases.filter(
                        alias => alias !== aliasToRemove
                    ),
                 };
            }
            return updatedCommands;
        });
    };

    const handleReplyChange = (actionKey: string, newReply: string) => {
        setCommands(currentCommands => ({
            ...currentCommands,
            [actionKey]: {
                ...currentCommands[actionKey],
                reply: newReply
            }
        }));
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

    const handleVoiceAdd = (actionKey: string) => {
        if (!recognitionRef.current) {
            toast({ variant: 'destructive', title: 'Voice Not Supported', description: 'Your browser does not support speech recognition.' });
            return;
        }

        const recognition = recognitionRef.current;

        recognition.onresult = (event) => {
            const newAlias = event.results[0][0].transcript.toLowerCase();
            addAlias(actionKey, newAlias);
        };

        recognition.start();
    };

    return (
        <div className="container mx-auto py-12 px-4 md:px-6">
             <div className="text-center mb-12">
                <h1 className="text-4xl font-bold font-headline">Voice Commands Control</h1>
                <p className="text-lg text-muted-foreground mt-2">View and add new phrases (aliases) for voice-activated actions and edit their replies.</p>
            </div>

            <Card className="max-w-4xl mx-auto">
                <CardHeader>
                    <CardTitle>Manage Commands & Replies</CardTitle>
                    <CardDescription>
                        Each action can be triggered by multiple phrases. You can also customize what the app says back to you.
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
                                        <div className="space-y-6 p-4 bg-muted/50 rounded-lg">
                                            
                                            <div className="space-y-2">
                                                <Label htmlFor={`reply-${key}`} className="flex items-center gap-2 font-semibold">
                                                    <MessageSquare className="h-4 w-4" />
                                                    App's Reply
                                                </Label>
                                                <Input
                                                    id={`reply-${key}`}
                                                    value={group.reply || ''}
                                                    onChange={(e) => handleReplyChange(key, e.target.value)}
                                                    placeholder="Enter what the app should say..."
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <Label className="font-semibold">User's Phrases (Aliases)</Label>
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
                                                <Button size="sm" variant="outline" onClick={() => handleVoiceAdd(key)} disabled={isListening}>
                                                    <Mic className="h-4 w-4" />
                                                    <span className="sr-only">Add by voice</span>
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
