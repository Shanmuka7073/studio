'use server';
/**
 * @fileOverview A Natural Language Understanding (NLU) flow to interpret user commands and shopping lists.
 *
 * - interpretCommand - Takes raw text and interprets it into a structured command.
 * - understandShoppingList - Takes raw text and extracts a structured shopping list.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';


// Schema for general command interpretation
const commandSchema = z.object({
  text: z.string().describe('The raw text spoken by the user.'),
});

const interpretedCommandSchema = z.object({
  intent: z
    .enum([
      'findProduct',
      'addProductToCart',
      'navigateTo',
      'createVoiceOrder',
      'getRecipeIngredients',
      'confirm',
      'cancel',
      'unknown',
    ])
    .describe('The primary intent of the user command.'),
  entities: z.object({
    productName: z.string().optional().describe('The name of a product.'),
    storeName: z.string().optional().describe('The name of a store.'),
    pageName: z.string().optional().describe("The name of a page to navigate to (e.g., home, stores, cart, my orders, my store, deliveries)."),
    shoppingList: z.string().optional().describe("A shopping list of items."),
    dishName: z.string().optional().describe("The name of a recipe or dish the user wants to cook."),
  }).describe('Key entities extracted from the user command.'),
  originalText: z.string().describe('The original text from the user.'),
});

export type InterpretedCommand = z.infer<typeof interpretedCommandSchema>;

// Schema for structured shopping list
const ShoppingListItemSchema = z.object({
    productName: z.string().describe("The name of the grocery item. Be as specific as possible (e.g., 'chicken skinless' should be 'Chicken Skinless' not just 'Chicken')."),
    quantity: z.string().describe("The quantity, including units (e.g., '1kg', '500gm', '2 packets'). This should match one of the canonical weights if possible (e.g., '1/2 kg' becomes '500gm')."),
});
export type ShoppingListItem = z.infer<typeof ShoppingListItemSchema>;

const ShoppingListSchema = z.object({
    items: z.array(ShoppingListItemSchema).describe("An array of structured grocery items."),
});
export type ShoppingList = z.infer<typeof ShoppingListSchema>;


export async function interpretCommand(
  text: string
): Promise<InterpretedCommand> {
  return interpretCommandFlow({ text });
}

export async function understandShoppingList(
  text: string
): Promise<ShoppingList | null> {
    const { output } = await shoppingListFlow({ text });
    return output;
}

const nluPrompt = ai.definePrompt({
  name: 'nluPrompt',
  input: { schema: commandSchema },
  output: { schema: interpretedCommandSchema },
  model: 'gemini-1.5-flash',
  prompt: `You are an NLU engine for a grocery shopping app. Your task is to interpret the user's spoken command and extract the intent and relevant entities.

    The user is interacting with the app via voice.

    **Intents:**
    - findProduct: User wants to find a specific product. They might specify a store.
    - addProductToCart: User confirms adding a specific product to the cart.
    - createVoiceOrder: User wants to create an order by listing items. This is for open-ended shopping lists.
    - getRecipeIngredients: User wants to know the ingredients for a specific dish.
    - navigateTo: User wants to go to a specific page.
    - confirm: User gives a positive confirmation (e.g., "yes", "confirm", "do it").
    - cancel: User gives a negative confirmation (e.g., "no", "cancel").
    - unknown: The command is unclear or not related to the app's functions.

    **Entities:**
    - productName: The name of a single grocery item.
    - storeName: The name of the store.
    - pageName: The destination page. Examples: 'home', 'stores', 'cart' or 'shopping cart', 'my orders', 'my store', 'store orders', 'deliveries'.
    - shoppingList: The full text of a shopping list provided by the user.
    - dishName: The name of a recipe or dish.

    **Examples:**
    - "Find apples in Patel Kirana Store" -> intent: findProduct, entities: { productName: "apples", storeName: "Patel Kirana Store" }
    - "I need onions, potatoes, and some milk" -> intent: createVoiceOrder, entities: { shoppingList: "onions, potatoes, and some milk" }
    - "I want to prepare biryani" -> intent: getRecipeIngredients, entities: { dishName: "biryani" }
    - "What do I need to make pasta?" -> intent: getRecipeIngredients, entities: { dishName: "pasta" }
    - "get me some bananas at City Fresh Produce" -> intent: findProduct, entities: { productName: "bananas", storeName: "City Fresh Produce" }
    - "Yes, add it" -> intent: confirm, entities: {}
    - "go to my cart" -> intent: navigateTo, entities: { pageName: "cart" }
    - "take me home" -> intent: navigateTo, entities: { pageName: "home" }
    - "what's the weather like" -> intent: unknown, entities: {}

    **Command to interpret:**
    "{{{text}}}"

    Return the structured JSON output. Set originalText to the input text. If the intent is 'createVoiceOrder', populate the shoppingList entity. If the intent is 'getRecipeIngredients', populate the dishName entity.
    `,
  config: {
    temperature: 0.1,
  }
});


const shoppingListPrompt = ai.definePrompt({
    name: 'shoppingListPrompt',
    input: { schema: commandSchema },
    output: { schema: ShoppingListSchema },
    model: 'gemini-1.5-flash',
    prompt: `You are an expert grocery list parser. Your task is to take a raw text string, which is a transcription of a user's voice, and convert it into a structured list of items with their quantities.

    **Instructions:**
    1.  Identify each distinct grocery item. Be specific. If the user says "chicken skinless", the productName should be "Chicken Skinless".
    2.  Extract the quantity and units for each item.
    3.  Normalize quantities where possible: '1/2 kg' or 'half a kilo' should become '500gm'. '1 kilo' should become '1kg'. '3 kgs' becomes '3kg'.
    4.  If no quantity is mentioned for an item that typically has one (like vegetables), assume a default like '500gm'. If it's a packaged item like 'milk', assume '1 packet'.
    5.  Format the output as a JSON object containing an 'items' array, where each object has 'productName' and 'quantity'.

    **Examples:**
    - "I need 1 kilo of onions, half a kilo of potatoes, and some milk" -> { "items": [{ "productName": "Onions", "quantity": "1kg" }, { "productName": "Potatoes", "quantity": "500gm" }, { "productName": "Milk", "quantity": "1 packet" }] }
    - "Get me two packets of Maggi noodles, a dozen eggs, and 1kg of chicken breast" -> { "items": [{ "productName": "Maggi Noodles", "quantity": "2 packets" }, { "productName": "Eggs", "quantity": "1 dozen" }, { "productName": "Chicken Breast", "quantity": "1kg" }] }
    - "1 kg chicken 1/2 kg chicken skinless 3 kgs mutton" -> { "items": [{"productName": "Chicken", "quantity": "1kg"}, {"productName": "Chicken Skinless", "quantity": "500gm"}, {"productName": "Mutton", "quantity": "3kg"}] }

    **Shopping List to process:**
    "{{{text}}}"
    `,
    config: {
        temperature: 0.2
    }
});


const interpretCommandFlow = ai.defineFlow(
  {
    name: 'interpretCommandFlow',
    inputSchema: commandSchema,
    outputSchema: interpretedCommandSchema,
  },
  async ({ text }) => {
    const { output } = await nluPrompt({ text });
    if (!output) {
      return {
        intent: 'unknown',
        entities: {},
        originalText: text,
      };
    }
    return { ...output, originalText: text };
  }
);


const shoppingListFlow = ai.defineFlow(
  {
    name: 'shoppingListFlow',
    inputSchema: commandSchema,
    outputSchema: ShoppingListSchema.nullable(),
  },
  async ({ text }) => {
    const { output } = await shoppingListPrompt({ text });
    return output;
  }
);
