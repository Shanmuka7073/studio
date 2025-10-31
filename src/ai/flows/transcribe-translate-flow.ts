
'use server';
/**
 * @fileOverview This flow is deprecated. Voice transcription is now handled
 * by the browser's native SpeechRecognition API for stability.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

const transcribeInputSchema = z.object({
  audioDataUri: z
    .string()
    .describe(
      "A recording of a user's shopping list, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});


const transcribeOutputSchema = z.object({
  transcription: z.string().describe('The raw English transcription of the user audio.'),
  bilingualList: z.string().describe("A formatted, bilingual shopping list in English and Hindi, with each item on a new line."),
});


export type TranscribeAndTranslateOutput = z.infer<typeof transcribeOutputSchema>;


export async function transcribeAndTranslate(
  audioDataUri: string
): Promise<TranscribeAndTranslateOutput | null> {
    // This flow is being deprecated in favor of direct audio memo saving.
    // The AI transcription part is removed to improve stability.
    console.warn("transcribeAndTranslate is deprecated and should not be used.");
    return null;
}

    