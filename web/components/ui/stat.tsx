import * as React from 'react';
import { cn } from '@/lib/utils';

interface StatProps {
  label: string;
  value: React.ReactNode;
  /** 与上一周期对比的变化（百分比，已经计算好） */
  delta?: number;
  /** 在数字旁边的小符号（例如 'ms', '%'） */
  unit?: string;
  /** 描述这个指标的小白用语 */
  hint?: string;
  /** 顶部的迷你 spark/icon */
  topRight?: React.ReactNode;
  /** 下方插槽（迷你图等） */
  children?: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function Stat({
  label,
  value,
  delta,
  unit,
  hint,
  topRight,
  children,
  className,
  size = 'md',
}: StatProps) {
  const isPositive = delta !== undefined && delta >= 0;
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-center justify-between">
        <span className="label">{label}</span>
        {topRight}
      </div>
      <div className="flex items-baseline gap-2 mt-1">
        <span
          className={cn(
            'display tracking-tight font-light text-ink-800',
            size === 'sm' && 'text-[1.6rem]',
            size === 'md' && 'text-[2.2rem] lg:text-[2.6rem]',
            size === 'lg' && 'text-[3rem] lg:text-[3.4rem]',
            'leading-none'
          )}
        >
          {value}
        </span>
        {unit && <span className="text-sm text-ink-400 font-mono">{unit}</span>}
      </div>
      <div className="flex items-center gap-2 mt-1.5">
        {delta !== undefined && (
          <span
            className={cn(
              'font-mono text-2xs px-1 py-px rounded-sm',
              isPositive ? 'bg-oxide-100 text-oxide-600' : 'bg-ember-100 text-ember-500'
            )}
          >
            {isPositive ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}%
          </span>
        )}
        {hint && <span className="text-xs text-ink-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
