
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { Store } from '@/lib/types';
import { getStoreImage } from '@/lib/data';
import { ArrowRight, MapPin } from 'lucide-react';

interface StoreCardProps {
  store: Store;
  userLocation?: { latitude: number; longitude: number } | null;
}

export default function StoreCard({ store, userLocation }: StoreCardProps) {
  const image = getStoreImage(store.imageId);

  const handleDistanceClick = () => {
    if (userLocation) {
      const { latitude: userLat, longitude: userLng } = userLocation;
      const { latitude: storeLat, longitude: storeLng } = store;
      const url = `https://www.google.com/maps/dir/?api=1&origin=${userLat},${userLng}&destination=${storeLat},${storeLng}`;
      window.open(url, '_blank');
    }
  };

  return (
    <Card className="flex flex-col h-full overflow-hidden transition-all hover:shadow-lg">
      <CardHeader className="p-0 relative">
        <Link href={`/stores/${store.id}`}>
          <Image
            src={image.imageUrl}
            alt={store.name}
            data-ai-hint={image.imageHint}
            width={400}
            height={300}
            className="w-full h-48 object-cover"
          />
        </Link>
        {store.distance !== undefined && (
          <button
            onClick={handleDistanceClick}
            className="absolute top-2 right-2 flex items-center bg-background/80 backdrop-blur-sm text-foreground font-semibold py-1 px-2 rounded-full text-xs hover:bg-background transition-colors"
          >
            <MapPin className="mr-1 h-3 w-3 text-primary" />
            {store.distance.toFixed(1)} km away
          </button>
        )}
      </CardHeader>
      <CardContent className="p-4 space-y-2 flex-1 flex flex-col">
        <CardTitle className="text-xl font-headline">{store.name}</CardTitle>
        <CardDescription className="flex-1">{store.description}</CardDescription>
        <Button asChild variant="outline" className="w-full mt-auto">
          <Link href={`/stores/${store.id}`}>
            Visit Store <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
