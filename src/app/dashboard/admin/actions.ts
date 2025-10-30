
'use server';

import type { Product } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import { getApps, initializeApp, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';


// Helper function for robust server-side Firebase admin initialization
function getAdminServices() {
    // Check if the app is already initialized to avoid errors
    if (getApps().length === 0) {
        // This will automatically use the GOOGLE_APPLICATION_CREDENTIALS environment
        // variable on the server for authentication.
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
        const ordersPromise = firestore.collection('orders').where('status', '==', 'Delivered').count().get();

        const [usersResult, storesSnapshot, partnersSnapshot, ordersSnapshot] = await Promise.all([
            usersPromise,
            storesPromise,
            partnersPromise,
            ordersPromise,
        ]);
        
        // Filter out admin user from total customers count
        const totalUsers = usersResult.users.filter(u => u.email !== 'admin@gmail.com').length;

        return {
            totalUsers: totalUsers,
            totalStores: storesSnapshot.data().count,
            totalDeliveryPartners: partnersSnapshot.data().count,
            totalOrdersDelivered: ordersSnapshot.data().count,
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


export async function updatePriceForProductByName(productName: string, newPrice: number): Promise<{ success: boolean; updatedCount: number; error?: string }> {
    if (typeof newPrice !== 'number' || newPrice < 0) {
        return { success: false, updatedCount: 0, error: 'Invalid price provided.' };
    }

    try {
        const { firestore } = getAdminServices();
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
        const { firestore } = getAdminServices();
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
