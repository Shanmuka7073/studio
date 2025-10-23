import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

export default genkit({
  plugins: [
    googleAI(),
  ],
  logLevel: 'debug',
  enableTracingAndMetrics: true,
});
