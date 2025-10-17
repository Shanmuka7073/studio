'use client';

import { useCart } from '@/lib/cart';
import { Button } from '@/components/ui/button';
import { SheetHeader, SheetTitle, SheetFooter, SheetClose } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Trash2 } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { getProductImage } from '@/lib/data';

export function CartSheetContent() {
  const { cartItems, removeItem, updateQuantity, cartTotal, cartCount } = useCart();

  return (
    <>
      <SheetHeader>
        <SheetTitle>Shopping Cart ({cartCount})</SheetTitle>
      </SheetHeader>
      <ScrollArea className="h-[calc(100vh-150px)] pr-4">
        {cartItems.length > 0 ? (
          <div className="flex flex-col gap-4 py-4">
            {cartItems.map(({ product, quantity }) => {
                const image = getProductImage(product.imageId);
                return(
              <div key={product.id} className="flex items-center gap-4">
                <Image
                  src={image.imageUrl}
                  alt={product.name}
                  data-ai-hint={image.imageHint}
                  width={64}
                  height={64}
                  className="rounded-md object-cover"
                />
                <div className="flex-1">
                  <p className="font-medium">{product.name}</p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Qty: {quantity}</span>
                    <input
                      type="number"
                      min="1"
                      value={quantity}
                      onChange={(e) => updateQuantity(product.id, parseInt(e.target.value))}
                      className="w-14 rounded-md border border-input px-2 py-1"
                    />
                  </div>
                  <p className="text-sm font-semibold">${(product.price * quantity).toFixed(2)}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => removeItem(product.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )})}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p>Your cart is empty.</p>
          </div>
        )}
      </ScrollArea>
      {cartItems.length > 0 && (
        <SheetFooter>
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
    </>
  );
}
