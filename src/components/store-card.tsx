
import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { Store } from '@/lib/types';
import { getStoreImage } from '@/lib/data';
import { ArrowRight } from 'lucide-react';

interface StoreCardProps {
  store: Store;
}

export default function StoreCard({ store }: StoreCardProps) {
  const image = getStoreImage(store.imageId);
  return (
    <Card className="overflow-hidden transition-all hover:shadow-lg">
      <CardHeader className="p-0">
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
      <CardContent className="p-4 space-y-2">
        <CardTitle className="text-xl font-headline">{store.name}</CardTitle>
        <CardDescription>{store.description}</CardDescription>
        <Button asChild variant="outline" className="w-full">
          <Link href={`/stores/${store.id}`}>
            Visit Store <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
