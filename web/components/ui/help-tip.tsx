'use client';

import * as React from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HelpTipProps {
  /** 给小白看的解释。可包含 ReactNode */
  children: React.ReactNode;
  className?: string;
  inline?: boolean;
}

export function HelpTip({ children, className, inline }: HelpTipProps) {
  return (
    <Tooltip.Provider delayDuration={120}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            aria-label="说明"
            className={cn(
              'inline-flex items-center justify-center rounded',
              inline ? 'w-3.5 h-3.5 align-baseline' : 'w-4 h-4',
              'text-ink-300 hover:text-ink-700 transition focus-ring',
              className
            )}
          >
            <HelpCircle className={cn(inline ? 'w-3 h-3' : 'w-3.5 h-3.5')} />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            sideOffset={6}
            className={cn(
              'z-50 max-w-[280px] rounded-md bg-ink-800 text-parchment-50',
              'px-3 py-2 text-2xs leading-relaxed shadow-elevate',
              'data-[state=delayed-open]:animate-fade-up'
            )}
          >
            {children}
            <Tooltip.Arrow className="fill-ink-800" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
