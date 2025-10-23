import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

export default genkit({
  plugins: [
    googleAI({
      // Specify the API version.
      apiVersion: 'v1beta',
    }),
  ],
  logLevel: 'debug',
  enableTracingAndMetrics: true,
});
