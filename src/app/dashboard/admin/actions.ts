
'use server';

import type { Product, ProductVariant } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import { getApps, initializeApp, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';


// Helper function for robust server-side Firebase admin initialization
function getAdminServices() {
    // Check if the app is already initialized to avoid errors
    if (getApps().length === 0) {
        // This will automatically use the GOOGLE_APPLICATION_CREDENTIALS environment
        // variable on the server for authentication, which is handled by App Hosting.
        initializeApp();
    }
    // Return the services from the initialized app.
    const app = getApp();
    return {
        firestore: getFirestore(app),
        auth: getAuth(app),
    };
}

export async function getAdminStats(): Promise<{
    totalUsers: number,
    totalStores: number,
    totalDeliveryPartners: number,
    totalOrdersDelivered: number,
}> {
    try {
        const { firestore, auth } = getAdminServices();

        const usersPromise = auth.listUsers();
        const storesPromise = firestore.collection('stores').where('isClosed', '!=', true).count().get();
        const partnersPromise = firestore.collection('deliveryPartners').count().get();
        // Combined query for both regular and voice orders that are delivered
        const ordersPromise = firestore.collectionGroup('orders').where('status', '==', 'Delivered').count().get();
        const voiceOrdersPromise = firestore.collectionGroup('voice-orders').where('status', '==', 'Delivered').count().get();


        const [usersResult, storesSnapshot, partnersSnapshot, ordersSnapshot, voiceOrdersSnapshot] = await Promise.all([
            usersPromise,
            storesPromise,
            partnersPromise,
            ordersPromise,
            voiceOrdersSnapshot,
        ]);
        
        // Filter out admin user from total customers count
        const totalUsers = usersResult.users.filter(u => u.email !== 'admin@gmail.com').length;
        const totalOrdersDelivered = ordersSnapshot.data().count + voiceOrdersSnapshot.data().count;

        return {
            totalUsers: totalUsers,
            totalStores: storesSnapshot.data().count,
            totalDeliveryPartners: partnersSnapshot.data().count,
            totalOrdersDelivered: totalOrdersDelivered,
        };

    } catch (error) {
        console.error('Failed to fetch admin stats:', error);
        // In case of an error, return zeros to prevent the page from crashing.
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
        const { firestore } = getAdminServices();
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
    } catch (error) {
        console.error(`Failed to save prices for ${productName}:`, error);
        return { success: false, error: 'A server error occurred during the price update.' };
    }
}

export async function getUniqueProductNames(): Promise<string[]> {
    try {
        const { firestore } = getAdminServices();
        const productsSnapshot = await firestore.collectionGroup('products').get();

        if (productsSnapshot.empty) {
            return [];
        }

        const nameSet = new Set<string>();
        productsSnapshot.docs.forEach(doc => {
            const product = doc.data() as Product;
            if (product.name) {
                nameSet.add(product.name);
            }
        });

        return Array.from(nameSet);

    } catch (error) {
        console.error(`Failed to fetch unique product names:`, error);
        return [];
    }
}

export async function getProductPrices(): Promise<Record<string, ProductVariant[]>> {
     try {
        const { firestore } = getAdminServices();
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
