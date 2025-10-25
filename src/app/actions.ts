
'use server';

import type { Order, Product } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import * as fs from 'fs/promises';
import * as path from 'path';
import { initServerApp } from '@/firebase/server-init';
import { collectionGroup, getDocs, writeBatch, query } from 'firebase/firestore';
import { translateProductNames } from '@/ai/flows/translation-flow';
import groceryData from '@/lib/grocery-data.json';


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
      
      // Revalidate paths where images are used, if necessary
      revalidatePath('/dashboard/site-config');
      revalidatePath('/');
      revalidatePath('/stores');

      return { success: true };
    } catch (error) {
      console.error('Failed to write to placeholder-images.json:', error);
      return { success: false, error: 'Failed to save image catalog.' };
    }
}

export async function translateAndSaveAllProductNames(): Promise<{ success: boolean; count?: number; error?: string }> {
    const { firestore } = await initServerApp();
    if (!firestore) {
        return { success: false, error: 'Firestore not initialized.' };
    }

    try {
        // 1. Get all unique product names from the master list
        const allProductNames = groceryData.categories.flatMap(category => Array.isArray(category.items) ? category.items : []);
        const uniqueProductNames = [...new Set(allProductNames)];

        // 2. Call AI to translate them
        const translations = await translateProductNames(uniqueProductNames);
        const translationMap = new Map(translations.map(t => [t.englishName, t.teluguName]));

        // 3. Get all product documents from all stores
        const productsQuery = query(collectionGroup(firestore, 'products'));
        const productSnapshots = await getDocs(productsQuery);
        
        if (productSnapshots.empty) {
            return { success: true, count: 0, error: "No products found to translate." };
        }

        // 4. Create a batch write to update all products
        const batch = writeBatch(firestore);
        let updatedCount = 0;

        productSnapshots.forEach(productDoc => {
            const product = productDoc.data() as Product;
            const teluguName = translationMap.get(product.name);
            
            if (teluguName) {
                batch.update(productDoc.ref, { localName: teluguName });
                updatedCount++;
            }
        });

        // 5. Commit the batch
        await batch.commit();
        
        // 6. Revalidate paths to show changes
        revalidatePath('/stores');
        revalidatePath('/dashboard/admin');

        return { success: true, count: updatedCount };

    } catch (error: any) {
        console.error("Failed to translate and save product names:", error);
        return { success: false, error: error.message || 'An unexpected error occurred during translation.' };
    }
}
