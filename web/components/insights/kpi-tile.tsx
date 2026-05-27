'use client';

// Insights 页面专用的 KPI 单元：比 dashboard 用的 Stat 更紧凑，自带可选 HelpTip。

import { HelpTip } from '@/components/ui/help-tip';
import { cn } from '@/lib/utils';

interface KpiTileProps {
  label: string;
  value: string;
  unit?: string;
  delta?: number;
  hint?: string;
  tone?: 'oxide' | 'amber' | 'ember';
  help?: string;
}

export function KpiTile({ label, value, unit, delta, hint, tone, help }: KpiTileProps) {
  const toneClass = {
    oxide: 'text-oxide-600',
    amber: 'text-amber-500',
    ember: 'text-ember-500',
  } as const;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="label inline-flex items-center gap-1">
          {label}
          {help && <HelpTip inline>{help}</HelpTip>}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5 mt-1">
        <span
          className={cn(
            'display tracking-tight font-light leading-none text-[1.7rem] lg:text-[2rem]',
            tone ? toneClass[tone] : 'text-ink-800'
          )}
        >
          {value}
        </span>
        {unit && <span className="text-xs text-ink-400 font-mono">{unit}</span>}
      </div>
      <div className="flex items-center gap-2 mt-1">
        {delta !== undefined && (
          <span
            className={cn(
              'font-mono text-[0.55rem] px-1 py-px rounded-sm',
              delta >= 0 ? 'bg-oxide-100 text-oxide-600' : 'bg-ember-100 text-ember-500'
            )}
          >
            {delta >= 0 ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}%
          </span>
        )}
        {hint && <span className="text-[0.65rem] text-ink-400 truncate">{hint}</span>}
      </div>
    </div>
  );
}
