
'use client'

import Image from 'next/image';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useCart } from '@/lib/cart';
import type { Product } from '@/lib/types';
import { ShoppingCart } from 'lucide-react';

interface ProductCardProps {
  product: Product;
  image: {
    imageUrl: string;
    imageHint: string;
  }
}

export default function ProductCard({ product, image }: ProductCardProps) {
  const { addItem } = useCart();

  return (
    <Card className="flex flex-col h-full overflow-hidden transition-all hover:shadow-lg">
      <CardHeader className="p-0">
        <Image
          src={image.imageUrl}
          alt={product.name}
          data-ai-hint={image.imageHint}
          width={300}
          height={300}
          className="w-full h-36 object-cover"
        />
      </CardHeader>
      <CardContent className="p-2 pb-1 flex-1 text-center">
        <CardTitle className="text-sm font-headline truncate">{product.name}</CardTitle>
        {product.localName && <p className="text-xs text-muted-foreground">({product.localName})</p>}
        <p className="text-lg font-bold text-primary">₹{product.price.toFixed(2)}</p>
      </CardContent>
      <CardFooter className="p-2 pt-0">
        <Button
          onClick={() => addItem(product)}
          className="w-full bg-accent hover:bg-accent/90 text-accent-foreground text-xs h-9"
        >
          <ShoppingCart className="mr-1 h-3.5 w-3.5" />
          Add to Cart
        </Button>
      </CardFooter>
    </Card>
  );
}
