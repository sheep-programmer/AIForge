'use client';

import { Rows2, Rows3 } from 'lucide-react';
import { useDensity } from './density-context';
import { cn } from '@/lib/utils';

export function DensityToggle({ className }: { className?: string }) {
  const { density, toggle } = useDensity();
  const compact = density === 'compact';
  const Icon = compact ? Rows3 : Rows2;
  const label = compact ? '切到舒适' : '切到紧凑';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={cn(
        'hidden md:inline-flex items-center justify-center w-9 h-9 rounded-md',
        'bg-card border border-ink-100/80 text-ink-400 hover:text-ink-800 hover:bg-parchment-200 transition',
        className
      )}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}
