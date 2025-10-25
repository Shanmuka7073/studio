'use server';
/**
 * @fileOverview A flow for updating the placeholder images JSON file.
 *
 * - updateImages - Overwrites the placeholder-images.json file with new content.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import * as fs from 'fs/promises';
import * as path from 'path';

const imageSchema = z.object({
  id: z.string(),
  imageUrl: z.string(),
  imageHint: z.string(),
});

const imageArraySchema = z.array(imageSchema);
type ImageArray = z.infer<typeof imageArraySchema>;

export async function updateImages(images: ImageArray): Promise<{ success: boolean }> {
  return updateImagesFlow(images);
}

const updateImagesFlow = ai.defineFlow(
  {
    name: 'updateImagesFlow',
    inputSchema: imageArraySchema,
    outputSchema: z.object({ success: z.boolean() }),
  },
  async (images) => {
    const newContent = {
      placeholderImages: images,
    };

    try {
      const filePath = path.join(process.cwd(), 'src', 'lib', 'placeholder-images.json');
      await fs.writeFile(filePath, JSON.stringify(newContent, null, 2), 'utf-8');
      
      return { success: true };
    } catch (error) {
      console.error('Failed to write to placeholder-images.json:', error);
      // In a real app, you might want to throw the error to be handled by the caller
      // For this flow, we'll return a success: false status.
      return { success: false };
    }
  }
);
