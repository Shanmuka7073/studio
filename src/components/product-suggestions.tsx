'use client';

import { useState, useEffect, useMemo } from 'react';
import type { Product } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import ProductCard from './product-card';
import { getRecommendationsAction, getProductsByIdsAction } from '@/app/actions';
import { Skeleton } from './ui/skeleton';

interface ProductSuggestionsProps {
  pastPurchases?: { productId: string; storeId: string }[];
  currentCartItems?: { productId: string; storeId: string }[];
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

  // Memoize input objects to prevent re-fetching on every render
  const memoizedPastPurchases = useMemo(() => pastPurchases, [JSON.stringify(pastPurchases)]);
  const memoizedCurrentCartItems = useMemo(() => currentCartItems, [JSON.stringify(currentCartItems)]);

  useEffect(() => {
    async function fetchRecommendations() {
      setLoading(true);
      setError(null);
      
      const recommendationResult = await getRecommendationsAction({
        pastPurchases: memoizedPastPurchases,
        currentCartItems: memoizedCurrentCartItems,
        optimalDisplayTime,
      });

      if ('error' in recommendationResult) {
        setError(recommendationResult.error as string);
        setLoading(false);
        return;
      } 
      
      if (recommendationResult?.recommendedProducts && recommendationResult.recommendedProducts.length > 0) {
        const productRefs = recommendationResult.recommendedProducts;
        const products = await getProductsByIdsAction(productRefs);
        
        setRecommendedProducts(products);
        setReason(recommendationResult.reason || '');
      }
      
      setLoading(false);
    }

    fetchRecommendations();
  }, [memoizedPastPurchases, memoizedCurrentCartItems, optimalDisplayTime]);
  
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
        <Carousel opts={{ align: 'start', loop: recommendedProducts.length > 3 }} className="w-full">
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
