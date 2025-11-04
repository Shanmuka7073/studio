
'use client';

import { useState, createContext, useContext, useCallback } from 'react';
import { useCart } from '@/lib/cart';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { VoiceCommander } from '@/components/layout/voice-commander';
import { ProfileCompletionChecker } from '@/components/profile-completion-checker';
import { NotificationPermissionManager } from '@/components/layout/notification-permission-manager';

// Create a context to provide the trigger function
const VoiceCommandContext = createContext<{ triggerVoicePrompt: () => void } | undefined>(undefined);

export function useVoiceCommander() {
    const context = useContext(VoiceCommandContext);
    if (!context) {
        throw new Error('useVoiceCommander must be used within a MainLayout');
    }
    return context;
}

export function MainLayout({ children }: { children: React.ReactNode }) {
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('Click the mic to start listening.');
  const [suggestedCommands, setSuggestedCommands] = useState<any[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const { cartItems } = useCart();

  // State to trigger re-evaluation in VoiceCommander
  const [voiceTrigger, setVoiceTrigger] = useState(0);
  
  // Stable callback to trigger the voice prompt check
  const triggerVoicePrompt = useCallback(() => {
    setVoiceTrigger(v => v + 1);
  }, []);

  return (
    <VoiceCommandContext.Provider value={{ triggerVoicePrompt }}>
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
            cartItems={cartItems}
            voiceTrigger={voiceTrigger}
        />
        <ProfileCompletionChecker />
        <main className="flex-1 pb-10">{children}</main>
        <NotificationPermissionManager />
        <Footer />
        </div>
    </VoiceCommandContext.Provider>
  );
}

    