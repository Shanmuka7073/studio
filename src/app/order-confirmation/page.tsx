'use client'
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { CheckCircle } from 'lucide-react';

export default function OrderConfirmationPage() {
  // In a real app, you'd fetch order details using an ID from the URL.
  // For now, we'll just show a generic success message.
  
  useEffect(() => {
    // Function to play a confirmation sound
    const playConfirmationSound = () => {
      // Use a try-catch block in case AudioContext is not supported or blocked
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        if (!audioContext) return;

        // Create a simple, pleasant tone
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);

        // A short, rising two-tone melody
        oscillator.frequency.setValueAtTime(600, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.05);

        oscillator.frequency.setValueAtTime(900, audioContext.currentTime + 0.1);

        oscillator.start();
        
        gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.5);
        oscillator.stop(audioContext.currentTime + 0.5);
      } catch (error) {
        console.error("Could not play confirmation sound:", error);
      }
    };

    playConfirmationSound();
  }, []); // Empty dependency array ensures this runs only once on mount

  return (
    <div className="container mx-auto py-12 px-4 md:px-6">
      <Card className="max-w-2xl mx-auto">
        <CardHeader className="text-center">
          <div className="mx-auto bg-primary/20 p-3 rounded-full w-fit mb-4">
            <CheckCircle className="h-12 w-12 text-primary" />
          </div>
          <CardTitle className="text-3xl font-headline">Thank You For Your Order!</CardTitle>
          <p className="text-muted-foreground">Your order has been placed successfully.</p>
        </CardHeader>
        <CardContent className="text-center space-y-6">
          <p>
            You will receive an email confirmation shortly with your order details.
            You can view your order status in the dashboard.
          </p>
          <div className="flex gap-4 justify-center">
            <Button asChild>
              <Link href="/stores">Continue Shopping</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard/customer/my-orders">View Orders</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
