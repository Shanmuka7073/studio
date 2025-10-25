
'use server';
/**
 * @fileOverview A flow to generate images for products within a specific category.
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

const ImageGeneratorInputSchema = z.object({
    category: z.string().describe("The product category to generate images for."),
});


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

export async function generateImagesForCategory(category: string): Promise<ImageInfo[]> {
    return await imageGeneratorFlow({ category });
}

const imageGeneratorFlow = ai.defineFlow(
  {
    name: 'imageGeneratorFlow',
    inputSchema: ImageGeneratorInputSchema,
    outputSchema: ImageListSchema,
  },
  async ({ category }) => {
    
    const categoryData = groceryData.categories.find(c => c.categoryName === category);

    if (!categoryData || !categoryData.items) {
        console.warn(`Category "${category}" not found or has no items.`);
        return [];
    }

    const productsToGenerate = categoryData.items;
    const generatedImages: ImageInfo[] = [];

    // Process products sequentially to avoid timeouts and rate limits
    for (const productName of productsToGenerate) {
        try {
            console.log(`Generating image for: ${productName} in category: ${category}`);
            const { media } = await ai.generate({
                model: googleAI.model('imagen-4.0-fast-generate-001'),
                prompt: `A high-quality, professional photograph of "${productName}", on a clean, plain white background. Studio quality.`,
            });
            
            if (!media || !media.url) {
                console.warn(`No image generated for ${productName}`);
                continue; // Skip to the next product
            }

            // Create hint: "sweet potato" -> "sweet potato"
            const hint = productName.split('(')[0].trim().toLowerCase();

            generatedImages.push({
                id: `prod-${createSlug(productName)}`,
                imageUrl: media.url, // This is the data URI
                imageHint: hint,
            });
        } catch(e) {
            console.error(`Failed to generate image for ${productName}:`, e);
            // Continue to the next product even if one fails
        }
    }

    return generatedImages;
  }
);
