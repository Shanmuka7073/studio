
'use client';

import { useEffect, useState, useMemo } from 'react';
import { useFirebase, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { User as AppUser } from '@/lib/types';
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
    if (isUserLoading || isProfileLoading) {
      return;
    }

    if (!user || sessionStorage.getItem(SESSION_STORAGE_KEY) === 'true') {
      return;
    }
    
    const isProfileIncomplete = 
        !userData || 
        !userData.firstName || 
        !userData.lastName || 
        !userData.address || 
        !userData.phoneNumber;

    if (isProfileIncomplete) {
      setShowPrompt(true);
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
