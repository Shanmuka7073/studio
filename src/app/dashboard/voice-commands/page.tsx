
'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2, PlusCircle, Save, X, Mic, MessageSquare, Code, Package } from 'lucide-react';
import { getCommands, saveCommands, getLocales, saveLocales } from '@/app/actions';
import { useAppStore } from '@/lib/store';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type CommandGroup = {
  display: string;
  reply: string;
  aliases: string[];
};

type LocaleEntry = string | string[];
type Locales = Record<string, Record<string, LocaleEntry>>;

const createSlug = (text: string) => text.toLowerCase().replace(/ & /g, '-').replace(/ /g, '-');


export default function VoiceCommandsPage() {
    const [isProcessing, startTransition] = useTransition();
    const [activeTab, setActiveTab] = useState('general'); // 'general' or 'products'

    const [commands, setCommands] = useState<Record<string, CommandGroup>>({});
    const [newCommands, setNewCommands] = useState<Record<string, string>>({});
    
    const [locales, setLocales] = useState<Locales>({});
    const [newAliases, setNewAliases] = useState<Record<string, Record<string, string>>>({});

    const { masterProducts, fetchInitialData } = useAppStore();
    const { firestore } = useFirebase();

    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef<SpeechRecognition | null>(null);

    const { toast } = useToast();

    useEffect(() => {
        startTransition(async () => {
            if (firestore) {
                await fetchInitialData(firestore);
            }
            const [fetchedCommands, fetchedLocales] = await Promise.all([getCommands(), getLocales()]);
            setCommands(fetchedCommands);
            setLocales(fetchedLocales);
        });

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            recognitionRef.current = new SpeechRecognition();
            const recognition = recognitionRef.current;
            recognition.continuous = false;
            recognition.lang = 'en-IN';
            recognition.interimResults = false;

            recognition.onstart = () => setIsListening(true);
            recognition.onend = () => setIsListening(false);
            recognition.onerror = (event) => {
                console.error("Speech recognition error:", event.error);
                toast({ variant: 'destructive', title: 'Voice Error', description: `An error occurred: ${event.error}` });
                setIsListening(false);
            };
        } else {
            console.warn("Speech recognition not supported in this browser.");
        }
    }, [toast, firestore, fetchInitialData]);

    const handleAddCommand = (actionKey: string) => {
        const newAliasInput = newCommands[actionKey]?.trim();
        if (!newAliasInput) {
            toast({ variant: 'destructive', title: 'Cannot add empty command' });
            return;
        }
        addAlias('commands', actionKey, newAliasInput);
        setNewCommands(prev => ({...prev, [actionKey]: ''}));
    };

    const handleAddProductAlias = (productKey: string, lang: string) => {
        const newAliasInput = newAliases[productKey]?.[lang]?.trim();
        if(!newAliasInput) {
            toast({ variant: 'destructive', title: 'Cannot add empty alias' });
            return;
        }
        addAlias('locales', productKey, newAliasInput, lang);
        setNewAliases(prev => ({
            ...prev,
            [productKey]: {
                ...prev[productKey],
                [lang]: ''
            }
        }));
    };

    const addAlias = (type: 'commands' | 'locales', key: string, newAliasString: string, lang?: string) => {
        const aliasesToAdd = newAliasString.split(',').map(alias => alias.trim().toLowerCase()).filter(Boolean);
        if (aliasesToAdd.length === 0) return;

        let addedCount = 0;
        let duplicates: string[] = [];

        if (type === 'commands') {
            setCommands(currentCommands => {
                const updatedCommands = JSON.parse(JSON.stringify(currentCommands));
                aliasesToAdd.forEach(newAlias => {
                    const isDuplicate = Object.values(updatedCommands).some(group => group.aliases.includes(newAlias));
                    if (!updatedCommands[key].aliases.includes(newAlias) && !isDuplicate) {
                        updatedCommands[key].aliases.push(newAlias);
                        addedCount++;
                    } else { duplicates.push(newAlias); }
                });
                return updatedCommands;
            });
        } else if (type === 'locales' && lang) {
            setLocales(currentLocales => {
                const updatedLocales = JSON.parse(JSON.stringify(currentLocales));
                if (!updatedLocales[key]) updatedLocales[key] = {};
                
                const existingAliases = Array.isArray(updatedLocales[key][lang]) ? updatedLocales[key][lang] : [updatedLocales[key][lang]].filter(Boolean);
                
                aliasesToAdd.forEach(newAlias => {
                    if(!existingAliases.includes(newAlias)) {
                        existingAliases.push(newAlias);
                        addedCount++;
                    } else {
                        duplicates.push(newAlias);
                    }
                });
                updatedLocales[key][lang] = existingAliases;
                return updatedLocales;
            });
        }

        if (duplicates.length > 0) {
             toast({ variant: 'destructive', title: 'Duplicate Item(s)', description: `"${duplicates.join(', ')}" already exist.` });
        }
        if (addedCount > 0) {
            toast({ title: 'Alias Added', description: `Added "${aliasesToAdd.join(', ')}".` });
        }
    };


    const handleRemoveCommand = (actionKey: string, aliasToRemove: string) => {
        setCommands(currentCommands => {
            const updatedCommands = { ...currentCommands };
            if (updatedCommands[actionKey]) {
                 updatedCommands[actionKey] = {
                    ...updatedCommands[actionKey],
                    aliases: updatedCommands[actionKey].aliases.filter(alias => alias !== aliasToRemove),
                 };
            }
            return updatedCommands;
        });
    };

     const handleRemoveProductAlias = (productKey: string, lang: string, aliasToRemove: string) => {
        setLocales(currentLocales => {
            const updatedLocales = { ...currentLocales };
            if (updatedLocales[productKey] && Array.isArray(updatedLocales[productKey][lang])) {
                (updatedLocales[productKey][lang] as string[]) = (updatedLocales[productKey][lang] as string[]).filter(alias => alias !== aliasToRemove);
            }
            return updatedLocales;
        });
    };

    const handleReplyChange = (actionKey: string, newReply: string) => {
        setCommands(currentCommands => ({
            ...currentCommands,
            [actionKey]: { ...currentCommands[actionKey], reply: newReply }
        }));
    };

    const handleSaveAll = () => {
        startTransition(async () => {
            try {
                await Promise.all([saveCommands(commands), saveLocales(locales)]);
                toast({
                    title: 'Commands Saved!',
                    description: 'Your new voice commands and aliases have been saved successfully.',
                });
            } catch (error) {
                 toast({
                    variant: 'destructive',
                    title: 'Save Failed',
                    description: (error as Error).message || 'Could not save changes.',
                });
            }
        });
    };

    const handleVoiceAdd = (type: 'commands' | 'locales', key: string, lang?: string) => {
        if (!recognitionRef.current) {
            toast({ variant: 'destructive', title: 'Voice Not Supported', description: 'Your browser does not support speech recognition.' });
            return;
        }
        const recognition = recognitionRef.current;
        recognition.lang = lang || 'en-IN';
        recognition.onresult = (event) => addAlias(type, key, event.results[0][0].transcript.toLowerCase(), lang);
        recognition.start();
    };
    
    const isTemplateKey = (key: string) => key === 'orderItem';

    const renderGeneralCommands = () => (
        <Card className="max-w-4xl mx-auto">
            <CardHeader>
                <CardTitle>Manage General Commands & Replies</CardTitle>
                <CardDescription>
                    Each action can be triggered by multiple phrases. For ordering, use {'{product}'} and {'{quantity}'} as placeholders.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <Accordion type="multiple" className="w-full">
                    {Object.entries(commands).map(([key, group]) => (
                        <AccordionItem value={key} key={key}>
                            <AccordionTrigger>
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold text-lg">{group.display}</span>
                                    {isTemplateKey(key) && <Badge variant="outline">Template</Badge>}
                                </div>
                            </AccordionTrigger>
                            <AccordionContent>
                                <div className="space-y-6 p-4 bg-muted/50 rounded-lg">
                                    <div className="space-y-2">
                                        <Label htmlFor={`reply-${key}`} className="flex items-center gap-2 font-semibold"><MessageSquare className="h-4 w-4" />App's Reply</Label>
                                        <Input id={`reply-${key}`} value={group.reply || ''} onChange={(e) => handleReplyChange(key, e.target.value)} placeholder="Enter what the app should say..." />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="font-semibold">User's Phrases (Aliases)</Label>
                                        <div className="flex flex-wrap gap-2">
                                            {group.aliases.map((alias, index) => (
                                                <Badge key={index} variant={isTemplateKey(key) ? "default" : "secondary"} className="relative pr-6 group text-base py-1">
                                                    {alias}
                                                    <button onClick={() => handleRemoveCommand(key, alias)} className="absolute top-1/2 -translate-y-1/2 right-1 rounded-full p-0.5 bg-background/50 hover:bg-background text-muted-foreground hover:text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <X className="h-3 w-3" /><span className="sr-only">Remove {alias}</span>
                                                    </button>
                                                </Badge>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 pt-4 border-t">
                                        <Input placeholder={isTemplateKey(key) ? "e.g., I want {quantity} of {product}" : "Add new phrase(s), comma-separated..."} value={newCommands[key] || ''} onChange={(e) => setNewCommands(prev => ({...prev, [key]: e.target.value}))} onKeyDown={(e) => {if (e.key === 'Enter') { e.preventDefault(); handleAddCommand(key);}}}/>
                                        <Button size="sm" onClick={() => handleAddCommand(key)}><PlusCircle className="mr-2 h-4 w-4" /> Add</Button>
                                        <Button size="sm" variant="outline" onClick={() => handleVoiceAdd('commands', key)} disabled={isListening}><Mic className="h-4 w-4" /><span className="sr-only">Add by voice</span></Button>
                                    </div>
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>
            </CardContent>
        </Card>
    );

    const renderProductAliases = () => (
        <Card className="max-w-4xl mx-auto">
            <CardHeader>
                <CardTitle>Manage Product Aliases</CardTitle>
                <CardDescription>
                    Add alternative names for products in different languages to improve voice recognition.
                </CardDescription>
            </CardHeader>
            <CardContent>
                 <Accordion type="multiple" className="w-full">
                    {masterProducts.map((product) => {
                        const productKey = createSlug(product.name);
                        const productAliases = locales[productKey] || {};
                        return (
                            <AccordionItem value={productKey} key={productKey}>
                                <AccordionTrigger>
                                    <div className="flex items-center gap-2">
                                        <Package className="h-4 w-4 text-muted-foreground" />
                                        <span className="font-semibold text-base">{product.name}</span>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent>
                                    <div className="space-y-6 p-4 bg-muted/50 rounded-lg">
                                        {['en', 'te'].map(lang => {
                                            const currentAliases: string[] = Array.isArray(productAliases[lang]) ? productAliases[lang] as string[] : (productAliases[lang] ? [productAliases[lang] as string] : []);
                                            return (
                                                <div key={lang} className="space-y-2">
                                                    <Label className="font-semibold text-sm uppercase">{lang} Aliases</Label>
                                                    <div className="flex flex-wrap gap-2">
                                                        {currentAliases.map((alias) => (
                                                            <Badge key={alias} variant="secondary" className="relative pr-6 group text-base py-1">
                                                                {alias}
                                                                <button onClick={() => handleRemoveProductAlias(productKey, lang, alias)} className="absolute top-1/2 -translate-y-1/2 right-1 rounded-full p-0.5 bg-background/50 hover:bg-background text-muted-foreground hover:text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    <X className="h-3 w-3" /><span className="sr-only">Remove {alias}</span>
                                                                </button>
                                                            </Badge>
                                                        ))}
                                                        {currentAliases.length === 0 && <p className="text-xs text-muted-foreground">No aliases yet.</p>}
                                                    </div>
                                                     <div className="flex items-center gap-2 pt-2 border-t">
                                                        <Input placeholder={`Add ${lang} alias(es), comma-separated...`} value={newAliases[productKey]?.[lang] || ''} onChange={(e) => setNewAliases(p => ({ ...p, [productKey]: { ...p[productKey], [lang]: e.target.value } }))} onKeyDown={(e) => {if (e.key === 'Enter') { e.preventDefault(); handleAddProductAlias(productKey, lang); }}} />
                                                        <Button size="sm" onClick={() => handleAddProductAlias(productKey, lang)}><PlusCircle className="mr-2 h-4 w-4" /> Add</Button>
                                                         <Button size="sm" variant="outline" onClick={() => handleVoiceAdd('locales', productKey, lang === 'te' ? 'te-IN' : 'en-IN')} disabled={isListening}><Mic className="h-4 w-4" /><span className="sr-only">Add by voice</span></Button>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                        )
                    })}
                 </Accordion>
            </CardContent>
        </Card>
    );

    return (
        <div className="container mx-auto py-12 px-4 md:px-6 space-y-8">
             <div className="text-center mb-12">
                <h1 className="text-4xl font-bold font-headline">Voice System Control</h1>
                <p className="text-lg text-muted-foreground mt-2">Manage phrases, aliases, and replies for all voice-activated actions.</p>
            </div>
            
            <div className="flex justify-center gap-2 mb-8">
                <Button variant={activeTab === 'general' ? 'default' : 'outline'} onClick={() => setActiveTab('general')}>General Commands</Button>
                <Button variant={activeTab === 'products' ? 'default' : 'outline'} onClick={() => setActiveTab('products')}>Product Aliases</Button>
            </div>

            {isProcessing && Object.keys(commands).length === 0 && Object.keys(locales).length === 0 ? (
                <div className="flex items-center justify-center h-64">
                    <Loader2 className="mr-2 h-8 w-8 animate-spin" />
                    <span className="text-lg">Loading voice settings...</span>
                </div>
            ) : (
                <>
                    {activeTab === 'general' && renderGeneralCommands()}
                    {activeTab === 'products' && renderProductAliases()}
                </>
            )}

            <div className="max-w-4xl mx-auto mt-8">
                <Button onClick={handleSaveAll} disabled={isProcessing} className="w-full" size="lg">
                    {isProcessing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving All Changes...</> : <><Save className="mr-2 h-4 w-4" />Save All Changes</>}
                </Button>
            </div>


            <Card className="max-w-4xl mx-auto">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Code className="h-5 w-5" />Raw JSON View</CardTitle>
                    <CardDescription>This is a read-only view of the files that power the voice system.</CardDescription>
                </CardHeader>
                <CardContent className="grid md:grid-cols-2 gap-4">
                     <div>
                        <Label htmlFor="commands-json">commands.json</Label>
                        <Textarea id="commands-json" readOnly value={JSON.stringify(commands, null, 2)} className="bg-muted font-mono text-xs h-96" />
                     </div>
                      <div>
                        <Label htmlFor="locales-json">locales.json</Label>
                        <Textarea id="locales-json" readOnly value={JSON.stringify(locales, null, 2)} className="bg-muted font-mono text-xs h-96" />
                     </div>
                </CardContent>
            </Card>
        </div>
    );
}
