'use client';

import { useCart } from '@/lib/cart';
import { Button } from '@/components/ui/button';
import { SheetHeader, SheetTitle, SheetFooter, SheetClose, SheetDescription } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Trash2 } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { getProductImage } from '@/lib/data';
import { Input } from '../ui/input';
import { useEffect, useState } from 'react';

// A component to render each item, handling the async image fetching
function CartSheetItem({ item }) {
    const { removeItem, updateQuantity } = useCart();
    const { product, quantity } = item;
    const [image, setImage] = useState({ imageUrl: 'https://placehold.co/64x64/E2E8F0/64748B?text=...', imageHint: 'loading' });

    useEffect(() => {
        const fetchImage = async () => {
            const fetchedImage = await getProductImage(product.imageId);
            setImage(fetchedImage);
        };
        fetchImage();
    }, [product.imageId]);

    return (
        <div className="flex items-center gap-4 w-full">
            <Image
                src={image.imageUrl}
                alt={product.name}
                data-ai-hint={image.imageHint}
                width={64}
                height={64}
                className="rounded-md object-cover"
            />
            <div className="flex-1 grid gap-1.5">
                <p className="font-medium leading-tight">{product.name}</p>
                <div className="flex items-center gap-2">
                    <Input
                        type="number"
                        min="1"
                        value={quantity}
                        onChange={(e) => updateQuantity(product.id, parseInt(e.target.value) || 1)}
                        className="w-16 h-8 text-center"
                        aria-label={`Quantity for ${product.name}`}
                    />
                    <p className="text-sm font-semibold">${(product.price * quantity).toFixed(2)}</p>
                </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => removeItem(product.id)}>
                <Trash2 className="h-4 w-4" />
                <span className="sr-only">Remove {product.name}</span>
            </Button>
        </div>
    );
}

export function CartSheetContent() {
  const { cartItems, cartTotal, cartCount } = useCart();

  return (
    <>
      <SheetHeader>
        <SheetTitle>Shopping Cart ({cartCount})</SheetTitle>
        <SheetDescription className="sr-only">
          A summary of the items in your shopping cart. You can view, update quantities, or remove items.
        </SheetDescription>
      </SheetHeader>
      
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {cartItems.length > 0 ? (
        <ScrollArea className="flex-1 pr-1">
            <div className="flex flex-col gap-4 py-4">
              {cartItems.map((item) => (
                <CartSheetItem key={item.product.id} item={item} />
              ))}
            </div>
        </ScrollArea>
        ) : (
          <div className="flex flex-1 h-full items-center justify-center">
            <p>Your cart is empty.</p>
          </div>
        )}
        {cartItems.length > 0 && (
          <SheetFooter className="mt-auto pt-4">
            <div className="w-full space-y-4">
              <Separator />
              <div className="flex justify-between font-bold text-lg">
                <span>Total</span>
                <span>${cartTotal.toFixed(2)}</span>
              </div>
              <SheetClose asChild>
                  <Button asChild className="w-full bg-accent hover:bg-accent/90 text-accent-foreground">
                      <Link href="/cart">Proceed to Checkout</Link>
                  </Button>
              </SheetClose>
            </div>
          </SheetFooter>
        )}
      </div>
    </>
  );
}
