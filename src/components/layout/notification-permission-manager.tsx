'use client';

import { useEffect } from 'react';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { useFirebase, errorEmitter } from '@/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { FirestorePermissionError } from '@/firebase/errors';

export function NotificationPermissionManager() {
  const { firebaseApp, user, firestore } = useFirebase();
  const { toast } = useToast();

  useEffect(() => {
    const requestPermission = async () => {
      if (!firebaseApp || !user || !firestore) return;

      const messagingSupported = await isSupported();
      if (!messagingSupported) {
        console.warn('Firebase Messaging is not supported in this browser.');
        return;
      }

      const messaging = getMessaging(firebaseApp);

      // Check if permission has already been granted
      if (Notification.permission === 'granted') {
        // If we already have permission, try to get the token silently.
        try {
          const currentToken = await getToken(messaging, {
            vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
          });

          if (currentToken) {
            // Save the token to Firestore
            const userDocRef = doc(firestore, 'users', user.uid);
            updateDoc(userDocRef, { fcmToken: currentToken }).catch(e => {
                const permissionError = new FirestorePermissionError({
                    path: userDocRef.path,
                    operation: 'update',
                    requestResourceData: { fcmToken: currentToken },
                });
                errorEmitter.emit('permission-error', permissionError);
            });
          }
        } catch (err) {
          console.error('An error occurred while retrieving token. ', err);
          toast({
            variant: 'destructive',
            title: 'Could Not Get Notification Token',
            description: 'Please try enabling notifications again.',
          });
        }
        return;
      }

      // If permission is not granted, we might want to prompt the user.
      // This can be done via a button in the UI. For now, we'll log it.
      if (Notification.permission === 'default') {
        console.log('User has not yet granted or denied notification permission.');
        // Here you could show a UI element to prompt the user to click a button
        // that calls a function to request permission.
      }
    };

    requestPermission();
  }, [firebaseApp, user, firestore, toast]);

  // This component does not render anything.
  // A UI component with a button could be used to actively ask the user.
  return null;
}
