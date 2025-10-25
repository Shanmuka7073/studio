
'use client';

import { useCart } from '@/lib/cart';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trash2, Mic } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { getProductImage } from '@/lib/data';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useEffect, useState } from 'react';

// A component to render each row, which now receives the image data directly
function CartRow({ item, image }) {
    const { removeItem, updateQuantity } = useCart();
    const { product, quantity } = item;
    
    return (
        <TableRow>
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
            <TableCell>₹{product.price.toFixed(2)}</TableCell>
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
            <TableCell className="text-right">₹{(product.price * quantity).toFixed(2)}</TableCell>
            <TableCell>
                <Button variant="ghost" size="icon" onClick={() => removeItem(product.id)}>
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Remove {product.name}</span>
                </Button>
            </TableCell>
        </TableRow>
    );
}

export default function CartPage() {
  const { cartItems, cartTotal, cartCount } = useCart();
  const [images, setImages] = useState({});

  useEffect(() => {
    const fetchImages = async () => {
        const imagePromises = cartItems.map(item => getProductImage(item.product.imageId));
        const resolvedImages = await Promise.all(imagePromises);
        const imageMap = cartItems.reduce((acc, item, index) => {
            acc[item.product.id] = resolvedImages[index];
            return acc;
        }, {});
        setImages(imageMap);
    };

    if (cartItems.length > 0) {
        fetchImages();
    }
  }, [cartItems]);
  
  if (cartCount === 0) {
    return (
      <div className="container mx-auto py-24 text-center">
        <h1 className="text-4xl font-bold mb-4 font-headline">Your Cart is Empty</h1>
        <p className="text-muted-foreground mb-8">Looks like you haven't added anything to your cart yet.</p>
        <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
          <Button asChild size="lg">
            <Link href="/stores">Browse Items</Link>
          </Button>
          <span className="text-muted-foreground font-medium">OR</span>
           <Button asChild variant="outline" size="lg">
              <Link href="/checkout">
                <Mic className="mr-2 h-5 w-5" />
                Record Your Shopping List
              </Link>
            </Button>
        </div>
      </div>
    );
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
                  {cartItems.map((item) => {
                      const image = images[item.product.id] || { imageUrl: 'https://placehold.co/64x64/E2E8F0/64748B?text=...', imageHint: 'loading' };
                      return <CartRow key={item.product.id} item={item} image={image} />
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
                        <span>₹{cartTotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>Shipping</span>
                        <span>Free</span>
                    </div>
                     <div className="flex justify-between font-bold text-lg">
                        <span>Total</span>
                        <span>₹{cartTotal.toFixed(2)}</span>
                    </div>
                    <Button asChild className="w-full bg-accent hover:bg-accent/90 text-accent-foreground">
                        <Link href="/checkout">Proceed to Checkout</Link>
                    </Button>
                </CardContent>
            </Card>
        </div>
      </div>
    </div>
  );
}
