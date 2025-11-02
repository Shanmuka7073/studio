
'use client';

import { useEffect, useState } from 'react';
import { useFirebase, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import type { User as AppUser } from '@/lib/types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from './ui/button';

const SESSION_STORAGE_KEY = 'profile-prompt-dismissed';
const ADMIN_EMAIL = 'admin@gmail.com';

export function ProfileCompletionChecker() {
  const { user, isUserLoading, firestore } = useFirebase();
  const router = useRouter();
  const [showPrompt, setShowPrompt] = useState(false);

  // Memoize the document reference
  const userDocRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);

  // useDoc will fetch the user's profile data
  const { data: userData, isLoading: isProfileLoading } = useDoc<AppUser>(userDocRef);

  useEffect(() => {
    // Wait until all loading is finished.
    if (isUserLoading || isProfileLoading) {
      return;
    }

    // Don't show the prompt if the user is not logged in, is the admin, or has dismissed it this session.
    if (!user || user.email === ADMIN_EMAIL || sessionStorage.getItem(SESSION_STORAGE_KEY) === 'true') {
      return;
    }
    
    // Condition is now checked only after we're sure userData is loaded or confirmed to be null.
    const isProfileIncomplete = 
        !userData || 
        !userData.firstName || 
        !userData.lastName || 
        !userData.address || 
        !userData.phoneNumber;

    if (isProfileIncomplete) {
      setShowPrompt(true);
    } else {
      setShowPrompt(false); // Explicitly hide if profile is complete
    }
  }, [user, isUserLoading, userData, isProfileLoading]);

  const handleDismiss = () => {
    // Remember that the user dismissed the prompt for this session
    sessionStorage.setItem(SESSION_STORAGE_KEY, 'true');
    setShowPrompt(false);
  };

  const handleNavigate = () => {
    setShowPrompt(false);
    router.push('/dashboard/customer/my-profile');
  };

  return (
    <AlertDialog open={showPrompt} onOpenChange={setShowPrompt}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Welcome to LocalBasket!</AlertDialogTitle>
          <AlertDialogDescription>
            To ensure a smooth delivery experience, please complete your profile with your name, address, and phone number.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="outline" onClick={handleDismiss}>Later</Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button onClick={handleNavigate}>Complete Profile</Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
