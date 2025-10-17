'use server';

import { getProductRecommendations, ProductRecommendationsInput } from "@/ai/flows/product-recommendations";

export async function getRecommendationsAction(input: ProductRecommendationsInput) {
    try {
        const recommendations = await getProductRecommendations(input);
        return recommendations;
    } catch(error) {
        console.error("Error getting AI recommendations:", error);
        return { error: 'Failed to get recommendations.' };
    }
}
