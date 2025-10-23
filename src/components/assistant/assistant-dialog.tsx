
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
  const {
    isListening,
    isThinking,
    isSpeaking,
    conversation,
    isAssistantOpen,
    toggleAssistant,
  } = useAssistant();

  const getStatusText = () => {
    if (isListening) return 'Listening...';
    if (isThinking) return 'Thinking...';
    if (isSpeaking) return 'Speaking...';
    return 'Hi! How can I help you shop?';
  };

  return (
      <Dialog open={isAssistantOpen} onOpenChange={toggleAssistant}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot />
              AI Shopping Assistant
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div
              className={`text-center p-4 rounded-lg transition-colors duration-300 ${
                isListening ? 'bg-destructive/20' : 'bg-muted'
              }`}
            >
              <p className="font-medium">{getStatusText()}</p>
            </div>
            <ScrollArea className="h-48 w-full pr-4">
                <div className="space-y-4">
                    {conversation.map((entry, index) => (
                        <div key={index} className="flex items-start gap-3">
                            {entry.speaker === 'user' ? (
                                <User className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                            ) : (
                                <Bot className="h-5 w-5 text-primary flex-shrink-0" />
                            )}
                            <p className="text-sm border rounded-lg p-2 bg-background">{entry.text}</p>
                        </div>
                    ))}
                </div>
            </ScrollArea>
          </div>
          <DialogFooter className="justify-center">
            <Button
              onClick={toggleAssistant}
              variant={isListening ? 'destructive': 'outline'}
              className="w-24"
              disabled={isSpeaking || isThinking}
            >
              {isListening ? (
                <>
                  <Mic className="mr-2 h-5 w-5" /> Stop
                </>
              ) : (
                <>
                  <X className="mr-2 h-5 w-5" /> Close
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
  );
}
