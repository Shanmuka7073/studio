
'use client';
import { Button } from '@/components/ui/button';
import { getStores } from '@/lib/data';
import StoreCard from '@/components/store-card';
import { useFirebase } from '@/firebase';
import { Store } from '@/lib/types';
import { useEffect, useState, useMemo } from 'react';
import { Mic } from 'lucide-react';
import { useAssistant } from '@/components/assistant/assistant-provider';


export default function Home() {
  const { firestore } = useFirebase();
  const [allStores, setAllStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const { toggleAssistant } = useAssistant();


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

  const displayedStores = useMemo(() => {
    return allStores.slice(0, 3);
  }, [allStores]);


  return (
    <div className="flex flex-col">
      <section className="w-full py-12 md:py-24 lg:py-32 bg-primary/10">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center space-y-8">
            <div className="space-y-4 text-center">
              <h1 className="text-3xl font-bold tracking-tighter sm:text-5xl xl:text-6xl/none font-headline">
                Shop Fresh, Shop Local, Just by Voice
              </h1>
              <p className="max-w-[600px] text-foreground/80 md:text-xl">
                Press the button and start your shopping list. Navigate, find products, and checkout, all without typing.
              </p>
            </div>
            <div className="w-full max-w-sm space-y-4">
               <Button onClick={toggleAssistant} size="lg" className="w-full h-16 text-lg bg-accent hover:bg-accent/90 text-accent-foreground">
                  <Mic className="mr-4 h-8 w-8" />
                  Tap to Start Shopping
                </Button>
                 <p className="text-xs text-foreground/60 text-center">
                  Try "Find bananas" or "Go to my orders".
                </p>
            </div>
          </div>
        </div>
      </section>

      <section className="w-full py-12 md:py-24 lg:py-32">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center justify-center space-y-4 text-center">
            <div className="space-y-2">
              <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl font-headline">
                Or Browse Featured Stores
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
