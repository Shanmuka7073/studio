
'use server';
/**
 * @fileOverview A flow to handle a "quick order" from a single user utterance.
 * e.g., "order 1kg chicken from chandra store"
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { getStores, getMasterProducts, getProductPrice } from '@/lib/data';
import { initServerApp } from '@/firebase/server-init';
import type { Product, ProductPrice, ProductVariant, Store } from '@/lib/types';
import { collection, getDocs, query, where } from 'firebase/firestore';

// 1. Define the input schema for the entire flow
const QuickOrderInputSchema = z.object({
  command: z
    .string()
    .describe(
      'The full voice command from the user, e.g., "order 1kg chicken from chandra store"'
    ),
});
export type QuickOrderInput = z.infer<typeof QuickOrderInputSchema>;

// 2. Define the schema for the structured data we want the LLM to parse
const ParsedOrderSchema = z.object({
  productName: z.string().describe('The name of the product to order.'),
  quantity: z
    .string()
    .optional()
    .describe(
      "The desired quantity, including units (e.g., '1kg', '500gm', '2 packs')."
    ),
  storeName: z.string().describe('The name of the store to order from.'),
});

// 3. Define the final, successful output of the entire flow
const QuickOrderOutputSchema = z.object({
  product: z.custom<Product>(),
  variant: z.custom<ProductVariant>(),
  store: z.custom<Store>(),
  totalAmount: z.number(),
  userFriendlyMessage: z.string(),
});
export type QuickOrderOutput = z.infer<typeof QuickOrderOutputSchema>;

// Define a separate schema for user-facing errors
const QuickOrderErrorSchema = z.object({
  error: z.string(),
});

// The flow can return a success object or an error object
const FlowResponseSchema = z.union([
  QuickOrderOutputSchema,
  QuickOrderErrorSchema,
]);
export type QuickOrderFlowResponse = z.infer<typeof FlowResponseSchema>;

// Exported function that the UI will call
export async function quickOrderFlow(
  input: QuickOrderInput
): Promise<QuickOrderFlowResponse> {
  return quickOrderFlowImpl(input);
}

// Define the prompt for parsing the user's command
const parsingPrompt = ai.definePrompt({
  name: 'quickOrderParsingPrompt',
  input: { schema: QuickOrderInputSchema },
  output: { schema: ParsedOrderSchema },
  model: 'gemini-1.5-flash',
  prompt: `You are an expert at parsing unstructured shopping requests.
    Extract the product name, the quantity (if specified), and the store name from the following user command.

    Command: {{{command}}}

    Return the data in the specified JSON format.`,
  config: {
    temperature: 0.1,
  },
});

const quickOrderFlowImpl = ai.defineFlow(
  {
    name: 'quickOrderFlow',
    inputSchema: QuickOrderInputSchema,
    outputSchema: FlowResponseSchema,
  },
  async (input) => {
    const { firestore } = await initServerApp();

    // Step 1: Use the LLM to parse the unstructured command
    const { output: parsedOrder } = await parsingPrompt(input);
    if (!parsedOrder) {
      return { error: 'Sorry, I had trouble understanding that.' };
    }

    const { productName, quantity, storeName } = parsedOrder;

    // Step 2: Fetch all stores and master products in parallel
    const [allStores, masterProducts] = await Promise.all([
      getStores(firestore as any),
      getMasterProducts(firestore as any),
    ]);

    // Step 3: Find the best matching store
    if (allStores.length === 0) {
      return { error: 'Sorry, no stores are available right now.' };
    }
    const foundStore = allStores.find(
      (s) => s.name.toLowerCase() === storeName.toLowerCase()
    );
    if (!foundStore) {
      return {
        error: `Sorry, I couldn't find a store named "${storeName}". Please try a different store.`,
      };
    }

    // Step 4: Find the best matching product from the master list
    const foundProduct = masterProducts.find(
      (p) => p.name.toLowerCase() === productName.toLowerCase()
    );
    if (!foundProduct) {
      return {
        error: `Sorry, I couldn't find a product named "${productName}".`,
      };
    }

    // Step 5: CRITICAL - Check if the found store actually sells the found product
    const storeProductsCol = collection(firestore, `stores/${foundStore.id}/products`);
    const q = query(storeProductsCol, where('name', '==', foundProduct.name));
    const storeProductsSnapshot = await getDocs(q);

    if (storeProductsSnapshot.empty) {
        return { error: `Sorry, ${foundStore.name} does not have ${foundProduct.name} in stock. Please try another store.` };
    }


    // Step 6: Get pricing information for the product
    const priceData = await getProductPrice(
      firestore as any,
      foundProduct.name
    );
    if (!priceData || !priceData.variants || priceData.variants.length === 0) {
      return {
        error: `Pricing information is not available for ${productName}.`,
      };
    }

    // Step 7: Find the best matching variant
    let foundVariant = priceData.variants[0]; // Default to the first variant
    if (quantity) {
      const lowerQuantity = quantity.replace(/\s/g, '').toLowerCase();
      const variantMatch = priceData.variants.find(
        (v) => v.weight.replace(/\s/g, '').toLowerCase() === lowerQuantity
      );
      if (variantMatch) {
        foundVariant = variantMatch;
      }
    }

    // Step 8: Calculate total and construct the success response
    const DELIVERY_FEE = 30;
    const totalAmount = foundVariant.price + DELIVERY_FEE;

    const userFriendlyMessage = `I found ${foundVariant.weight} of ${
      foundProduct.name
    } from ${
      foundStore.name
    }. The total is ₹${totalAmount.toFixed(
      2
    )}. Say "confirm order" to place it now.`;

    return {
      product: { ...foundProduct, variants: priceData.variants }, // Return product with all variants
      variant: foundVariant,
      store: foundStore,
      totalAmount,
      userFriendlyMessage,
    };
  }
);
