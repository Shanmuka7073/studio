import { initializeApp, getApps, getApp, type App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { firebaseConfig } from './config';

// This is a server-only file.
// It initializes the Firebase Admin SDK.

function getSdks(firebaseApp: App) {
  return {
    firebaseApp,
    firestore: getFirestore(firebaseApp),
  };
}

export function initializeAdminFirebase() {
  if (!getApps().length) {
    // When running on App Hosting, the config is automatically provided.
    // In other environments, we'll use the config from the client.
    const app = initializeApp(
      process.env.FIREBASE_CONFIG ? undefined : { projectId: firebaseConfig.projectId }
    );
    return getSdks(app);
  } else {
    return getSdks(getApp());
  }
}
