'use server';

import {
  getProductRecommendations,
  ProductRecommendationsInput,
} from '@/ai/flows/product-recommendations';
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

export async function revalidateStorePaths() {
    revalidatePath('/');
    revalidatePath('/stores');
    revalidatePath('/dashboard/my-store');
}

export async function createProductAction(
  productData: Omit<Product, 'id' | 'imageId'> & { imageId: string }
) {
  try {
    // In a real app, you'd handle image uploads properly and save to DB.
    // For now, this is a placeholder.
    console.log("Creating product (placeholder):", productData);
    
    // Revalidate the path for the specific store
    revalidatePath(`/stores/${productData.storeId}`);
    revalidatePath(`/dashboard/my-store`);

    return { success: true, product: {id: 'new-prod', ...productData} };
  } catch (error) {
    console.error('Error creating product:', error);
    return { success: false, error: 'Failed to create product.' };
  }
}
