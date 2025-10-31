
'use server';

import type { Product, ProductVariant } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import { getFirestore } from '@genkit-ai/google-cloud';
import groceryData from '@/lib/grocery-data.json';

export async function getUniqueProductNames(): Promise<string[]> {
    try {
        const nameSet = new Set<string>();
        groceryData.categories.forEach(category => {
            if (Array.isArray(category.items)) {
                category.items.forEach(item => {
                    nameSet.add(item);
                });
            }
        });
        
        return Array.from(nameSet).sort();

    } catch (error) {
        console.error(`Failed to fetch unique product names from JSON file:`, error);
        return [];
    }
}

export async function getProductPrices(): Promise<Record<string, ProductVariant[]>> {
     try {
        const firestore = getFirestore();
        const pricesSnapshot = await firestore.collection('productPrices').get();

        if (pricesSnapshot.empty) {
            return {};
        }

        const priceMap: Record<string, ProductVariant[]> = {};
        pricesSnapshot.docs.forEach(doc => {
            const data = doc.data();
            priceMap[doc.id] = data.variants as ProductVariant[];
        });

        return priceMap;
    } catch (error) {
        console.error('Failed to fetch product prices:', error);
        return {};
    }
}
