'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'flex h-9 w-full rounded-md border border-ink-100 bg-card px-3 py-1.5 text-sm',
        'placeholder:text-ink-300 focus-ring transition',
        'focus:border-oxide-400/50 focus:bg-parchment-50',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[88px] w-full rounded-md border border-ink-100 bg-card px-3 py-2 text-sm',
        'placeholder:text-ink-300 focus-ring transition',
        'focus:border-oxide-400/50 focus:bg-parchment-50',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'leading-relaxed',
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = 'Textarea';
