'use client';

import { useState, useEffect } from 'react';
import { getProduct } from '@/lib/data';
import type { Product } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import ProductCard from './product-card';
import { getRecommendationsAction } from '@/app/actions';
import { Skeleton } from './ui/skeleton';

interface ProductSuggestionsProps {
  pastPurchases?: string[];
  currentCartItems?: string[];
  optimalDisplayTime: 'Before Checkout' | 'During Checkout' | 'After Checkout';
}

export default function ProductSuggestions({
  pastPurchases = [],
  currentCartItems = [],
  optimalDisplayTime,
}: ProductSuggestionsProps) {
  const [recommendedProducts, setRecommendedProducts] = useState<Product[]>([]);
  const [reason, setReason] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRecommendations() {
      setLoading(true);
      setError(null);
      const result = await getRecommendationsAction({
        pastPurchases,
        currentCartItems,
        optimalDisplayTime,
      });

      if ('error' in result) {
        setError(result.error as string);
      } else if (result?.recommendedProducts) {
        const products = result.recommendedProducts
          .map((id) => getProduct(id))
          .filter((p): p is Product => p !== undefined);
        setRecommendedProducts(products);
        setReason(result.reason || '');
      }
      setLoading(false);
    }

    fetchRecommendations();
  }, [pastPurchases, currentCartItems, optimalDisplayTime]);
  
  const title = optimalDisplayTime === 'After Checkout' 
    ? "Since you bought..."
    : "You might also like";

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <Skeleton className="h-4 w-3/4" />
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Skeleton className="h-64 w-1/3" />
            <Skeleton className="h-64 w-1/3" />
            <Skeleton className="h-64 w-1/3" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || recommendedProducts.length === 0) {
    return null; // Don't show the component if there's an error or no recommendations
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{reason}</p>
      </CardHeader>
      <CardContent>
        <Carousel opts={{ align: 'start', loop: true }} className="w-full">
          <CarouselContent>
            {recommendedProducts.map((product) => (
              <CarouselItem key={product.id} className="md:basis-1/2 lg:basis-1/3">
                <div className="p-1">
                  <ProductCard product={product} />
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>
      </CardContent>
    </Card>
  );
}
