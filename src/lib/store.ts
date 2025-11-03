
'use client';

import { create } from 'zustand';
import { Firestore } from 'firebase/firestore';
import { Store, Product, ProductPrice } from './types';
import { getStores, getMasterProducts, getProductPrice } from './data';
import { useFirebase } from '@/firebase';
import { useEffect } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { ProfileFormValues } from '@/app/dashboard/customer/my-profile/page';
import { t as translate } from '@/lib/locales';


export interface AppState {
  stores: Store[];
  masterProducts: Product[];
  productPrices: Record<string, ProductPrice | null>;
  loading: boolean;
  error: Error | null;
  language: string; // e.g., 'en-IN', 'te-IN'
  fetchInitialData: (db: Firestore) => Promise<void>;
  fetchProductPrices: (db: Firestore, productNames: string[]) => Promise<void>;
  setLanguage: (language: string) => void;
  getProductName: (product: Product) => string;
}

export const useAppStore = create<AppState>((set, get) => ({
  stores: [],
  masterProducts: [],
  productPrices: {},
  loading: true,
  error: null,
  language: 'en-IN', // Default language

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
  },

  setLanguage: (language: string) => {
    localStorage.setItem('language', language);
    set({ language });
  },

  getProductName: (product: Product) => {
    if (!product) return '';
    const lang = get().language;
    return translate(product.name.toLowerCase().replace(/ /g, '-'), lang);
  },
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

// --- Store for Profile Page Form ---
interface ProfileFormState {
  form: UseFormReturn<ProfileFormValues> | null;
  setForm: (form: UseFormReturn<ProfileFormValues> | null) => void;
}

export const useProfileFormStore = create<ProfileFormState>((set) => ({
  form: null,
  setForm: (form) => set({ form }),
}));
