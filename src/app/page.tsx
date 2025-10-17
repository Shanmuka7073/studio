'use client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getStores } from '@/lib/data';
import { MapPin } from 'lucide-react';
import StoreCard from '@/components/store-card';
import { useFirebase } from '@/firebase';
import { Store } from '@/lib/types';
import { useEffect, useState } from 'react';
import haversine from 'haversine-distance';

type Coords = {
  latitude: number;
  longitude: number;
};

export default function Home() {
  const { firestore } = useFirebase();
  const [allStores, setAllStores] = useState<Store[]>([]);
  const [nearbyStores, setNearbyStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<Coords | null>(null);

  useEffect(() => {
    async function fetchStoresAndLocation() {
      if (!firestore) return;

      setLoading(true);
      setLocationError(null);

      try {
        const stores = await getStores(firestore);
        setAllStores(stores);

        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              const currentUserLocation: Coords = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
              };
              setUserLocation(currentUserLocation);
              
              const storesWithDistance = stores.map(store => {
                  const storeLocation = { latitude: store.latitude, longitude: store.longitude };
                  const distanceInMeters = haversine(currentUserLocation, storeLocation);
                  return { ...store, distance: distanceInMeters / 1000 }; // distance in km
              });

              const storesWithinRadius = storesWithDistance.filter((store) => {
                return store.distance! <= 3;
              });
              
              // Sort by distance
              storesWithinRadius.sort((a,b) => a.distance! - b.distance!);

              if (storesWithinRadius.length > 0) {
                 setNearbyStores(storesWithinRadius);
              } else {
                setLocationError("No stores found within a 3km radius. Showing all stores instead.");
                setNearbyStores(stores); // Fallback to show all stores
              }

              setLoading(false);
            },
            (error) => {
              console.error("Geolocation error:", error);
              setLocationError("Could not get your location. Showing all available stores.");
              setNearbyStores(stores); // Fallback to show all stores
              setLoading(false);
            }
          );
        } else {
          setLocationError("Geolocation is not supported by your browser. Showing all stores.");
          setNearbyStores(stores); // Fallback to show all stores
          setLoading(false);
        }
      } catch (err) {
        console.error(err);
        setLocationError("Failed to load stores.");
        setLoading(false);
      }
    }

    fetchStoresAndLocation();
  }, [firestore]);


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
                <form className="flex space-x-2">
                  <Input
                    type="text"
                    placeholder="Your location is detected automatically"
                    className="max-w-lg flex-1"
                    aria-label="Location"
                    disabled
                  />
                  <Button type="submit" variant="default" className="bg-accent hover:bg-accent/90 text-accent-foreground">
                    <MapPin className="mr-2 h-4 w-4" />
                    Find Stores
                  </Button>
                </form>
                <p className="text-xs text-foreground/60">
                  We'll show you stores within 3km of your location.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-center">
                <img
                    src="https://picsum.photos/seed/1/600/400"
                    alt="Hero"
                    data-ai-hint="grocery basket"
                    className="mx-auto aspect-video overflow-hidden rounded-xl object-cover sm:w-full lg:order-last lg:aspect-square"
                />
            </div>
          </div>
        </div>
      </section>

      <section className="w-full py-12 md:py-24 lg:py-32">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center justify-center space-y-4 text-center">
            <div className="space-y-2">
              <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl font-headline">Featured Local Stores</h2>
              <p className="max-w-[900px] text-foreground/80 md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                {locationError ? locationError : 'Explore top-rated local stores right in your neighborhood.'}
              </p>
            </div>
          </div>
          <div className="mx-auto grid grid-cols-1 gap-6 py-12 sm:grid-cols-2 lg:grid-cols-3">
            {loading ? (
              <p>Finding nearby stores...</p>
            ) : (
              nearbyStores.map((store) => (
                <StoreCard key={store.id} store={store} userLocation={userLocation} />
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
