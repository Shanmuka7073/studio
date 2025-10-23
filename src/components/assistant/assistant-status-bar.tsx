
'use client';

import { Mic, Bot, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AssistantStatus } from './assistant-provider';

interface AssistantStatusBarProps {
    status: AssistantStatus;
    lastBotResponse: string;
}

const statusInfo = {
    idle: {
        Icon: Mic,
        text: 'Listening...',
        color: 'bg-green-500/20 text-green-300',
        pulse: false,
    },
    listening: {
        Icon: Mic,
        text: 'Listening...',
        color: 'bg-destructive/80 text-destructive-foreground',
        pulse: true,
    },
    thinking: {
        Icon: Loader2,
        text: 'Thinking...',
        color: 'bg-blue-500/80 text-blue-100',
        pulse: true,
    },
    speaking: {
        Icon: Bot,
        text: 'Speaking...',
        color: 'bg-purple-500/80 text-purple-100',
        pulse: false,
    }
}

export function AssistantStatusBar({ status, lastBotResponse }: AssistantStatusBarProps) {
    const { Icon, text, color, pulse } = statusInfo[status];
    const displayText = status === 'speaking' ? lastBotResponse : text;

    return (
        <div className={cn(
            "fixed bottom-0 left-0 right-0 h-10 flex items-center justify-center text-sm font-medium z-50 transition-all duration-300",
            color
        )}>
            <div className="flex items-center gap-3">
                <Icon className={cn("h-5 w-5", pulse && "animate-pulse")} />
                <span className="truncate max-w-[calc(100vw-100px)]">{displayText}</span>
            </div>
        </div>
    );
}
