
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
  mismatchedStoreInfo: { product: Product; variant: ProductVariant } | null;
  confirmClearCart: () => void;
  cancelClearCart: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [activeStoreId, setActiveStoreId] = useState<string | null>(null);
  const [mismatchedStoreInfo, setMismatchedStoreInfo] = useState<{ product: Product; variant: ProductVariant } | null>(null);

  const { toast } = useToast();

  // Load cart from localStorage on initial render
  useEffect(() => {
    try {
      const storedCart = localStorage.getItem('localbasket-cart');
      const storedStoreId = localStorage.getItem('localbasket-active-store');
      if (storedCart) {
        const parsedCart = JSON.parse(storedCart);
        setCartItems(parsedCart);
        if (parsedCart.length > 0) {
            setActiveStoreId(parsedCart[0].product.storeId);
        } else if (storedStoreId) {
            setActiveStoreId(JSON.parse(storedStoreId));
        }
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
    // If the cart is empty, set the active store ID
    if (cartItems.length === 0) {
        setActiveStoreId(product.storeId);
    } 
    // If the item's store is different from the active store, show confirmation
    else if (activeStoreId && product.storeId !== activeStoreId) {
        setMismatchedStoreInfo({ product, variant });
        return;
    }
    
    setCartItems((prevItems) => {
      const existingItem = prevItems.find((item) => item.variant.sku === variant.sku);
      if (existingItem) {
        return prevItems.map((item) =>
          item.variant.sku === variant.sku
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [...prevItems, { product, variant, quantity }];
    });

    toast({
      title: 'Item added to cart',
      description: `${product.name} (${variant.weight}) has been added.`,
    });
  }, [cartItems, activeStoreId, toast]);

  const removeItem = useCallback((variantSku: string) => {
    setCartItems((prevItems) => {
        const newItems = prevItems.filter((item) => item.variant.sku !== variantSku);
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
  
  const confirmClearCart = useCallback(() => {
    if (mismatchedStoreInfo) {
      clearCart();
      const { product, variant } = mismatchedStoreInfo;
      // Use a timeout to ensure state updates before adding the new item
      setTimeout(() => {
        addItem(product, variant, 1);
        setMismatchedStoreInfo(null);
        toast({
          title: "New Cart Started",
          description: `Your previous cart was cleared. Started a new cart with items from ${product.name}.`
        })
      }, 0);
    }
  }, [mismatchedStoreInfo, clearCart, addItem, toast]);

  const cancelClearCart = useCallback(() => {
    setMismatchedStoreInfo(null);
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
        mismatchedStoreInfo,
        confirmClearCart,
        cancelClearCart,
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
