'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  cn(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md',
    'text-sm font-medium transition-colors focus-ring',
    'disabled:pointer-events-none disabled:opacity-40'
  ),
  {
    variants: {
      variant: {
        primary:
          'bg-ink-800 text-parchment-50 hover:bg-ink-700 shadow-elevate',
        secondary:
          'bg-card text-ink-700 border border-ink-100/80 hover:bg-parchment-200',
        ghost: 'text-ink-500 hover:text-ink-800 hover:bg-ink-100/50',
        oxide:
          'bg-oxide-500 text-parchment-50 hover:bg-oxide-600 shadow-elevate ring-1 ring-oxide-600/20',
        outline:
          'border border-ink-300/50 text-ink-700 hover:bg-parchment-200 hover:border-ink-300',
        danger: 'bg-ember-500 text-parchment-50 hover:bg-ember-500/90',
        link: 'text-oxide-500 hover:text-oxide-600 underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-7 px-2.5 text-xs',
        md: 'h-9 px-3.5',
        lg: 'h-11 px-5 text-[0.95rem]',
        icon: 'h-9 w-9',
        'icon-sm': 'h-7 w-7',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
);

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { buttonVariants };
