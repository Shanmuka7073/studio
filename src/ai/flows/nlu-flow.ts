
'use server';
/**
 * @fileOverview A Natural Language Understanding (NLU) flow to interpret user commands.
 *
 * - interpretCommand - Takes raw text and interprets it into a structured command.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const commandSchema = z.object({
  text: z.string().describe('The raw text spoken by the user.'),
});

const interpretedCommandSchema = z.object({
  intent: z
    .enum([
      'findProduct',
      'addProductToCart',
      'navigateTo',
      'confirm',
      'cancel',
      'unknown',
    ])
    .describe('The primary intent of the user command.'),
  entities: z.object({
    productName: z.string().optional().describe('The name of a product.'),
    storeName: z.string().optional().describe('The name of a store.'),
    pageName: z.string().optional().describe('The name of a page to navigate to (e.g., home, stores, cart, my orders).'),
  }).describe('Key entities extracted from the user command.'),
  originalText: z.string().describe('The original text from the user.'),
});

export type InterpretedCommand = z.infer<typeof interpretedCommandSchema>;

export async function interpretCommand(
  text: string
): Promise<InterpretedCommand> {
  return interpretCommandFlow({ text });
}

const nluPrompt = ai.definePrompt({
  name: 'nluPrompt',
  input: { schema: commandSchema },
  output: { schema: interpretedCommandSchema },
  model: 'googleai/gemini-1.5-pro-preview-0514',
  prompt: `You are an NLU engine for a grocery shopping app. Your task is to interpret the user's spoken command and extract the intent and relevant entities.

    The user is interacting with the app via voice.

    **Intents:**
    - findProduct: User wants to find a product. They might specify a store.
    - addProductToCart: User confirms adding a specific product to the cart.
    - navigateTo: User wants to go to a specific page.
    - confirm: User gives a positive confirmation (e.g., "yes", "confirm", "do it").
    - cancel: User gives a negative confirmation (e.g., "no", "cancel").
    - unknown: The command is unclear or not related to the app's functions.

    **Entities:**
    - productName: The name of the grocery item.
    - storeName: The name of the store.
    - pageName: The destination page. Examples: 'home', 'stores', 'cart', 'my orders', 'my store'.

    **Examples:**
    - "Find apples in Patel Kirana Store" -> intent: findProduct, entities: { productName: "apples", storeName: "Patel Kirana Store" }
    - "show me bananas" -> intent: findProduct, entities: { productName: "bananas" }
    - "Yes, add it" -> intent: confirm, entities: {}
    - "go to my cart" -> intent: navigateTo, entities: { pageName: "cart" }
    - "go to my orders" -> intent: navigateTo, entities: { pageName: "my orders" }
    - "take me home" -> intent: navigateTo, entities: { pageName: "home" }
    - "what's the weather like" -> intent: unknown, entities: {}

    **Command to interpret:**
    "{{{text}}}"

    Return the structured JSON output. Set originalText to the input text.
    `,
  config: {
    temperature: 0.1,
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
