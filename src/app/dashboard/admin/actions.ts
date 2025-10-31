
'use server';

import type { Product, ProductVariant } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import { getFirestore } from '@genkit-ai/google-cloud';
import groceryData from '@/lib/grocery-data.json';

export async function getAdminStats(): Promise<{
    totalUsers: number,
    totalStores: number,
    totalDeliveryPartners: number,
    totalOrdersDelivered: number,
}> {
    try {
        const firestore = getFirestore();
        
        const storesPromise = firestore.collection('stores').where('isClosed', '!=', true).count().get();
        const partnersPromise = firestore.collection('deliveryPartners').count().get();
        const ordersPromise = firestore.collectionGroup('orders').where('status', '==', 'Delivered').count().get();
        const voiceOrdersPromise = firestore.collectionGroup('voice-orders').where('status', '==', 'Delivered').count().get();


        const [storesSnapshot, partnersSnapshot, ordersSnapshot, voiceOrdersSnapshot] = await Promise.all([
            storesPromise,
            partnersPromise,
            ordersPromise,
            voiceOrdersSnapshot,
        ]);
        
        const totalUsers = 0; 
        const totalOrdersDelivered = ordersSnapshot.data().count + voiceOrdersSnapshot.data().count;

        return {
            totalUsers: totalUsers,
            totalStores: storesSnapshot.data().count,
            totalDeliveryPartners: partnersSnapshot.data().count,
            totalOrdersDelivered: totalOrdersDelivered,
        };

    } catch (error) {
        console.error('Failed to fetch admin stats:', error);
        return {
            totalUsers: 0,
            totalStores: 0,
            totalDeliveryPartners: 0,
            totalOrdersDelivered: 0,
        };
    }
}


export async function saveProductPrices(productName: string, variants: ProductVariant[]): Promise<{ success: boolean; error?: string }> {
    if (!productName || !variants || variants.length === 0) {
        return { success: false, error: 'Invalid product data provided.' };
    }

    try {
        const firestore = getFirestore();
        const productPriceRef = firestore.collection('productPrices').doc(productName.toLowerCase());

        await productPriceRef.set({
            productName: productName.toLowerCase(),
            variants: variants,
        });

        // After updating the canonical price, we need to update all existing products in all stores
        const productsQuery = firestore.collectionGroup('products').where('name', '==', productName);
        const productsSnapshot = await productsQuery.get();

        if (!productsSnapshot.empty) {
            const batch = firestore.batch();
            productsSnapshot.docs.forEach(doc => {
                batch.update(doc.ref, { variants: variants });
            });
            await batch.commit();
        }

        revalidatePath('/dashboard/admin/pricing', 'page');
        revalidatePath('/stores', 'layout');

        return { success: true };
    } catch (error: any) {
        console.error(`Failed to save prices for ${productName}:`, error);
        return { success: false, error: error.message || 'A server error occurred during the price update.' };
    }
}

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
