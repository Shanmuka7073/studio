
'use client';
import { getStores } from '@/lib/data';
import StoreCard from '@/components/store-card';
import { useFirebase } from '@/firebase';
import { Store } from '@/lib/types';
import { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in kilometers
}


export default function StoresPage() {
  const { firestore } = useFirebase();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    async function fetchStoresAndLocation() {
        if (!firestore) return;
        setLoading(true);

        try {
            const fetchedStores = await getStores(firestore);

            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const { latitude, longitude } = position.coords;
                        const storesWithDistance = fetchedStores.map((store) => ({
                            ...store,
                            distance: haversineDistance(
                                latitude,
                                longitude,
                                store.latitude,
                                store.longitude
                            ),
                        }));
                        storesWithDistance.sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));
                        setStores(storesWithDistance);
                        setLoading(false);
                    },
                    (error) => {
                        toast({
                            variant: 'destructive',
                            title: 'Location Error',
                            description: 'Could not get your location. Displaying stores without distance.',
                        });
                        console.warn('Geolocation error:', error.message);
                        setStores(fetchedStores); // Show stores without distance info
                        setLoading(false);
                    }
                );
            } else {
                 toast({
                    variant: 'destructive',
                    title: 'Location Not Supported',
                    description: 'Geolocation is not supported by your browser.',
                });
                setStores(fetchedStores);
                setLoading(false);
            }
        } catch (err) {
            console.error(err);
            toast({
                variant: 'destructive',
                title: 'Error fetching stores',
            });
            setLoading(false);
        }
    }

    fetchStoresAndLocation();
  }, [firestore, toast]);

  return (
    <div className="container mx-auto py-12 px-4 md:px-6">
      <div className="space-y-4 mb-8">
        <h1 className="text-4xl font-bold font-headline">Browse All Stores</h1>
        <p className="text-muted-foreground text-lg">Find your new favorite local grocery store.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
        {loading ? (
          <p>Loading stores...</p>
        ) : stores.length > 0 ? (
          stores.map((store) => (
            <StoreCard key={store.id} store={store} />
          ))
        ) : (
           <p className="text-muted-foreground">No stores have been created yet.</p>
        )}
      </div>
    </div>
  );
}
