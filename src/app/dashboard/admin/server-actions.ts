
'use server';

import type { ProductVariant } from '@/lib/types';
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
            voiceOrdersPromise, 
        ]);
        
        const totalUsers = 0; 
        const totalOrdersDelivered = (ordersSnapshot.data().count || 0) + (voiceOrdersSnapshot.data().count || 0);

        return {
            totalUsers: totalUsers,
            totalStores: storesSnapshot.data().count || 0,
            totalDeliveryPartners: partnersSnapshot.data().count || 0,
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
    if (!productName || typeof productName !== 'string' || productName.trim().length === 0) {
        return { success: false, error: 'A valid product name is required.' };
    }
    
    if (!Array.isArray(variants) || variants.length === 0) {
        return { success: false, error: 'At least one product variant is required.' };
    }

    for (const variant of variants) {
        if (!variant.weight || typeof variant.weight !== 'string' || variant.weight.trim().length === 0) {
             return { success: false, error: 'Each variant must have a valid weight.' };
        }
         if (typeof variant.price !== 'number' || variant.price < 0) {
            return { success: false, error: `Variant with weight "${variant.weight}" has an invalid price.` };
        }
         if (!variant.sku || typeof variant.sku !== 'string' || variant.sku.trim().length === 0) {
            return { success: false, error: `Variant with weight "${variant.weight}" is missing a SKU.` };
        }
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
