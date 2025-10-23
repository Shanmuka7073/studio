'use server';
/**
 * @fileOverview A Genkit flow to transcribe and translate audio.
 * 
 * - transcribeAndTranslateAudio: Takes an audio data URI, transcribes it,
 *   and translates the text into a bilingual (English/Telugu) list.
 */

import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/google-genai';
import { z } from 'genkit';

const AudioInputSchema = z.string().describe(
    "An audio recording as a data URI. Expected format: 'data:audio/<format>;base64,<encoded_data>'."
);

const TranslationOutputSchema = z.string().describe(
    "A formatted string containing the shopping list in English and Telugu."
);

export async function transcribeAndTranslateAudio(audioDataUri: string): Promise<string> {
    return transcribeAndTranslateAudioFlow(audioDataUri);
}

// Define the main flow
const transcribeAndTranslateAudioFlow = ai.defineFlow(
    {
        name: 'transcribeAndTranslateAudioFlow',
        inputSchema: AudioInputSchema,
        outputSchema: TranslationOutputSchema,
    },
    async (audioDataUri) => {
        // Step 1: Transcribe the audio to text
        const { text: transcribedText } = await ai.generate({
            model: googleAI.model('gemini-1.5-flash-latest'),
            prompt: [{ media: { url: audioDataUri } }, { text: "Transcribe the spoken words in this audio. Output only the text." }],
        });

        if (!transcribedText) {
            throw new Error('Transcription failed or returned empty text.');
        }

        // Step 2: Translate the transcribed text into a structured bilingual list
        const { text: translatedList } = await ai.generate({
            model: googleAI.model('gemini-1.5-flash-latest'),
            prompt: `You are a helpful shopping assistant. You will be given a transcribed text of a shopping list.
            
            Your task is to:
            1. Identify each distinct item in the list.
            2. For each item, provide its name in English.
            3. For each item, provide its name in Telugu.
            4. Format the output as a clean, readable list, with each item on a new line. Use the format: "English Name - తెలుగు పేరు"

            Example:
            Input Text: "I need apples, bread, and one dozen eggs"
            Output:
            Apples - ఆపిల్స్
            Bread - బ్రెడ్
            Eggs - గుడ్లు

            Transcribed Text:
            ${transcribedText}`,
            config: {
                // Higher temperature for more creative/accurate translation of colloquial terms
                temperature: 0.7,
            },
        });

        return translatedList || "Translation failed.";
    }
);
