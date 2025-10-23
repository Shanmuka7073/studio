
'use client';

import { Mic, Bot, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useAssistant } from './assistant-provider';

export function AssistantDialog() {
  // This component is no longer used in the new ambient design.
  // It is kept for potential future use or reference but is not rendered.
  
  // A hypothetical way to open/close this might be needed if it were to be reused.
  const isOpen = false; 
  const close = () => {};

  if (!isOpen) {
    return null;
  }

  return (
      <Dialog open={isOpen} onOpenChange={close}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot />
              AI Shopping Assistant
            </DialogTitle>
          </DialogHeader>
          <p>This dialog is no longer the primary interface.</p>
          <DialogFooter className="justify-center">
            <Button
              onClick={close}
              variant={'outline'}
              className="w-24"
            >
                <X className="mr-2 h-5 w-5" /> Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
  );
}
