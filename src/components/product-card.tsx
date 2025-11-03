
'use client'

import Image from 'next/image';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useCart } from '@/lib/cart';
import type { Product, ProductPrice, ProductVariant } from '@/lib/types';
import { ShoppingCart } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from './ui/skeleton';
import { useAppStore } from '@/lib/store';
import { t } from '@/lib/locales';

interface ProductCardProps {
  product: Product;
  image: {
    imageUrl: string;
    imageHint: string;
  };
  priceData?: ProductPrice | null; // Price data is now passed as a prop
}

export default function ProductCard({ product, image, priceData }: ProductCardProps) {
  const { addItem } = useCart();
  const { toast } = useToast();
  const getProductName = useAppStore(state => state.getProductName);
  
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  
  // Memoize price variants to avoid re-computation
  const priceVariants = useMemo(() => priceData?.variants || [], [priceData]);
  const isLoadingPrice = priceData === undefined;

  useEffect(() => {
    // Set the default selected variant once price variants are available
    if (priceVariants.length > 0) {
      setSelectedVariant(priceVariants[0]);
    } else {
      setSelectedVariant(null);
    }
  }, [priceVariants]);
  
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
        <CardTitle className="text-sm font-headline truncate">{getProductName(product)}</CardTitle>
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
                    <SelectValue placeholder={t('select-weight')} />
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
                <p className="text-xs text-destructive">{t('no-prices-set')}</p>
            </div>
         )}
        <Button
          onClick={handleAddToCart}
          className="w-full bg-accent hover:bg-accent/90 text-accent-foreground text-xs h-9"
          disabled={!selectedVariant || isLoadingPrice}
        >
          <ShoppingCart className="mr-1 h-3.5 w-3.5" />
          {t('add-to-cart')}
        </Button>
      </CardFooter>
    </Card>
  );
}
