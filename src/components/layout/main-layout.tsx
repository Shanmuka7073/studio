'use client';

import { useState } from 'react';
import { useCart } from '@/lib/cart';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { VoiceCommander } from '@/components/layout/voice-commander';
import { ProfileCompletionChecker } from '@/components/profile-completion-checker';
import { NotificationPermissionManager } from '@/components/layout/notification-permission-manager';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function StoreMismatchDialog() {
    const { mismatchedStoreInfo, confirmClearCart, cancelClearCart } = useCart();
    
    if (!mismatchedStoreInfo) {
        return null;
    }

    const { product } = mismatchedStoreInfo;

    return (
        <AlertDialog open={!!mismatchedStoreInfo} onOpenChange={(open) => !open && cancelClearCart()}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Start a New Cart?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Your cart currently has items from a different store. You can only order from one store at a time.
                        <br /><br />
                        Would you like to clear your current cart and start a new one with items from <strong>{product.storeId}</strong>?
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={cancelClearCart}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={confirmClearCart}>Clear Cart & Add</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

export function MainLayout({ children }: { children: React.ReactNode }) {
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('Click the mic to start listening.');
  const [suggestedCommands, setSuggestedCommands] = useState<any[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);

  return (
    <div className="relative flex min-h-dvh flex-col bg-background">
      <Header 
        voiceEnabled={voiceEnabled}
        onToggleVoice={() => setVoiceEnabled(prev => !prev)}
        voiceStatus={voiceStatus}
        suggestedCommands={suggestedCommands}
        isCartOpen={isCartOpen}
        onCartOpenChange={setIsCartOpen}
      />
      <VoiceCommander 
        enabled={voiceEnabled} 
        onStatusUpdate={setVoiceStatus}
        onSuggestions={setSuggestedCommands}
        onOpenCart={() => setIsCartOpen(true)}
        onCloseCart={() => setIsCartOpen(false)}
        isCartOpen={isCartOpen}
      />
      <ProfileCompletionChecker />
      <StoreMismatchDialog />
      <main className="flex-1 pb-10">{children}</main>
      <NotificationPermissionManager />
      <Footer />
    </div>
  );
}
