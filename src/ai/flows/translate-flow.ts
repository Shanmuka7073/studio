'use server';
/**
 * @fileOverview A flow for translating text to English.
 *
 * - translateText - A function that takes a string and returns its English translation.
 */

import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/google-genai';
import { z } from 'genkit';

const TranslationInputSchema = z.string();
const TranslationOutputSchema = z.string();

export async function translateText(input: string): Promise<string> {
  return translateFlow(input);
}

const translatePrompt = ai.definePrompt({
  name: 'translatePrompt',
  input: { schema: TranslationInputSchema },
  output: { schema: TranslationOutputSchema },
  model: googleAI.model('gemini-1.5-flash-latest'),
  prompt: `Translate the following text to English. If the text is already in English, just return the original text. Output only the translated text.

Text: {{{input}}}`,
});

const translateFlow = ai.defineFlow(
  {
    name: 'translateFlow',
    inputSchema: TranslationInputSchema,
    outputSchema: TranslationOutputSchema,
  },
  async (input) => {
    const { output } = await translatePrompt(input);
    return output || input; // Fallback to input if translation fails
  }
);
