
'use server';
/**
 * @fileOverview A flow to generate a monthly grocery package for a given family size.
 * 
 * - generateMonthlyPackage - Takes a member count and returns a list of grocery items.
 * - MonthlyPackageInput - The input type for the flow.
 * - MonthlyPackageOutput - The return type for the flow.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const MonthlyPackageInputSchema = z.object({
  memberCount: z.number().describe('The number of family members the package is for.'),
});
export type MonthlyPackageInput = z.infer<typeof MonthlyPackageInputSchema>;

const PackageItemSchema = z.object({
    name: z.string().describe("The name of the grocery item."),
    quantity: z.string().describe("The quantity for the item, including units (e.g., '10kg', '2L', '5 packs').")
});

const MonthlyPackageOutputSchema = z.object({
  items: z.array(PackageItemSchema).describe('A list of grocery items and their quantities for a one-month supply.'),
});
export type MonthlyPackageOutput = z.infer<typeof MonthlyPackageOutputSchema>;

export async function generateMonthlyPackage(input: MonthlyPackageInput): Promise<MonthlyPackageOutput | null> {
  return monthlyPackageFlow(input);
}

const packagePrompt = ai.definePrompt({
  name: 'monthlyPackagePrompt',
  input: { schema: MonthlyPackageInputSchema },
  output: { schema: MonthlyPackageOutputSchema },
  model: 'gemini-1.5-flash-latest',
  prompt: `You are an expert at creating balanced, monthly grocery lists for Indian households.

    The user wants a standard list of essential groceries for a family of {{{memberCount}}} members for one month.
    
    Generate a comprehensive list of items covering categories like:
    - Grains & Flours (Rice, Atta)
    - Dals & Pulses (Toor, Moong, Chana)
    - Oils & Ghee
    - Spices (basic essentials like turmeric, chili powder, cumin, mustard seeds)
    - Sugar & Salt
    - Tea & Coffee
    - A few essential vegetables with longer shelf life (Onions, Potatoes, Garlic)

    Keep the quantities reasonable for a one-month supply for {{{memberCount}}} people. Ensure the output is a simple list of items and their corresponding quantities. Do not add any introductory text or summaries.
    
    Return the output in the specified JSON format.`,
  config: {
    temperature: 0.5,
  },
});

const monthlyPackageFlow = ai.defineFlow(
  {
    name: 'monthlyPackageFlow',
    inputSchema: MonthlyPackageInputSchema,
    outputSchema: MonthlyPackageOutputSchema.nullable(),
  },
  async (input) => {
    try {
      const { output } = await packagePrompt(input);
      return output;
    } catch (e) {
      console.error(`Failed to generate monthly package for ${input.memberCount} members:`, e);
      return null;
    }
  }
);
