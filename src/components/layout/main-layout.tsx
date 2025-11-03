
'use client';

import { useState } from 'react';
import { useCart } from '@/lib/cart';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { VoiceCommander } from '@/components/layout/voice-commander';
import { ProfileCompletionChecker } from '@/components/profile-completion-checker';
import { NotificationPermissionManager } from '@/components/layout/notification-permission-manager';
import { LanguageDetector } from '@/components/layout/language-detector';

export function MainLayout({ children }: { children: React.ReactNode }) {
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('Click the mic to start listening.');
  const [suggestedCommands, setSuggestedCommands] = useState<any[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const { cartItems } = useCart(); // Get cart items here

  return (
    <div className="relative flex min-h-dvh flex-col bg-background">
      <LanguageDetector />
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
        cartItems={cartItems} // Pass cart items as a prop
      />
      <ProfileCompletionChecker />
      <main className="flex-1 pb-10">{children}</main>
      <NotificationPermissionManager />
      <Footer />
    </div>
  );
}
