
'use client';

import { create } from 'zustand';
import { Firestore } from 'firebase/firestore';
import { Store, Product, ProductPrice } from './types';
import { getStores, getMasterProducts, getProductPrice } from './data';
import { useFirebase } from '@/firebase';
import { useEffect } from 'react';


export interface AppState {
  stores: Store[];
  masterProducts: Product[];
  productPrices: Record<string, ProductPrice | null>;
  loading: boolean;
  error: Error | null;
  fetchInitialData: (db: Firestore) => Promise<void>;
  fetchProductPrices: (db: Firestore, productNames: string[]) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  stores: [],
  masterProducts: [],
  productPrices: {},
  loading: true,
  error: null,

  fetchInitialData: async (db: Firestore) => {
    // Prevent re-fetching if data is already present
    if (get().stores.length > 0 && get().masterProducts.length > 0) {
      set({ loading: false });
      return;
    }

    set({ loading: true, error: null });
    try {
      const [stores, masterProducts] = await Promise.all([
        getStores(db),
        getMasterProducts(db),
      ]);

      set({
        stores,
        masterProducts,
        loading: false,
      });
    } catch (error) {
      console.error("Failed to fetch initial app data:", error);
      set({ error: error as Error, loading: false });
    }
  },
  
  fetchProductPrices: async (db: Firestore, productNames: string[]) => {
      const existingPrices = get().productPrices;
      const namesToFetch = productNames.filter(name => existingPrices[name.toLowerCase()] === undefined);

      if (namesToFetch.length === 0) {
          return;
      }
      
      try {
          const pricePromises = namesToFetch.map(name => getProductPrice(db, name));
          const results = await Promise.all(pricePromises);

          const newPrices = namesToFetch.reduce((acc, name, index) => {
              acc[name.toLowerCase()] = results[index];
              return acc;
          }, {} as Record<string, ProductPrice | null>);

          set(state => ({
              productPrices: { ...state.productPrices, ...newPrices }
          }));

      } catch (error) {
          console.error("Failed to fetch product prices:", error);
          // Optionally handle price-specific errors
      }
  }
}));

// Custom hook to initialize the store's data on app load
export const useInitializeApp = () => {
    const { firestore } = useFirebase();
    const fetchInitialData = useAppStore((state) => state.fetchInitialData);
    const loading = useAppStore((state) => state.loading);

    useEffect(() => {
        if (firestore) {
            fetchInitialData(firestore);
        }
    }, [firestore, fetchInitialData]);

    return loading;
};
