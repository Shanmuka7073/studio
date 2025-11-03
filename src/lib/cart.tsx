

'use client';

import { createContext, useContext, useState, ReactNode, useCallback, useEffect } from 'react';
import type { CartItem, Product, ProductVariant } from './types';
import { useToast } from '@/hooks/use-toast';

interface CartContextType {
  cartItems: CartItem[];
  addItem: (product: Product, variant: ProductVariant, quantity?: number) => void;
  removeItem: (variantSku: string) => void;
  updateQuantity: (variantSku: string, quantity: number) => void;
  clearCart: () => void;
  cartCount: number;
  cartTotal: number;
  activeStoreId: string | null;
  setActiveStoreId: (storeId: string | null) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [activeStoreId, setActiveStoreId] = useState<string | null>(null);

  const { toast } = useToast();

  // Load cart from localStorage on initial render
  useEffect(() => {
    try {
      const storedCart = localStorage.getItem('localbasket-cart');
      const storedStoreId = localStorage.getItem('localbasket-active-store');
      if (storedCart) {
        const parsedCart = JSON.parse(storedCart);
        setCartItems(parsedCart);
      }
      if (storedStoreId) {
        setActiveStoreId(JSON.parse(storedStoreId));
      }
    } catch (error) {
      console.error("Failed to parse cart from localStorage", error);
    }
  }, []);

  // Save cart and active store to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('localbasket-cart', JSON.stringify(cartItems));
      if (activeStoreId) {
        localStorage.setItem('localbasket-active-store', JSON.stringify(activeStoreId));
      } else {
        localStorage.removeItem('localbasket-active-store');
      }
    } catch (error) {
      console.error("Failed to save cart to localStorage", error);
    }
  }, [cartItems, activeStoreId]);


  const addItem = useCallback((product: Product, variant: ProductVariant, quantity = 1) => {
    setCartItems((prevItems) => {
      const existingItem = prevItems.find((item) => item.variant.sku === variant.sku);
      if (existingItem) {
        return prevItems.map((item) =>
          item.variant.sku === variant.sku
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      // Product no longer needs storeId at this stage, it will be associated at checkout
      return [...prevItems, { product, variant, quantity }];
    });

    toast({
      title: 'Item added to cart',
      description: `${product.name} (${variant.weight}) has been added.`,
    });
  }, [toast]);

  const removeItem = useCallback((variantSku: string) => {
    setCartItems((prevItems) => {
        const newItems = prevItems.filter((item) => item.variant.sku !== variantSku);
        // If the cart becomes empty, also clear the active store
        if (newItems.length === 0) {
            setActiveStoreId(null);
        }
        return newItems;
    });
    toast({
      title: 'Item removed from cart',
      variant: 'destructive'
    });
  }, [toast]);

  const updateQuantity = useCallback((variantSku: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(variantSku);
      return;
    }
    setCartItems((prevItems) =>
      prevItems.map((item) =>
        item.variant.sku === variantSku ? { ...item, quantity } : item
      )
    );
  }, [removeItem]);

  const clearCart = useCallback(() => {
    setCartItems([]);
    setActiveStoreId(null);
  }, []);
  
  const cartCount = cartItems.reduce((count, item) => count + item.quantity, 0);

  const cartTotal = cartItems.reduce(
    (total, item) => total + item.variant.price * item.quantity,
    0
  );

  return (
    <CartContext.Provider
      value={{
        cartItems,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        cartCount,
        cartTotal,
        activeStoreId,
        setActiveStoreId,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
