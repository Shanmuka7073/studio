'use server';
/**
 * @fileOverview A flow to transcribe an audio file.
 *
 * - transcribeAudio - Takes an audio data URI and returns the transcribed text.
 */

import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/google-genai';
import { z } from 'genkit';

const TranscribeInputSchema = z.string().describe('An audio file encoded as a data URI.');
const TranscribeOutputSchema = z.string().describe('The transcribed text from the audio.');

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
    const { text } = await ai.generate({
      model: googleAI.model('gemini-1.5-flash'),
      prompt: [
        { text: 'Transcribe the following audio recording of a shopping list. The audio is in Indian English.' },
        { media: { url: audioDataUri } },
      ],
      config: {
        temperature: 0.1,
      },
    });

    return text;
  }
);
