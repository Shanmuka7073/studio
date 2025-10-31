
'use server';
/**
 * @fileOverview A flow to translate a list of product names into Telugu.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const TranslationInputSchema = z.object({
  productNames: z.array(z.string()).describe('A list of product names in English.'),
});

const TranslationSchema = z.object({
  englishName: z.string().describe('The original English product name.'),
  teluguName: z.string().describe('The Telugu translation of the product name.'),
});

const TranslationOutputSchema = z.object({
  translations: z.array(TranslationSchema),
});

export type Translation = z.infer<typeof TranslationSchema>;

export async function translateProductNames(productNames: string[]): Promise<Translation[]> {
  const result = await translationFlow({ productNames });
  return result?.translations || [];
}

const translationPrompt = ai.definePrompt({
    name: 'translationPrompt',
    input: { schema: TranslationInputSchema },
    output: { schema: TranslationOutputSchema },
    model: 'gemini-1.5-flash',
    prompt: `You are a translation expert specializing in English to Telugu for grocery items.
    
    Translate the following list of product names into Telugu. Provide the output in the specified JSON format.
    
    For each item in the 'productNames' array, create a corresponding object in the 'translations' array with the 'englishName' and its 'teluguName'.

    Product Names:
    {{#each productNames}}- {{{this}}}
    {{/each}}
    `,
    config: {
        temperature: 0.1,
    }
});


const translationFlow = ai.defineFlow(
  {
    name: 'translationFlow',
    inputSchema: TranslationInputSchema,
    outputSchema: TranslationOutputSchema.nullable(),
  },
  async ({ productNames }) => {
    if (productNames.length === 0) {
        return { translations: [] };
    }

    try {
      const { output } = await translationPrompt({ productNames });
      return output;
    } catch (e) {
      console.error('Translation AI flow failed:', e);
      return null;
    }
  }
);
