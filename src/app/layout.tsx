
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
import { useCheckoutPassThrough } from '@/app/checkout/page';


const ptSans = PT_Sans({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-pt-sans',
});

function PageSpecificHeader() {
  const pathname = usePathname();
  const { placeOrderBtnRef, getFinalTotal } = useCheckoutPassThrough();

  if (pathname === '/checkout') {
    return <Header placeOrderBtnRef={placeOrderBtnRef} getFinalTotal={getFinalTotal} />;
  }
  return <Header />;
}


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
                <PageSpecificHeader />
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

    