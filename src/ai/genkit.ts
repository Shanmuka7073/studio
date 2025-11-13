
'use server';
// This file is the single source of truth for Genkit AI-related configuration.
// It is used by the /api/genkit route to expose flows to the Genkit developer UI.
// It is also used by the app to call flows.

import {genkit, AIMiddleware} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';
import {firebase} from '@genkit-ai/firebase';
import { googleCloud } from '@genkit-ai/google-cloud';

// A middleware to add the current user's uid to the flow's input metadata.
const addUserContext: AIMiddleware = async (input, next) => {
  const { auth } = await import('@/firebase/server-init');
  const { cookies } = await import('next/headers');
  const sessionCookie = cookies().get('__session')?.value;
  if (sessionCookie) {
    try {
      const decodedIdToken = await auth.verifySessionCookie(sessionCookie);
      input.metadata = { ...input.metadata, uid: decodedIdToken.uid };
    } catch (e) {
      console.warn('Could not verify session cookie. User will be anonymous.', e);
    }
  }
  return next(input);
};

export const ai = genkit({
  plugins: [
    firebase(), // For Firestore state store
    googleAI({
      // You must also set the GEMINI_API_KEY environment variable.
      // You can get a key from Google AI Studio.
      // https://aistudio.google.com/app/apikey
    }),
    googleCloud({
      // You must also set the GCLOUD_PROJECT environment variable.
    }),
  ],
  flowStateStore: 'firebase',
  traceStore: 'firebase',
  // Open up all flows to the public. You should not do this in production.
  // In production, you would want to use a more secure policy, e.g.
  // to only allow authenticated users to run flows.
  policy: {
    run: {
      action: 'allow',
      subjects: 'all',
      conditions: [],
    },
    // Add addUserContext middleware to all flows.
    use: [addUserContext],
  },
  logLevel: 'debug',
  enableTracingAndMetrics: true,
});
