
'use server';
/**
 * @fileOverview A flow to batch-generate images for all products in the catalog.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';
import groceryData from '@/lib/grocery-data.json';

const ImageInfoSchema = z.object({
  id: z.string().describe('The unique ID for the image, in the format `prod-product-name`.'),
  imageUrl: z.string().url().describe('The data URI of the generated image.'),
  imageHint: z.string().describe('A two-word hint for the image content.'),
});

const ImageListSchema = z.array(ImageInfoSchema);

export type ImageInfo = z.infer<typeof ImageInfoSchema>;

// Helper to create a URL-friendly slug from a string
const createSlug = (text: string) => {
  return text
    .toLowerCase()
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(/[^\w-]+/g, '') // Remove all non-word chars
    .replace(/--+/g, '-') // Replace multiple - with single -
    .replace(/^-+/, '') // Trim - from start of text
    .replace(/-+$/, ''); // Trim - from end of text
};

export async function generateAllImages(): Promise<ImageInfo[]> {
    return await imageGeneratorFlow();
}

const imageGeneratorFlow = ai.defineFlow(
  {
    name: 'imageGeneratorFlow',
    outputSchema: ImageListSchema,
  },
  async () => {
    // 1. Get all unique product names from our grocery data
    const allProducts = groceryData.categories.flatMap(category => category.items || []);
    const uniqueProductNames = Array.from(new Set(allProducts));

    // 2. For each product, generate an image
    const imagePromises = uniqueProductNames.map(async (productName) => {
        try {
            const { media } = await ai.generate({
                model: googleAI.model('imagen-4.0-fast-generate-001'),
                prompt: `A high-quality, professional photograph of "${productName}", on a clean, plain white background. The item should be centered and well-lit. Studio quality.`,
            });
            
            if (!media || !media.url) {
                throw new Error(`No image generated for ${productName}`);
            }

            // Create hint: "sweet potato" -> "sweet potato"
            const hint = productName.split('(')[0].trim().toLowerCase();

            return {
                id: `prod-${createSlug(productName)}`,
                imageUrl: media.url, // This is the data URI (e.g., "data:image/png;base64,...")
                imageHint: hint,
            };
        } catch(e) {
            console.error(`Failed to generate image for ${productName}:`, e);
            return null; // Return null on failure so we can filter it out
        }
    });

    // 3. Wait for all image generation tasks to complete
    const results = await Promise.all(imagePromises);
    
    // 4. Filter out any failed generations and return the successful ones
    const successfulImages = results.filter((result): result is ImageInfo => result !== null);

    // Also include the store images, which we don't need to regenerate
    const storeImages = (groceryData as any).placeholderImages?.filter((img: any) => img.id.startsWith('store-')) || [];

    return [...storeImages, ...successfulImages];
  }
);
