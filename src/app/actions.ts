'use server';

import {
  getProductRecommendations,
  ProductRecommendationsInput,
} from '@/ai/flows/product-recommendations';
import { getProductsByIds } from '@/lib/data';
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

export async function revalidateStorePaths() {
    revalidatePath('/');
    revalidatePath('/stores');
    revalidatePath('/dashboard/my-store');
}

export async function revalidateProductPaths(storeId: string) {
  revalidatePath(`/stores/${storeId}`);
  revalidatePath(`/dashboard/my-store`);
}

export async function getProductsByIdsAction(productRefs: {productId: string, storeId: string}[]) {
  try {
    // This is a placeholder. You'll need to implement the Firestore logic in `getProductsByIds`
    const products = await getProductsByIds(productRefs);
    return products;
  } catch (error) {
    console.error('Error fetching products by IDs:', error);
    return [];
  }
}
