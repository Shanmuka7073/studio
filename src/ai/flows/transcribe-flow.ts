
'use server';
/**
 * @fileOverview A simple flow to transcribe an audio file.
 *
 * - transcribeAudio - Takes an audio data URI and returns the transcribed text.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

const TranscribeInputSchema = z.string().describe(
  "An audio file as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
);

const TranscribeOutputSchema = z.string().describe("The transcribed text from the audio.");

export async function transcribeAudio(audioDataUri: string): Promise<string> {
    const result = await transcribeFlow(audioDataUri);
    return result;
}

const transcribeFlow = ai.defineFlow(
    {
        name: 'transcribeFlow',
        inputSchema: TranscribeInputSchema,
        outputSchema: TranscribeOutputSchema,
    },
    async (audioDataUri) => {
        // By removing the try/catch, the original GenkitError will be thrown,
        // providing a more specific reason for the failure (e.g., model not found, API key issue).
        const { text } = await ai.generate({
            model: googleAI.model('gemini-1.5-pro'),
            prompt: [
                { text: 'Transcribe the following audio recording of a shopping list. The user may speak in a mix of English and other languages like Telugu or Hindi. Transcribe it as accurately as possible.' },
                { media: { url: audioDataUri } },
            ],
        });
        return text;
    }
);
