'use client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getStores } from '@/lib/data';
import { Search, Mic, MicOff } from 'lucide-react';
import StoreCard from '@/components/store-card';
import { useFirebase } from '@/firebase';
import { Store, Product } from '@/lib/types';
import { useEffect, useState, useMemo, useRef, useTransition } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { getDocs, collection } from 'firebase/firestore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import Link from 'next/link';
import { translateText } from '@/ai/flows/translate-flow';

interface MatchResult {
  store: Store;
  foundItems: Product[];
  notFoundItems: string[];
  matchCount: number;
}

function StoreSuggestionDialog({
  open,
  onOpenChange,
  result,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: MatchResult | null;
}) {
  if (!result) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {result.notFoundItems.length === 0
              ? 'We Found a Perfect Match!'
              : 'Here is the Best Match We Found'}
          </DialogTitle>
          <DialogDescription>
            Go to <strong>{result.store.name}</strong> to get your items.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold text-lg">{result.store.name}</h4>
            <p className="text-sm text-muted-foreground">{result.store.address}</p>
          </div>
          <div>
            <h4 className="font-semibold">Available Items ({result.foundItems.length})</h4>
            <ul className="list-disc list-inside text-sm text-muted-foreground">
              {result.foundItems.map(item => (
                <li key={item.id}>{item.name} ({item.localName || item.name})</li>
              ))}
            </ul>
          </div>
          {result.notFoundItems.length > 0 && (
            <div>
              <h4 className="font-semibold text-destructive">
                Unavailable Items ({result.notFoundItems.length})
              </h4>
              <ul className="list-disc list-inside text-sm text-destructive/80">
                {result.notFoundItems.map(item => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <DialogFooter>
           <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button asChild>
            <Link href={`/stores/${result.store.id}`}>Visit Store</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


export default function Home() {
  const { firestore } = useFirebase();
  const [allStores, setAllStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [shoppingList, setShoppingList] = useState('');
  const [isListening, setIsListening] = useState(false);
  const speechRecognition = useRef<SpeechRecognition | null>(null);
  const [isFindingStore, setIsFindingStore] = useState(false);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [isSuggestionOpen, setIsSuggestionOpen] = useState(false);
  const [isTranslating, startTranslation] = useTransition();

  useEffect(() => {
    async function fetchStores() {
      if (!firestore) return;
      setLoading(true);
      try {
        const stores = await getStores(firestore);
        setAllStores(stores);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchStores();
  }, [firestore]);
  
  useEffect(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      console.warn("Speech Recognition API is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true; // Keep listening
    recognition.interimResults = true; // Get results as they are being spoken
    recognition.lang = 'en-US'; // Set a default, but we'll translate anyway
    speechRecognition.current = recognition;

    recognition.onresult = (event) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }

      if (finalTranscript) {
          startTranslation(async () => {
            try {
                const translatedText = await translateText(finalTranscript);
                // Append translated text to the shopping list, each item on a new line
                const items = translatedText.split(/,|\band\b|\s+/).map(s => s.trim()).filter(Boolean);
                setShoppingList(prev => prev ? `${prev}\n${items.join('\n')}` : items.join('\n'));
            } catch (error) {
                console.error("Translation error:", error);
                // Fallback to original transcript if translation fails
                const items = finalTranscript.split(/,|\band\b|\s+/).map(s => s.trim()).filter(Boolean);
                setShoppingList(prev => prev ? `${prev}\n${items.join('\n')}` : items.join('\n'));
            }
        });
      }
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error", event.error);
      setIsListening(false); // Stop on error
    };
    
    // We don't use onend to stop listening, only when the user clicks the button
  }, [startTranslation]);

  const displayedStores = useMemo(() => {
    if (!searchTerm) {
      return allStores;
    }
    return allStores.filter(store => 
        store.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        store.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        store.address.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [allStores, searchTerm]);

  const toggleListening = () => {
    if (isListening) {
      speechRecognition.current?.stop();
      setIsListening(false);
    } else {
      speechRecognition.current?.start();
      setIsListening(true);
    }
  };

  const handleFindStore = async () => {
    if (!firestore || !shoppingList.trim()) return;

    setIsFindingStore(true);
    setMatchResult(null);

    const desiredItems = shoppingList.trim().toLowerCase().split('\n').map(s => s.trim()).filter(Boolean);
    if (desiredItems.length === 0) {
      setIsFindingStore(false);
      return;
    }

    const stores = await getStores(firestore);
    let bestMatch: MatchResult | null = null;

    for (const store of stores) {
      const productsSnapshot = await getDocs(collection(firestore, 'stores', store.id, 'products'));
      const storeProducts = productsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as Product[];
      
      const foundItems: Product[] = [];
      const notFoundItems: string[] = [];
      
      desiredItems.forEach(desiredItem => {
        // More lenient matching
        const foundProduct = storeProducts.find(p => p.name.toLowerCase().includes(desiredItem));
        if (foundProduct) {
          if (!foundItems.some(item => item.id === foundProduct.id)) {
            foundItems.push(foundProduct);
          }
        }
      });
      
      const matchCount = foundItems.length;

      const foundProductNames = foundItems.map(p => p.name.toLowerCase());
      desiredItems.forEach(item => {
        if (!foundProductNames.some(pName => pName.includes(item))) {
            notFoundItems.push(item);
        }
      });

      if (!bestMatch || matchCount > bestMatch.matchCount) {
        bestMatch = { store, foundItems, notFoundItems, matchCount };
      }
      
      if (matchCount === desiredItems.length) {
        break;
      }
    }

    setMatchResult(bestMatch);
    setIsFindingStore(false);
    if(bestMatch) {
      setIsSuggestionOpen(true);
    }
  };


  return (
    <div className="flex flex-col">
      <section className="w-full py-12 md:py-24 lg:py-32 bg-primary/10">
        <div className="container px-4 md:px-6">
          <div className="grid gap-6 lg:grid-cols-[1fr_400px] lg:gap-12 xl:grid-cols-[1fr_600px]">
            <div className="flex flex-col justify-center space-y-4">
              <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tighter sm:text-5xl xl:text-6xl/none font-headline">
                  Shop Fresh, Shop Local with LocalBasket
                </h1>
                <p className="max-w-[600px] text-foreground/80 md:text-xl">
                  Discover the best groceries from your neighborhood stores. We connect you with local vendors for fresh produce, everyday essentials, and more, all delivered to your door.
                </p>
              </div>
              <div className="w-full max-w-sm space-y-2">
                <div className="flex space-x-2">
                  <Input
                    type="text"
                    placeholder="Search for stores by name or area..."
                    className="max-w-lg flex-1"
                    aria-label="Search Stores"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  <Button variant="default" className="bg-accent hover:bg-accent/90 text-accent-foreground">
                    <Search className="mr-2 h-4 w-4" />
                    Search
                  </Button>
                </div>
                <p className="text-xs text-foreground/60">
                  Find your favorite local shops.
                </p>
              </div>
            </div>
             <img
                src="https://picsum.photos/seed/hero-basket/600/400"
                alt="Hero"
                data-ai-hint="grocery basket"
                className="mx-auto aspect-video overflow-hidden rounded-xl object-cover sm:w-full lg:order-last lg:aspect-square"
              />
          </div>
        </div>
      </section>

      <section className="w-full py-12 md:py-24 lg:py-32 bg-muted/50">
        <div className="container px-4 md:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl font-headline">Smart Store Finder</h2>
            <p className="text-foreground/80 md:text-xl/relaxed mt-2">
              Create your shopping list, and we'll find the best store that has all your items.
            </p>
          </div>
          <Card className="max-w-2xl mx-auto mt-8">
            <CardHeader>
              <CardTitle>Create Your Shopping List</CardTitle>
              <CardDescription>Type, paste, or speak the items you need. Place each item on a new line.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Textarea
                  placeholder="Apples&#10;Bread&#10;Milk"
                  className="pr-12"
                  rows={5}
                  value={shoppingList}
                  onChange={(e) => setShoppingList(e.target.value)}
                />
                <Button onClick={toggleListening} variant={isListening ? "destructive" : "outline"} size="icon" className="absolute top-3 right-3">
                  {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  <span className="sr-only">Toggle Voice Input</span>
                </Button>
              </div>
              <Button onClick={handleFindStore} disabled={isFindingStore || !shoppingList.trim() || isTranslating} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground">
                {isFindingStore ? 'Searching Stores...' : (isTranslating ? 'Processing Voice...' : 'Find My Store')}
              </Button>
            </CardContent>
          </Card>
          <StoreSuggestionDialog open={isSuggestionOpen} onOpenChange={setIsSuggestionOpen} result={matchResult} />
        </div>
      </section>

      <section className="w-full py-12 md:py-24 lg:py-32">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center justify-center space-y-4 text-center">
            <div className="space-y-2">
              <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl font-headline">
                {searchTerm ? `Results for "${searchTerm}"` : 'Or Browse Featured Stores'}
              </h2>
              <p className="max-w-[900px] text-foreground/80 md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                Explore top-rated local stores right in your neighborhood.
              </p>
            </div>
          </div>
          <div className="mx-auto grid grid-cols-1 gap-6 py-12 sm:grid-cols-2 lg:grid-cols-3">
            {loading ? (
              <p>Loading stores...</p>
            ) : displayedStores.length > 0 ? (
              displayedStores.map((store) => (
                <StoreCard key={store.id} store={store} />
              ))
            ) : (
              <p>No stores found.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
