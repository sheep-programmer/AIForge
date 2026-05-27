'use client';

// 时间范围 segmented control + chip 行控件。
// 把 chip / RangeControl 都抽出来，避免 page 太长。

import { cn } from '@/lib/utils';

export type RangeKey = '24h' | '7d' | '30d' | '90d';
export const RANGES: { key: RangeKey; label: string }[] = [
  { key: '24h', label: '24 时' },
  { key: '7d', label: '7 天' },
  { key: '30d', label: '30 天' },
  { key: '90d', label: '90 天' },
];

export function RangeControl({
  value,
  onChange,
}: {
  value: RangeKey;
  onChange: (v: RangeKey) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="时间范围"
      className="inline-flex p-0.5 rounded-md border border-ink-100/80 bg-card"
    >
      {RANGES.map((r) => {
        const active = r.key === value;
        return (
          <button
            key={r.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(r.key)}
            className={cn(
              'h-7 px-2.5 rounded text-2xs font-mono uppercase tracking-wider transition',
              active
                ? 'bg-ink-800 text-parchment-50 shadow-elevate'
                : 'text-ink-500 hover:text-ink-800 hover:bg-parchment-200'
            )}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}

export function Chip({
  active,
  onClick,
  label,
  mono,
  danger,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  mono?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center h-6 px-2 rounded-sm text-2xs transition border',
        mono && 'font-mono',
        active
          ? danger
            ? 'bg-ember-500 text-parchment-50 border-ember-500'
            : 'bg-oxide-500 text-parchment-50 border-oxide-500'
          : 'bg-card text-ink-500 border-ink-100/80 hover:bg-parchment-200 hover:text-ink-800'
      )}
    >
      {label}
    </button>
  );
}
