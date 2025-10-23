'use client';

import { Mic, Loader, Bot, User } from 'lucide-react';
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
    <>
      <Button
        onClick={toggleAssistant}
        variant={isAssistantOpen ? 'default' : 'outline'}
        size="icon"
        className="rounded-full w-10 h-10 bg-accent text-accent-foreground hover:bg-accent/90"
      >
        <Mic className="h-5 w-5" />
        <span className="sr-only">Toggle AI Assistant</span>
      </Button>
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
              className={`text-center p-4 rounded-lg ${
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
          <DialogFooter>
            <Button
              onClick={toggleAssistant}
              variant="outline"
              disabled={isSpeaking || isThinking}
            >
              {isListening ? 'Stop Listening' : 'Close'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
