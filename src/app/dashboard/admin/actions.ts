
'use server';

import type { Product, ProductVariant } from '@/lib/types';
import { revalidatePath } from 'next/cache';
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
