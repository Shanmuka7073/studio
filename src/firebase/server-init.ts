
import { initializeApp, getApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

/**
 * Initializes the Firebase Admin SDK, reusing the existing app instance if available.
 * This function is intended for server-side use only. It automatically handles credentials
 * in a Firebase/Google Cloud environment (like App Hosting or Cloud Functions) and falls
 * back to a local service account file for local development.
 *
 * @returns An object containing the initialized Firebase Admin app, Firestore, and Auth services.
 */
export async function initServerApp() {
  // Check if an app is already initialized to prevent re-initialization errors.
  if (getApps().length > 0) {
    const existingApp = getApp();
    return {
      firebaseAdminApp: existingApp,
      firestore: getFirestore(existingApp),
      auth: getAuth(existingApp),
    };
  }

  // The GOOGLE_APPLICATION_CREDENTIALS environment variable will be used automatically
  // by initializeApp() if it is set. In Firebase App Hosting, this is handled for you.
  // For local development, you would set this variable to point to your service account JSON file.
  // Example for local .env.local:
  // GOOGLE_APPLICATION_CREDENTIALS=./path/to/your/service-account-key.json
  const app = initializeApp();

  return {
    firebaseAdminApp: app,
    firestore: getFirestore(app),
    auth: getAuth(app),
  };
}
