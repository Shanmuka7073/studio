'use server';

import {
  getProductRecommendations,
  ProductRecommendationsInput,
} from '@/ai/flows/product-recommendations';
import type { Product } from '@/lib/types';
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

export async function getProductsByIdsAction(productRefs: {productId: string, storeId: string}[]): Promise<Product[]> {
  // Moved firebase-admin imports and initialization inside the action
  const { initializeApp, getApps, cert } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');

  if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    console.error('FIREBASE_SERVICE_ACCOUNT_KEY is not set.');
    return [];
  }

  try {
      const serviceAccount = JSON.parse(
        process.env.FIREBASE_SERVICE_ACCOUNT_KEY as string
      );

      if (!getApps().length) {
        initializeApp({
          credential: cert(serviceAccount),
        });
      }
      
      const adminDb = getFirestore();
      
      const products: Product[] = [];
      for (const { productId, storeId } of productRefs) {
        try {
          const productSnap = await adminDb
            .collection('stores')
            .doc(storeId)
            .collection('products')
            .doc(productId)
            .get();
          if (productSnap.exists) {
            products.push({
              id: productSnap.id,
              ...productSnap.data(),
            } as Product);
          }
        } catch (error) {
          console.error(
            `Failed to fetch product ${productId} from store ${storeId}`,
            error
          );
        }
      }
      return products;
  } catch (error) {
    console.error('Error fetching products by IDs:', error);
    return [];
  }
}
