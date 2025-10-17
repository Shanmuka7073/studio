'use server';

import {
  getProductRecommendations,
  ProductRecommendationsInput,
} from '@/ai/flows/product-recommendations';
import { createStore, createProduct } from '@/lib/data';
import type { Store, Product } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import { initializeFirebase } from '@/firebase';

export async function getRecommendationsAction(
  input: ProductRecommendationsInput
) {
  try {
    const recommendations = await getProductRecommendations(input);
    return recommendations;
  } catch (error) {
    console.error('Error getting AI recommendations:', error);
    return { error: 'Failed to get recommendations.' };
  }
}

export async function createStoreAction(
  storeData: Omit<Store, 'id' | 'imageId'> & { imageId: string }
) {
  try {
    const { firestore } = initializeFirebase();
    const newStore = await createStore(firestore, {
      ...storeData,
    });

    revalidatePath('/');
    revalidatePath('/stores');

    return { success: true, store: newStore };
  } catch (error) {
    console.error('Error creating store:', error);
    return { success: false, error: 'Failed to create store.' };
  }
}

export async function createProductAction(
  productData: Omit<Product, 'id' | 'imageId'> & { imageId: string }
) {
  try {
    const { firestore } = initializeFirebase();
    // In a real app, you'd handle image uploads properly.
    // For now, we'll assign a placeholder imageId.
    const newProduct = await createProduct(firestore, {
      ...productData,
    });

    // Revalidate the path for the specific store
    revalidatePath(`/stores/${productData.storeId}`);
    revalidatePath(`/dashboard/my-store`);

    return { success: true, product: newProduct };
  } catch (error) {
    console.error('Error creating product:', error);
    return { success: false, error: 'Failed to create product.' };
  }
}
