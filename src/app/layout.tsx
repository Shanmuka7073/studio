'use client';
import type { Metadata } from 'next';
import './globals.css';
import { PT_Sans } from 'next/font/google';
import { cn } from '@/lib/utils';
import { Toaster } from '@/components/ui/toaster';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { CartProvider } from '@/lib/cart';
import { FirebaseClientProvider, useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { useEffect } from 'react';
import type { SiteConfig } from '@/lib/types';


const ptSans = PT_Sans({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-pt-sans',
});

// We can't use `export const metadata: Metadata` in a client component,
// so we'll update the document title using a client-side effect.
function DynamicMetadata() {
  const firestore = useFirestore();
  const siteConfigRef = useMemoFirebase(() => {
      if (!firestore) return null;
      return doc(firestore, 'config', 'site');
  }, [firestore]);

  const { data: siteConfig } = useDoc<SiteConfig>(siteConfigRef);

  useEffect(() => {
    if (siteConfig?.siteTitle) {
      document.title = siteConfig.siteTitle;
    } else {
      document.title = 'mkservices';
    }
  }, [siteConfig]);

  return null; // This component doesn't render anything.
}


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
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
          <DynamicMetadata />
          <CartProvider>
            <div className="relative flex min-h-dvh flex-col bg-background">
              <Header />
              <main className="flex-1">{children}</main>
              <Footer />
            </div>
            <Toaster />
          </CartProvider>
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
    