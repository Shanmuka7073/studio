
'use server';

import type { Product } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import { getApps, initializeApp, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Helper function for robust server-side Firebase admin initialization
function getAdminFirestore() {
    if (getApps().length === 0) {
        // Automatically uses GOOGLE_APPLICATION_CREDENTIALS in a server environment
        initializeApp();
    }
    return getFirestore(getApp());
}

export async function updatePriceForProductByName(productName: string, newPrice: number): Promise<{ success: boolean; updatedCount: number; error?: string }> {
    if (typeof newPrice !== 'number' || newPrice < 0) {
        return { success: false, updatedCount: 0, error: 'Invalid price provided.' };
    }

    try {
        const firestore = getAdminFirestore();
        const productsQuery = firestore.collectionGroup('products').where('name', '==', productName);
        const productsSnapshot = await productsQuery.get();

        if (productsSnapshot.empty) {
            // This is not an error, it just means no stores currently have this product.
            // We proceed as if successful, since the goal is to update existing ones.
            // The admin UI will show the updated price for future additions.
             return { success: true, updatedCount: 0, error: `No products named "${productName}" found to update, but the admin price is conceptually set.` };
        }

        const batch = firestore.batch();
        productsSnapshot.docs.forEach(doc => {
            batch.update(doc.ref, { price: newPrice });
        });

        await batch.commit();
        
        // Revalidate paths to ensure data freshness across the app
        try {
            revalidatePath('/stores', 'layout');
            revalidatePath('/cart', 'layout');
            revalidatePath('/dashboard/admin', 'page');
            revalidatePath('/dashboard/owner/my-store', 'page');
        } catch (revalError) {
            console.error('Failed to revalidate paths:', revalError);
        }

        return { success: true, updatedCount: productsSnapshot.size };

    } catch (error) {
        console.error(`Failed to update price for ${productName}:`, error);
        return { success: false, updatedCount: 0, error: 'A server error occurred during the price update.' };
    }
}

export async function getUniqueProductNames(): Promise<Record<string, number>> {
    try {
        const firestore = getAdminFirestore();
        const productsSnapshot = await firestore.collectionGroup('products').get();

        if (productsSnapshot.empty) {
            return {};
        }

        const priceMap = productsSnapshot.docs.reduce((acc, doc) => {
            const product = doc.data() as Product;
            // Only set the price if it hasn't been set yet, ensuring consistency
            if (product.name && acc[product.name] === undefined) {
                acc[product.name] = product.price;
            }
            return acc;
        }, {} as Record<string, number>);

        return priceMap;

    } catch (error) {
        console.error(`Failed to fetch unique product names:`, error);
        return {};
    }
}
