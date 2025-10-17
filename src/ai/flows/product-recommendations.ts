'use server';

/**
 * @fileOverview An AI agent that provides product recommendations based on user's past purchases and current cart items.
 *
 * - getProductRecommendations - A function that returns product recommendations.
 * - ProductRecommendationsInput - The input type for the getProductRecommendations function.
 * - ProductRecommendationsOutput - The return type for the getProductRecommendations function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ProductRecommendationsInputSchema = z.object({
  pastPurchases: z.array(
    z.string().describe('IDs of products the user has purchased in the past')
  ).optional().describe('The list of past purchases of the user.'),
  currentCartItems: z.array(
    z.string().describe('IDs of products currently in the user cart')
  ).optional().describe('The list of product IDs in the user cart.'),
  optimalDisplayTime: z.enum(['Before Checkout', 'During Checkout', 'After Checkout']).describe('The optimal time to display product recommendations to the user.')
});

export type ProductRecommendationsInput = z.infer<typeof ProductRecommendationsInputSchema>;

const ProductRecommendationsOutputSchema = z.object({
  recommendedProducts: z.array(
    z.string().describe('IDs of products recommended to the user')
  ).describe('The list of product IDs recommended to the user.'),
  reason: z.string().describe('The reasoning behind the product recommendations.'),
});

export type ProductRecommendationsOutput = z.infer<typeof ProductRecommendationsOutputSchema>;

export async function getProductRecommendations(input: ProductRecommendationsInput): Promise<ProductRecommendationsOutput> {
  return productRecommendationsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'productRecommendationsPrompt',
  input: {schema: ProductRecommendationsInputSchema},
  output: {schema: ProductRecommendationsOutputSchema},
  prompt: `You are an expert shopping assistant, specializing in providing product recommendations to users based on their past purchases and current cart items.

  You will use this information to recommend products that the user might be interested in.
  You must consider the optimal time to display the product recommendations to the user.
  If the optimal time is 'Before Checkout', recommend products that complement the items in the cart.
  If the optimal time is 'During Checkout', recommend products that are frequently bought together with the items in the cart.
  If the optimal time is 'After Checkout', recommend products that are similar to the items in the past purchases.

  Past Purchases: {{#if pastPurchases}}{{{pastPurchases}}}{{else}}None{{/if}}
Current Cart Items: {{#if currentCartItems}}{{{currentCartItems}}}{{else}}None{{/if}}
Optimal Display Time: {{{optimalDisplayTime}}}

  Based on this information, recommend products to the user. Return a list of product IDs in the recommendedProducts field and a reason why these products are recommended in the reason field.
`,
});

const productRecommendationsFlow = ai.defineFlow(
  {
    name: 'productRecommendationsFlow',
    inputSchema: ProductRecommendationsInputSchema,
    outputSchema: ProductRecommendationsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
