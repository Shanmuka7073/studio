
'use client';

import { Mic, Loader, Bot, User, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useAssistant } from './assistant-provider';
import { ScrollArea } from '../ui/scroll-area';

export function AssistantDialog() {
  // This component is no longer used in the new ambient design.
  // It is kept for potential future use or reference but is not rendered.
  const {
    isAssistantOpen,
    toggleAssistant,
  } = useAssistant();

  if (!isAssistantOpen) {
    return null;
  }

  return (
      <Dialog open={isAssistantOpen} onOpenChange={toggleAssistant}>
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
              onClick={toggleAssistant}
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
