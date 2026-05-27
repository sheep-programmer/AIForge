'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import type { ArtifactType } from '@/lib/api-types';

/** 通用 badge：dotted + uppercase */
export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: 'neutral' | 'oxide' | 'navy' | 'amber' | 'ember' | 'live';
  children: React.ReactNode;
  className?: string;
}) {
  const map: Record<string, string> = {
    neutral: 'text-ink-500 bg-ink-100/70',
    oxide: 'text-oxide-600 bg-oxide-100',
    navy: 'text-navy-500 bg-navy-100',
    amber: 'text-amber-500 bg-amber-100',
    ember: 'text-ember-500 bg-ember-100',
    live: 'text-oxide-600 bg-oxide-100 ring-1 ring-oxide-200',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-1.5 h-5 rounded-sm font-mono text-2xs uppercase tracking-wider',
        map[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/** Artifact 类型徽章：圆/菱形/胶囊 三个几何符号 + 类型名 */
export function ArtifactTypeBadge({
  type,
  withLabel = true,
  className,
}: {
  type: ArtifactType;
  withLabel?: boolean;
  className?: string;
}) {
  const config: Record<ArtifactType, { label: string; symbol: React.ReactNode; ring: string }> = {
    skill: {
      label: 'SKILL',
      ring: 'text-oxide-600 bg-oxide-100',
      symbol: <span className="w-1.5 h-1.5 rounded-full bg-oxide-500" />,
    },
    mcp: {
      label: 'MCP',
      ring: 'text-navy-500 bg-navy-100',
      symbol: <span className="w-1.5 h-1.5 bg-navy-500 rotate-45" />,
    },
    plugin: {
      label: 'PLUGIN',
      ring: 'text-amber-500 bg-amber-100',
      symbol: <span className="w-2 h-1.5 rounded-full border border-current" />,
    },
  };
  const c = config[type];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 h-5 px-1.5 rounded-sm font-mono text-2xs uppercase tracking-wider',
        c.ring,
        className
      )}
    >
      {c.symbol}
      {withLabel && c.label}
    </span>
  );
}

/** 状态点：active / inactive / pending */
export function StatusDot({
  state,
  label,
}: {
  state: 'active' | 'inactive' | 'pending' | 'error';
  label?: string;
}) {
  const map = {
    active: 'bg-oxide-500 shadow-[0_0_0_3px_rgba(63,199,154,0.18)]',
    inactive: 'bg-ink-200',
    pending: 'bg-amber-500 shadow-[0_0_0_3px_rgba(162,111,30,0.16)]',
    error: 'bg-ember-500 shadow-[0_0_0_3px_rgba(155,43,34,0.16)]',
  };
  return (
    <span className="inline-flex items-center gap-1.5 text-2xs text-ink-500">
      <span
        className={cn(
          'inline-block w-1.5 h-1.5 rounded-full',
          map[state],
          state === 'active' && 'animate-pulse-dot'
        )}
      />
      {label && <span className="uppercase tracking-wider">{label}</span>}
    </span>
  );
}

/** Tag chip：可点击的 tag 胶囊 */
export function TagChip({
  name,
  source,
  onRemove,
  onClick,
  active,
  size = 'sm',
}: {
  name: string;
  source?: 'manual' | 'auto';
  onRemove?: () => void;
  onClick?: () => void;
  active?: boolean;
  size?: 'sm' | 'md';
}) {
  return (
    <span
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded font-mono text-2xs',
        'transition border',
        size === 'sm' ? 'h-5 px-1.5' : 'h-6 px-2 text-xs',
        active
          ? 'bg-ink-800 text-parchment-50 border-ink-800'
          : 'bg-parchment-50 text-ink-700 border-ink-100 hover:bg-parchment-200 hover:border-ink-200',
        onClick && 'cursor-pointer'
      )}
    >
      {source === 'auto' && (
        <span
          aria-label="auto-tagged"
          className="w-1 h-1 rounded-full bg-oxide-500"
        />
      )}
      {source === 'manual' && (
        <span
          aria-label="manual-tagged"
          className="w-1 h-1 rounded-full bg-ink-300"
        />
      )}
      <span>{name}</span>
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 -mr-0.5 w-3 h-3 inline-flex items-center justify-center rounded hover:bg-ink-100 text-ink-300 hover:text-ink-700"
          aria-label={`remove ${name}`}
        >
          ×
        </button>
      )}
    </span>
  );
}
