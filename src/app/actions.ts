'use server';

import {
  getProductRecommendations,
  ProductRecommendationsInput,
} from '@/ai/flows/product-recommendations';
import { createStore } from '@/lib/data';
import type { Store } from '@/lib/types';
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
  storeData: Omit<Store, 'id' | 'imageId'>
) {
  try {
    // In a real app, you'd handle image uploads properly.
    // For now, we'll assign a placeholder imageId.
    const newStore = createStore({
      ...storeData,
      imageId: `store-${Math.floor(Math.random() * 1000)}`, // Temporary random image
    });

    // Revalidate the paths that show the list of stores
    revalidatePath('/');
    revalidatePath('/stores');

    return { success: true, store: newStore };
  } catch (error) {
    console.error('Error creating store:', error);
    return { success: false, error: 'Failed to create store.' };
  }
}
