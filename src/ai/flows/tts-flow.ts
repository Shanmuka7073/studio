
'use server';
/**
 * @fileOverview A flow for Text-to-Speech conversion.
 *
 * - textToSpeech - Converts a string of text into an audio data URI.
 */

import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/google-genai';
import { z } from 'genkit';
import wav from 'wav';

const TTSInputSchema = z.string();
const TTSOutputSchema = z.string().describe("An audio data URI in WAV format.");

export async function textToSpeech(text: string): Promise<string> {
    const response = await ttsFlow(text);
    return response.media;
}

async function toWav(
  pcmData: Buffer,
  channels = 1,
  rate = 24000,
  sampleWidth = 2
): Promise<string> {
  return new Promise((resolve, reject) => {
    const writer = new wav.Writer({
      channels,
      sampleRate: rate,
      bitDepth: sampleWidth * 8,
    });

    let bufs: any[] = [];
    writer.on('error', reject);
    writer.on('data', function (d) {
      bufs.push(d);
    });
    writer.on('end', function () {
      resolve(Buffer.concat(bufs).toString('base64'));
    });

    writer.write(pcmData);
    writer.end();
  });
}

const ttsFlow = ai.defineFlow(
    {
        name: 'ttsFlow',
        inputSchema: TTSInputSchema,
        outputSchema: z.object({ media: TTSOutputSchema }),
    },
    async (query) => {
        const { media } = await ai.generate({
            model: googleAI.model('tts-1'),
            config: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Algenib' },
                    },
                },
            },
            prompt: query,
        });

        if (!media) {
            throw new Error('No media returned from TTS model.');
        }

        const audioBuffer = Buffer.from(
            media.url.substring(media.url.indexOf(',') + 1),
            'base64'
        );

        const wavBase64 = await toWav(audioBuffer);

        return {
            media: 'data:audio/wav;base64,' + wavBase64,
        };
    }
);
