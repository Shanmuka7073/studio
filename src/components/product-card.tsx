
'use client'

import Image from 'next/image';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useCart } from '@/lib/cart';
import type { Product, ProductVariant } from '@/lib/types';
import { ShoppingCart } from 'lucide-react';
import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

interface ProductCardProps {
  product: Product;
  image: {
    imageUrl: string;
    imageHint: string;
  }
}

export default function ProductCard({ product, image }: ProductCardProps) {
  const { addItem } = useCart();
  const { toast } = useToast();
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(product.variants.length > 0 ? product.variants[0] : null);

  // Use the AI-generated data URI if available, otherwise use the placeholder
  const displayImageUrl = product.imageUrl ? product.imageUrl : image.imageUrl;
  
  const handleAddToCart = () => {
    if (selectedVariant) {
      addItem(product, selectedVariant);
    } else {
      toast({
        variant: 'destructive',
        title: 'Please select a variant',
        description: 'You must choose a weight or size before adding to the cart.',
      });
    }
  };
  
  const handleVariantChange = (sku: string) => {
    const variant = product.variants.find(v => v.sku === sku);
    if (variant) {
      setSelectedVariant(variant);
    }
  };

  return (
    <Card className="flex flex-col h-full overflow-hidden transition-all hover:shadow-lg">
      <CardHeader className="p-0">
        <Image
          src={displayImageUrl}
          alt={product.name}
          data-ai-hint={image.imageHint}
          width={300}
          height={300}
          className="w-full h-36 object-cover"
        />
      </CardHeader>
      <CardContent className="p-2 pb-1 flex-1 text-center">
        <CardTitle className="text-sm font-headline truncate">{product.name}</CardTitle>
        <p className="text-lg font-bold text-primary">₹{selectedVariant?.price.toFixed(2)}</p>
      </CardContent>
      <CardFooter className="p-2 pt-0 flex-col items-stretch gap-2">
         {product.variants.length > 1 ? (
             <Select onValueChange={handleVariantChange} defaultValue={selectedVariant?.sku}>
                <SelectTrigger className="text-xs h-9">
                    <SelectValue placeholder="Select weight" />
                </SelectTrigger>
                <SelectContent>
                    {product.variants.map(variant => (
                        <SelectItem key={variant.sku} value={variant.sku}>
                            {variant.weight} - ₹{variant.price.toFixed(2)}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
         ) : (
            <div className="h-9 flex items-center justify-center">
                <p className="text-sm text-muted-foreground">{selectedVariant?.weight}</p>
            </div>
         )}
        <Button
          onClick={handleAddToCart}
          className="w-full bg-accent hover:bg-accent/90 text-accent-foreground text-xs h-9"
          disabled={!selectedVariant}
        >
          <ShoppingCart className="mr-1 h-3.5 w-3.5" />
          Add to Cart
        </Button>
      </CardFooter>
    </Card>
  );
}
    