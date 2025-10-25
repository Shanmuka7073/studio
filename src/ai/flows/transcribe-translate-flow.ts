
'use server';
/**
 * @fileOverview A flow to transcribe user voice audio and translate it into a structured bilingual shopping list.
 *
 * - transcribeAndTranslate - Takes an audio data URI and returns the original transcription and a formatted list.
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
  return await transcribeAndTranslateFlow({ audioDataUri });
}


const transcribeAndTranslateFlow = ai.defineFlow(
  {
    name: 'transcribeAndTranslateFlow',
    inputSchema: transcribeInputSchema,
    outputSchema: transcribeOutputSchema.nullable(),
  },
  async ({ audioDataUri }) => {
    // 1. Transcribe the audio
    const { text: transcription } = await ai.generate({
        model: googleAI.model('gemini-1.5-flash-latest'),
        prompt: [{ media: { url: audioDataUri } }, { text: 'Transcribe this audio. It is a person listing grocery items.' }],
    });


    if (!transcription) {
      console.error('Transcription failed.');
      return null;
    }


    // 2. Translate and format the list
    const listGenPrompt = `You are a shopping assistant. Take the following raw text, which is a transcription of a user's shopping list, and format it into a clear, bilingual list for a shopkeeper in India.

    - Each item should be on a new line.
    - Provide the English name first, followed by the Hindi name in parentheses. For example: "Onions (प्याज)".
    - Correct any minor transcription errors and consolidate quantities. For example, "two kgs of potatoes" should become "Potatoes 2kg".
    - If you cannot determine the language or content, return an empty string.

    Raw Text: "${transcription}"

    Formatted Bilingual List:`;


    const { text: bilingualList } = await ai.generate({
      model: googleAI.model('gemini-1.5-flash-latest'),
      prompt: listGenPrompt,
      config: { temperature: 0.1 },
    });


    if (!bilingualList) {
        console.error('Bilingual list generation failed.');
        return null;
    }


    return {
      transcription,
      bilingualList,
    };
  }
);
