
'use client'

import Image from 'next/image';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useCart } from '@/lib/cart';
import type { Product, ProductVariant } from '@/lib/types';
import { ShoppingCart } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useFirebase } from '@/firebase';
import { getProductPrice } from '@/lib/data';
import { Skeleton } from './ui/skeleton';

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
  const { firestore } = useFirebase();

  const [priceVariants, setPriceVariants] = useState<ProductVariant[]>([]);
  const [isLoadingPrice, setIsLoadingPrice] = useState(true);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);

  useEffect(() => {
    const fetchPrice = async () => {
      if (!firestore || !product.name) return;
      setIsLoadingPrice(true);
      const priceData = await getProductPrice(firestore, product.name);
      if (priceData && priceData.variants.length > 0) {
        setPriceVariants(priceData.variants);
        setSelectedVariant(priceData.variants[0]);
      } else {
        setPriceVariants([]);
        setSelectedVariant(null);
      }
      setIsLoadingPrice(false);
    };

    fetchPrice();
  }, [firestore, product.name]);
  
  // Use the AI-generated data URI if available, otherwise use the placeholder
  const displayImageUrl = product.imageUrl ? product.imageUrl : image.imageUrl;
  
  const handleAddToCart = () => {
    if (selectedVariant) {
      // Pass the product with the dynamically fetched variants to the cart
      const productWithPrice = { ...product, variants: priceVariants };
      addItem(productWithPrice, selectedVariant);
    } else {
      toast({
        variant: 'destructive',
        title: 'Please select a variant',
        description: 'You must choose a weight or size before adding to the cart.',
      });
    }
  };
  
  const handleVariantChange = (sku: string) => {
    const variant = priceVariants.find(v => v.sku === sku);
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
        {isLoadingPrice ? (
            <Skeleton className="h-6 w-20 mx-auto mt-1" />
        ) : (
            <p className="text-lg font-bold text-primary">₹{selectedVariant?.price.toFixed(2) ?? 'N/A'}</p>
        )}
      </CardContent>
      <CardFooter className="p-2 pt-0 flex-col items-stretch gap-2">
         {isLoadingPrice ? (
            <Skeleton className="h-9 w-full" />
         ) : priceVariants.length > 1 ? (
             <Select onValueChange={handleVariantChange} defaultValue={selectedVariant?.sku}>
                <SelectTrigger className="text-xs h-9">
                    <SelectValue placeholder="Select weight" />
                </SelectTrigger>
                <SelectContent>
                    {priceVariants.map(variant => (
                        <SelectItem key={variant.sku} value={variant.sku}>
                            {variant.weight} - ₹{variant.price.toFixed(2)}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
         ) : priceVariants.length === 1 ? (
            <div className="h-9 flex items-center justify-center">
                <p className="text-sm text-muted-foreground">{selectedVariant?.weight}</p>
            </div>
         ) : (
            <div className="h-9 flex items-center justify-center">
                <p className="text-xs text-destructive">No prices set</p>
            </div>
         )}
        <Button
          onClick={handleAddToCart}
          className="w-full bg-accent hover:bg-accent/90 text-accent-foreground text-xs h-9"
          disabled={!selectedVariant || isLoadingPrice}
        >
          <ShoppingCart className="mr-1 h-3.5 w-3.5" />
          Add to Cart
        </Button>
      </CardFooter>
    </Card>
  );
}
    