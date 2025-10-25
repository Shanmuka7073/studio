
'use client';

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
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, List } from 'lucide-react';

interface VoiceOrderConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  list: string;
  audioDataUri: string | null;
  listTitle: string;
  isRecipe: boolean;
}

export function VoiceOrderConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  onCancel,
  list,
  audioDataUri,
  listTitle,
  isRecipe
}: VoiceOrderConfirmationDialogProps) {
  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
             <List className="h-6 w-6 text-primary" />
             Confirm Your Shopping List
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isRecipe 
              ? `I've prepared a list of ingredients for ${listTitle.replace('Ingredients for ', '')}. Review it below.`
              : 'I listened to your voice memo and transcribed the following list. Please review it before placing the order.'
            }
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <div className="grid gap-4 py-4 pr-6">
            <div className="rounded-lg border bg-muted/50 p-4">
                <h3 className="font-semibold mb-2">{listTitle}</h3>
                <ScrollArea className="h-48">
                    <pre className="text-sm whitespace-pre-wrap font-sans">
                        {list}
                    </pre>
                </ScrollArea>
            </div>
            {audioDataUri && (
                <div>
                    <h3 className="font-semibold text-sm mb-2">Your Voice Memo</h3>
                    <audio src={audioDataUri} controls className="w-full" />
                </div>
            )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="outline" onClick={onCancel}>Cancel</Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button onClick={onConfirm}><Check className="mr-2 h-4 w-4" />Confirm & Place Order</Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
