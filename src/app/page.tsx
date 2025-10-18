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

// A simple mock geocoding function. In a real app, this would be a Google Maps Geocoding API call.
const geocodeAddress = (address: string): Coords | null => {
    // This is a mock. It will only work for a few hardcoded locations.
    const locations: Record<string, Coords> = {
        "new york": { latitude: 40.7128, longitude: -74.0060 },
        "mumbai": { latitude: 19.0760, longitude: 72.8777 },
        "london": { latitude: 51.5074, longitude: -0.1278 },
    };
    const lowerCaseAddress = address.toLowerCase();
    for (const location in locations) {
        if (lowerCaseAddress.includes(location)) {
            return locations[location];
        }
    }
    return null; // Return null if no match found
}


export default function Home() {
  const { firestore } = useFirebase();
  const [allStores, setAllStores] = useState<Store[]>([]);
  const [displayedStores, setDisplayedStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<Coords | null>(null);
  const [locationInput, setLocationInput] = useState('');

  useEffect(() => {
    async function fetchStores() {
      if (!firestore) return;
      setLoading(true);
      try {
        const stores = await getStores(firestore);
        setAllStores(stores);
        setDisplayedStores(stores); // Initially display all stores
      } catch (err) {
        console.error(err);
        setLocationError("Failed to load stores.");
      } finally {
        setLoading(false);
      }
    }
    fetchStores();
  }, [firestore]);
  
  const handleFindStores = () => {
    if (!locationInput) {
        setDisplayedStores(allStores);
        setUserLocation(null);
        setLocationError(null);
        return;
    }

    const locatedCoords = geocodeAddress(locationInput);
    setUserLocation(locatedCoords);

    if (locatedCoords) {
        setLocationError(null);
        const storesWithDistance = allStores.map(store => {
            const storeLocation = { latitude: store.latitude, longitude: store.longitude };
            const distanceInMeters = haversine(locatedCoords, storeLocation);
            return { ...store, distance: distanceInMeters / 1000 }; // distance in km
        });

        storesWithDistance.sort((a,b) => a.distance! - b.distance!);
        setDisplayedStores(storesWithDistance);
    } else {
        setLocationError(`Could not find location for "${locationInput}". Showing all stores.`);
        setDisplayedStores(allStores);
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
                    placeholder="Enter city or zip code"
                    className="max-w-lg flex-1"
                    aria-label="Location"
                    value={locationInput}
                    onChange={(e) => setLocationInput(e.target.value)}
                  />
                  <Button onClick={handleFindStores} variant="default" className="bg-accent hover:bg-accent/90 text-accent-foreground">
                    <MapPin className="mr-2 h-4 w-4" />
                    Find Stores
                  </Button>
                </div>
                <p className="text-xs text-foreground/60">
                  Enter your location to find the best stores near you.
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
              <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl font-headline">
                {userLocation ? 'Stores Near You' : 'Featured Local Stores'}
              </h2>
              <p className="max-w-[900px] text-foreground/80 md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                {locationError ? locationError : 'Explore top-rated local stores right in your neighborhood.'}
              </p>
            </div>
          </div>
          <div className="mx-auto grid grid-cols-1 gap-6 py-12 sm:grid-cols-2 lg:grid-cols-3">
            {loading ? (
              <p>Loading stores...</p>
            ) : (
              displayedStores.map((store) => (
                <StoreCard key={store.id} store={store} userLocation={userLocation} />
              ))
            )}
            {!loading && displayedStores.length === 0 && <p>No stores found.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}
