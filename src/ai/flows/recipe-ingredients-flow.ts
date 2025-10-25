
'use server';
/**
 * @fileOverview A flow to get a list of ingredients for a given recipe, with caching.
 * 
 * - getRecipeIngredients - Takes a dish name and returns a list of ingredients.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';
import { getCachedRecipe, setCachedRecipe } from '@/lib/recipe-cache';
import { initializeFirebase } from '@/firebase';

const RecipeInputSchema = z.object({
  dishName: z.string().describe('The name of the dish to get ingredients for.'),
});

const RecipeOutputSchema = z.object({
  ingredients: z.array(z.string()).describe('A list of ingredients for the specified dish.'),
  dishName: z.string().describe('The name of the dish.'),
});

export type RecipeIngredients = z.infer<typeof RecipeOutputSchema>;

export async function getRecipeIngredients(dishName: string): Promise<RecipeIngredients | null> {
  return recipeIngredientsFlow({ dishName });
}

const recipePrompt = ai.definePrompt({
  name: 'recipePrompt',
  input: { schema: RecipeInputSchema },
  output: { schema: RecipeOutputSchema },
  model: googleAI.model('gemini-1.5-flash-latest'),
  prompt: `You are a helpful recipe assistant. The user wants to cook a dish and needs the ingredients.
    
    Dish: {{{dishName}}}

    Generate a typical list of ingredients required to make this dish. Keep the list concise and focused on standard ingredients a user would need to buy from a grocery store.
    
    Return the output in the specified JSON format. The 'dishName' in the output should be the same as the input.`,
  config: {
    temperature: 0.2,
  },
});

const recipeIngredientsFlow = ai.defineFlow(
  {
    name: 'recipeIngredientsFlow',
    inputSchema: RecipeInputSchema,
    outputSchema: RecipeOutputSchema.nullable(),
  },
  async ({ dishName }) => {
    const { firestore } = initializeFirebase();

    // 1. Check cache first
    const cachedRecipe = await getCachedRecipe(firestore, dishName);
    if (cachedRecipe) {
      console.log(`[Cache Hit] Found ingredients for ${dishName} in Firestore.`);
      return {
        dishName: cachedRecipe.dishName,
        ingredients: cachedRecipe.ingredients,
      };
    }

    console.log(`[Cache Miss] Calling AI to get ingredients for ${dishName}.`);
    
    // 2. If not in cache, call AI
    try {
      const { output } = await recipePrompt({ dishName });
      
      // 3. If AI returns a result, save it to the cache
      if (output) {
        await setCachedRecipe(firestore, output);
      }
      
      return output;
    } catch (e) {
      console.error(`Failed to get ingredients for ${dishName}:`, e);
      return null;
    }
  }
);

    