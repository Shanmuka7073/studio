
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { Store } from '@/lib/types';
import { getStoreImage } from '@/lib/data';
import { ArrowRight, MapPin } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useFirebase } from '@/firebase';

interface StoreCardProps {
  store: Store;
}

export default function StoreCard({ store }: StoreCardProps) {
    const { firestore } = useFirebase();
    const [image, setImage] = useState({ imageUrl: 'https://placehold.co/400x300/E2E8F0/64748B?text=Loading...', imageHint: 'loading' });

    useEffect(() => {
        const fetchImage = async () => {
            const fetchedImage = await getStoreImage(store);
            setImage(fetchedImage);
        }
        fetchImage();
    }, [store]);

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
      </CardHeader>
      <CardContent className="p-4 space-y-2 flex-1 flex flex-col">
        <CardTitle className="text-xl font-headline">{store.name}</CardTitle>
        <CardDescription className="flex-1">{store.description}</CardDescription>
        <p className="text-sm text-muted-foreground">{store.address}</p>
        {store.distance && (
          <div className="flex items-center text-sm text-muted-foreground font-medium">
            <MapPin className="mr-2 h-4 w-4 text-primary" />
            <span>{store.distance.toFixed(2)} km away</span>
          </div>
        )}
        <Button asChild variant="outline" className="w-full mt-auto">
          <Link href={`/stores/${store.id}`}>
            Visit Store <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
