'use client';

import { useCart } from '@/lib/cart';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trash2 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { getProductImage } from '@/lib/data';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ProductSuggestions from '@/components/product-suggestions';
import { useFirebase } from '@/firebase';
import { getProduct } from '@/lib/data';
import { Product } from '@/lib/types';

export default function CartPage() {
  const { cartItems, removeItem, updateQuantity, cartTotal, cartCount } = useCart();
  const cartProductIds = cartItems.map(item => item.product.id);
  const {firestore} = useFirebase();

  if (cartCount === 0) {
    return (
      <div className="container mx-auto py-24 text-center">
        <h1 className="text-4xl font-bold mb-4 font-headline">Your Cart is Empty</h1>
        <p className="text-muted-foreground mb-8">Looks like you haven't added anything to your cart yet.</p>
        <Button asChild>
          <Link href="/stores">Start Shopping</Link>
        </Button>
      </div>
    );
  }

  const resolveProduct = async (productId: string) => {
    if (!firestore) return undefined;
    // This logic might need adjustment depending on how products are resolved globally
    // For now, assuming we can't know the storeId from just the productId
    console.warn("Resolving product by ID without storeId, this may be inefficient or incorrect.");
    // A better approach would be to have product IDs be globally unique or store storeId with cart item.
    // As a placeholder, this won't work correctly with the new subcollection structure.
    // We will need to address this. For now, suggestions might be broken.
    return undefined;
  }

  return (
    <div className="container mx-auto py-12 px-4 md:px-6">
      <h1 className="text-4xl font-bold mb-8 font-headline">Your Shopping Cart</h1>
      <div className="grid md:grid-cols-3 gap-12">
        <div className="md:col-span-2">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead className="text-center">Quantity</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cartItems.map(({ product, quantity }) => {
                    const image = getProductImage(product.imageId);
                    return (
                      <TableRow key={product.id}>
                        <TableCell>
                          <div className="flex items-center gap-4">
                            <Image
                              src={image.imageUrl}
                              alt={product.name}
                              data-ai-hint={image.imageHint}
                              width={64}
                              height={64}
                              className="rounded-md object-cover"
                            />
                            <span className="font-medium">{product.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>${product.price.toFixed(2)}</TableCell>
                        <TableCell>
                           <Input
                              type="number"
                              min="0"
                              value={quantity}
                              onChange={(e) => updateQuantity(product.id, parseInt(e.target.value) || 0)}
                              className="w-20 text-center mx-auto"
                              aria-label={`Quantity for ${product.name}`}
                            />
                        </TableCell>
                        <TableCell className="text-right">${(product.price * quantity).toFixed(2)}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => removeItem(product.id)}>
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Remove {product.name}</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
        <div className="space-y-8">
            <Card>
                <CardHeader>
                    <CardTitle>Order Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex justify-between">
                        <span>Subtotal</span>
                        <span>${cartTotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>Shipping</span>
                        <span>Free</span>
                    </div>
                     <div className="flex justify-between font-bold text-lg">
                        <span>Total</span>
                        <span>${cartTotal.toFixed(2)}</span>
                    </div>
                    <Button asChild className="w-full bg-accent hover:bg-accent/90 text-accent-foreground">
                        <Link href="/checkout">Proceed to Checkout</Link>
                    </Button>
                </CardContent>
            </Card>
            <ProductSuggestions
              currentCartItems={cartProductIds}
              optimalDisplayTime="During Checkout"
              resolveProduct={resolveProduct}
            />
        </div>
      </div>
    </div>
  );
}

    