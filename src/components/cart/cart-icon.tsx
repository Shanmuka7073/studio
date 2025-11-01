
'use client';

import { ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetTrigger, SheetContent } from '@/components/ui/sheet';
import { CartSheetContent } from './cart-sheet';
import { useCart } from '@/lib/cart';
import type * as SheetPrimitive from "@radix-ui/react-dialog"


interface CartIconProps extends React.ComponentProps<typeof SheetPrimitive.Root> {}


export function CartIcon({ open, onOpenChange }: CartIconProps) {
  const { cartCount } = useCart();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="relative">
          <ShoppingCart className="h-5 w-5" />
          {cartCount > 0 && (
            <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
              {cartCount}
            </span>
          )}
          <span className="sr-only">Open cart</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[400px] sm:w-[540px]">
        <CartSheetContent />
      </SheetContent>
    </Sheet>
  );
}
