import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';
import { googleCloud } from '@genkit-ai/google-cloud';

// This instance is used by client-side components and server-side flows.
// The configuration is centralized in genkit.config.ts
export const ai = genkit();
