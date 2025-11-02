
'use client';

import { create } from 'zustand';
import { Firestore } from 'firebase/firestore';
import { Store, Product, ProductPrice } from './types';
import { getStores, getMasterProducts, getAllProductPrices } from './data';

export interface AppState {
  stores: Store[];
  masterProducts: Product[];
  productPrices: Record<string, ProductPrice>;
  loading: boolean;
  error: Error | null;
  fetchInitialData: (db: Firestore) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  stores: [],
  masterProducts: [],
  productPrices: {},
  loading: true,
  error: null,

  fetchInitialData: async (db: Firestore) => {
    // Only fetch if data is not already loaded to prevent redundant calls
    if (get().stores.length > 0 && get().masterProducts.length > 0) {
      set({ loading: false });
      return;
    }

    set({ loading: true, error: null });
    try {
      // Fetch all critical data in parallel for speed
      const [stores, masterProducts, productPrices] = await Promise.all([
        getStores(db),
        getMasterProducts(db),
        getAllProductPrices(db),
      ]);

      set({
        stores,
        masterProducts,
        productPrices,
        loading: false,
      });
    } catch (error) {
      console.error("Failed to fetch initial app data:", error);
      set({ error: error as Error, loading: false });
    }
  },
}));

// Custom hook to initialize the store's data on app load
export const useInitializeApp = () => {
    const { firestore } = useFirebase(); // Assuming you have a useFirebase hook
    const fetchInitialData = useAppStore((state) => state.fetchInitialData);
    const loading = useAppStore((state) => state.loading);

    useEffect(() => {
        if (firestore) {
            fetchInitialData(firestore);
        }
    }, [firestore, fetchInitialData]);

    return loading;
};
