
'use client';
import type { Metadata } from 'next';
import './globals.css';
import { PT_Sans } from 'next/font/google';
import { cn } from '@/lib/utils';
import { Toaster } from '@/components/ui/toaster';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { CartProvider } from '@/lib/cart';
import { FirebaseClientProvider } from '@/firebase';
import { NotificationPermissionManager } from '@/components/layout/notification-permission-manager';
import { usePathname } from 'next/navigation';
import { VoiceCommander } from '@/components/layout/voice-commander';
import { useState } from 'react';
import { VoiceOrderDialog, type VoiceOrderInfo } from '@/components/voice-order-dialog';
import { ProfileCompletionChecker } from '@/components/profile-completion-checker';

const ptSans = PT_Sans({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-pt-sans',
});


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('Click the mic to start listening.');
  const [suggestedCommands, setSuggestedCommands] = useState<any[]>([]);
  const [voiceOrderInfo, setVoiceOrderInfo] = useState<VoiceOrderInfo | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);


  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>LocalBasket</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=PT+Sans:ital,wght@0,400;0,700;1,400;1,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className={cn(
          'min-h-screen bg-background font-body antialiased',
          ptSans.variable
        )}
      >
        <FirebaseClientProvider>
          <CartProvider>
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
                  onVoiceOrder={setVoiceOrderInfo}
                  onOpenCart={() => setIsCartOpen(true)}
                  onCloseCart={() => setIsCartOpen(false)}
                  isCartOpen={isCartOpen}
                />
                {voiceOrderInfo && (
                  <VoiceOrderDialog
                    isOpen={!!voiceOrderInfo}
                    onClose={() => setVoiceOrderInfo(null)}
                    orderInfo={voiceOrderInfo}
                  />
                )}
                <ProfileCompletionChecker />
                <main className="flex-1 pb-10">{children}</main>
                <NotificationPermissionManager />
                <Footer />
              </div>
              <Toaster />
          </CartProvider>
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
