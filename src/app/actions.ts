'use server';

import {
  getProductRecommendations,
  ProductRecommendationsInput,
} from '@/ai/flows/product-recommendations';
import { createStore, createProduct } from '@/lib/data';
import type { Store, Product } from '@/lib/types';
import { revalidatePath } from 'next/cache';

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
  storeData: Omit<Store, 'imageId'> & { id: string }
) {
  try {
    const newStore = createStore({
      ...storeData,
      imageId: `store-${Math.floor(Math.random() * 1000)}`, // Temporary random image
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
  productData: Omit<Product, 'id' | 'imageId'>
) {
  try {
    // In a real app, you'd handle image uploads properly.
    // For now, we'll assign a placeholder imageId.
    const newProduct = createProduct({
      ...productData,
      imageId: `prod-${Math.floor(Math.random() * 20)}`, // Temporary random image
    });

    // Revalidate the path for the specific store
    revalidatePath(`/stores/${productData.storeId}`);

    return { success: true, product: newProduct };
  } catch (error) {
    console.error('Error creating product:', error);
    return { success: false, error: 'Failed to create product.' };
  }
}
