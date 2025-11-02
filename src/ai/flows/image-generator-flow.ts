
'use server';
/**
 * @fileOverview A flow to generate a product image from a text description.
 * 
 * - generateSingleImage - Takes a product name and returns a data URI for a generated image.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

// FEATURE FLAG: Set this to true to enable AI image generation.
// Disabling this will make the app fall back to placeholder images and avoid costs.
const AI_IMAGE_GENERATION_ENABLED = false;

const ImageRequestSchema = z.object({
  prompt: z.string().describe('The text prompt for image generation, e.g., "A bowl of fresh tomatoes".'),
});

const ImageResponseSchema = z.object({
  imageUrl: z.string().describe('The data URI of the generated image.'),
});

export async function generateSingleImage(prompt: string): Promise<string | null> {
  const result = await imageGenerationFlow({ prompt });
  return result?.imageUrl || null;
}

const imageGenerationFlow = ai.defineFlow(
  {
    name: 'imageGenerationFlow',
    inputSchema: ImageRequestSchema,
    outputSchema: ImageResponseSchema.nullable(),
  },
  async ({ prompt }) => {
    // Check the feature flag before proceeding.
    if (!AI_IMAGE_GENERATION_ENABLED) {
        console.log('AI image generation is disabled. Skipping flow.');
        return null;
    }
      
    try {
      const fullPrompt = `A high-quality, photorealistic image of the following grocery item on a clean, white background: ${prompt}. The image should be bright and appealing.`;
      
      const { media } = await ai.generate({
        model: 'googleai/imagen-2.0-latest',
        prompt: fullPrompt,
        config: {
          aspectRatio: '1:1', // Generate a square image
        }
      });
      
      if (!media.url) {
        throw new Error('No image URL was returned by the model.');
      }

      return { imageUrl: media.url };

    } catch (e) {
      console.error('Image generation AI flow failed:', e);
      return null;
    }
  }
);
