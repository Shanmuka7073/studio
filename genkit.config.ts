import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';
import { googleCloud } from '@genkit-ai/google-cloud';

export default genkit({
  plugins: [
    googleAI(),
    googleCloud(), // Add the googleCloud plugin for server-side authentication
  ],
  logLevel: 'debug',
  enableTracingAndMetrics: true,
});
