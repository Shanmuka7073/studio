'use client'
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { CheckCircle } from 'lucide-react';
import ProductSuggestions from '@/components/product-suggestions';
import { useFirebase } from '@/firebase';
import { getProduct } from '@/lib/data';
import { Product } from '@/lib/types';

export default function OrderConfirmationPage() {
  const { firestore } = useFirebase();
  // In a real app, you'd fetch order details using an ID from the URL.
  // For now, we'll just show a generic success message.
  const pastPurchases = ['1', '6']; // Mock past purchases for AI suggestions

  const resolveProduct = async (productId: string): Promise<Product | undefined> => {
    if (!firestore) return undefined;
    // This logic is now broken because we need a storeId to get a product.
    // For now, product suggestions on this page will not work.
    // A more robust implementation would store storeId along with productId in purchase history.
    console.warn("Resolving product by ID without storeId, this may be inefficient or incorrect.");
    return undefined;
  };

  return (
    <div className="container mx-auto py-12 px-4 md:px-6">
      <Card className="max-w-2xl mx-auto">
        <CardHeader className="text-center">
          <div className="mx-auto bg-primary/20 p-3 rounded-full w-fit mb-4">
            <CheckCircle className="h-12 w-12 text-primary" />
          </div>
          <CardTitle className="text-3xl font-headline">Thank You For Your Order!</CardTitle>
          <p className="text-muted-foreground">Your order has been placed successfully.</p>
        </CardHeader>
        <CardContent className="text-center space-y-6">
          <p>
            You will receive an email confirmation shortly with your order details.
            You can view your order status in the dashboard.
          </p>
          <div className="flex gap-4 justify-center">
            <Button asChild>
              <Link href="/stores">Continue Shopping</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard/orders">View Orders</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
      
      <div className="max-w-4xl mx-auto mt-16">
        <ProductSuggestions
          pastPurchases={pastPurchases}
          optimalDisplayTime="After Checkout"
          resolveProduct={resolveProduct}
        />
      </div>
    </div>
  );
}

    