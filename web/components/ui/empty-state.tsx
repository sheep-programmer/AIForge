import * as React from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  variant?: 'panel' | 'inline';
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  variant = 'panel',
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        variant === 'panel' && 'py-16 px-8 rounded-md border border-dashed border-ink-200/70 bg-parchment-100/60',
        variant === 'inline' && 'py-8',
        className
      )}
    >
      {icon && (
        <div className="mb-4 w-12 h-12 rounded-md bg-ink-800 text-parchment-50 inline-flex items-center justify-center shadow-elevate">
          {icon}
        </div>
      )}
      <h3 className="display text-xl text-ink-800 font-normal tracking-tight">{title}</h3>
      {description && (
        <p className="mt-2 text-sm text-ink-400 max-w-md leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
