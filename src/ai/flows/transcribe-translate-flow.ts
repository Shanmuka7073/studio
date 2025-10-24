
'use server';
/**
 * @fileOverview A flow to transcribe audio and translate the text.
 *
 * - transcribeAndTranslateAudio - Transcribes audio, then translates the text to English and a local language.
 */

import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/google-genai';
import { z } from 'genkit';

const InputSchema = z.string().describe("An audio data URI (e.g., audio/webm).");
const OutputSchema = z.string().describe("A bilingual shopping list in English and a local language.");


export async function transcribeAndTranslateAudio(audioDataUri: string): Promise<string> {
    return transcribeAndTranslateFlow(audioDataUri);
}

const transcribeAndTranslateFlow = ai.defineFlow(
  {
    name: 'transcribeAndTranslateFlow',
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
  },
  async (audioDataUri) => {
    // Step 1: Transcribe audio to text
    const transcriptionResponse = await ai.generate({
      model: googleAI.model('gemini-1.5-flash'),
      prompt: [
        {
          media: {
            url: audioDataUri,
            contentType: 'audio/webm',
          },
        },
        { text: 'Transcribe the following audio recording of a shopping list. The audio may be in any language.' },
      ],
    });
    
    const transcribedText = transcriptionResponse.text;

    if (!transcribedText) {
      throw new Error('Failed to transcribe audio.');
    }

    // Step 2: Translate and format the text
    const translationResponse = await ai.generate({
      model: googleAI.model('gemini-1.5-flash'),
      prompt: `Translate the following shopping list into a clean, bilingual format with English on the left and Telugu on the right (e.g., "Onion - ఉల్లిపాయ"). Ensure each item is on a new line.

        Shopping List:
        "${transcribedText}"
      `,
       config: { temperature: 0.2 },
    });

    return translationResponse.text;
  }
);
