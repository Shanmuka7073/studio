
'use server';

import {
  collection,
  query,
  where,
  getDocs,
  setDoc,
  doc,
  serverTimestamp,
  Firestore,
} from 'firebase/firestore';
import type { RecipeIngredients } from '@/ai/flows/recipe-ingredients-flow';

// Helper to create a URL-friendly slug from a string for the document ID
const createSlug = (text: string) => {
  return text
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
};

/**
 * Retrieves a cached recipe from Firestore.
 * @param db The Firestore instance.
 * @param dishName The name of the dish to look for.
 * @returns The cached recipe data or null if not found.
 */
export async function getCachedRecipe(
  db: Firestore,
  dishName: string
): Promise<RecipeIngredients | null> {
  const normalizedDishName = createSlug(dishName);
  const recipesRef = collection(db, 'cachedRecipes');
  const q = query(recipesRef, where('dishName', '==', dishName.toLowerCase()));

  try {
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const doc = querySnapshot.docs[0];
      return doc.data() as RecipeIngredients;
    }
    return null;
  } catch (error) {
    console.error('Error getting cached recipe:', error);
    // Don't throw, just return null so the flow can proceed to the AI call
    return null;
  }
}

/**
 * Saves a recipe's ingredients to the Firestore cache.
 * @param db The Firestore instance.
 * @param recipe The recipe data to save.
 */
export async function setCachedRecipe(
  db: Firestore,
  recipe: RecipeIngredients
): Promise<void> {
  const normalizedDishName = createSlug(recipe.dishName);
  const recipeDocRef = doc(db, 'cachedRecipes', normalizedDishName);

  try {
    await setDoc(recipeDocRef, {
      ...recipe,
      dishName: recipe.dishName.toLowerCase(), // Store normalized name for querying
      createdAt: serverTimestamp(),
    });
    console.log(`Successfully cached recipe: ${recipe.dishName}`);
  } catch (error) {
    console.error('Error setting cached recipe:', error);
    // Don't throw, as the main goal is to return the result to the user
  }
}

    