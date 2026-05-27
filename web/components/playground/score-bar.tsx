'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface ScoreBarProps {
  /** 0-1 范围内的分数。会按 0-100 显示。 */
  score: number;
  className?: string;
  /** 可选：覆盖右侧数字呈现 */
  showValue?: boolean;
}

/**
 * 0-100 分数可视化条。
 * - 整段轨道含 25/50/75 刻度
 * - oxide 填充
 * - 右侧显示 0-100 整数
 */
export function ScoreBar({ score, className, showValue = true }: ScoreBarProps) {
  const clamped = Math.max(0, Math.min(1, score));
  const pct = Math.round(clamped * 100);

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div
        className="relative h-1.5 flex-1 rounded-sm bg-ink-100 overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {/* tick marks at 25 / 50 / 75 */}
        {[25, 50, 75].map((t) => (
          <span
            key={t}
            aria-hidden
            className="absolute top-0 bottom-0 w-px bg-parchment-50/80"
            style={{ left: `${t}%` }}
          />
        ))}
        <span
          className={cn(
            'absolute inset-y-0 left-0 rounded-sm',
            pct >= 70
              ? 'bg-oxide-500'
              : pct >= 40
                ? 'bg-oxide-400'
                : 'bg-amber-500'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showValue && (
        <span
          className={cn(
            'num text-2xs tabular-nums shrink-0 w-9 text-right',
            pct >= 70 ? 'text-oxide-600' : pct >= 40 ? 'text-oxide-500' : 'text-amber-500'
          )}
        >
          {pct}
        </span>
      )}
    </div>
  );
}
