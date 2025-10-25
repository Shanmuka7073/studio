
'use server';

import type { Order, Product } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import * as fs from 'fs/promises';
import * as path from 'path';
import { initServerApp } from '@/firebase/server-init';

export async function revalidateStorePaths() {
  revalidatePath('/');
  revalidatePath('/stores');
  revalidatePath('/dashboard/my-store');
}

export async function revalidateProductPaths(storeId: string) {
  revalidatePath(`/stores/${storeId}`);
  revalidatePath(`/dashboard/my-store`);
}

type ImageData = {
  id: string;
  imageUrl: string;
  imageHint: string;
};

export async function updateImages(images: ImageData[]): Promise<{ success: boolean, error?: string }> {
    const newContent = {
      placeholderImages: images,
    };

    try {
      const filePath = path.join(process.cwd(), 'src', 'lib', 'placeholder-images.json');
      await fs.writeFile(filePath, JSON.stringify(newContent, null, 2), 'utf-8');
      
      revalidatePath('/dashboard/site-config');
      revalidatePath('/');
      revalidatePath('/stores');

      return { success: true };
    } catch (error) {
      console.error('Failed to write to placeholder-images.json:', error);
      return { success: false, error: 'Failed to save image catalog.' };
    }
}

export async function updatePriceForProductByName(productName: string, newPrice: number): Promise<{ success: boolean; updatedCount: number; error?: string }> {
    if (typeof newPrice !== 'number' || newPrice < 0) {
        return { success: false, updatedCount: 0, error: 'Invalid price provided.' };
    }

    try {
        const { firestore } = await initServerApp();
        const productsQuery = firestore.collectionGroup('products').where('name', '==', productName);
        const productsSnapshot = await productsQuery.get();

        if (productsSnapshot.empty) {
            return { success: false, updatedCount: 0, error: `No products named "${productName}" found to update.` };
        }

        const batch = firestore.batch();
        productsSnapshot.docs.forEach(doc => {
            batch.update(doc.ref, { price: newPrice });
        });

        await batch.commit();
        
        // Revalidate paths to show changes
        try {
            revalidatePath('/stores');
            revalidatePath('/cart');
            revalidatePath('/dashboard/admin');
        } catch (revalError) {
            console.error('Failed to revalidate paths:', revalError);
            // Don't fail the whole operation if revalidation fails
        }


        return { success: true, updatedCount: productsSnapshot.size };

    } catch (error) {
        console.error(`Failed to update price for ${productName}:`, error);
        return { success: false, updatedCount: 0, error: 'A server error occurred during the price update.' };
    }
}

export async function getUniqueProductNames(): Promise<Record<string, number>> {
    try {
        const { firestore } = await initServerApp();
        const productsQuery = firestore.collectionGroup('products');
        const productsSnapshot = await productsQuery.get();

        if (productsSnapshot.empty) {
            return {};
        }

        const priceMap = productsSnapshot.docs.reduce((acc, doc) => {
            const product = doc.data() as Product;
            if (product.name && !acc[product.name]) {
                acc[product.name] = product.price;
            }
            return acc;
        }, {} as Record<string, number>);

        return priceMap;

    } catch (error) {
        console.error(`Failed to fetch unique product names:`, error);
        // In case of error, return an empty object to prevent the client from crashing.
        return {};
    }
}

    
