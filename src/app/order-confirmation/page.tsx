'use client'
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { CheckCircle } from 'lucide-react';
import ProductSuggestions from '@/components/product-suggestions';

export default function OrderConfirmationPage() {
  // In a real app, you'd fetch order details using an ID from the URL.
  // For now, we'll just show a generic success message.
  
  // Mock past purchases for AI suggestions. In a real app, this would be fetched from user data.
  const pastPurchases = [
    { productId: '1', storeId: 'store-1' },
    { productId: '6', storeId: 'store-2' },
  ]; 

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
              <Link href="/dashboard/my-orders">View Orders</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
      
      <div className="max-w-4xl mx-auto mt-16">
        <ProductSuggestions
          pastPurchases={pastPurchases}
          optimalDisplayTime="After Checkout"
        />
      </div>
    </div>
  );
}
