'use client';

import * as React from 'react';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HelpTip } from '@/components/ui/help-tip';
import { EmptyIllustrationStyles } from './empty-illustrations';

interface EmptyStateRichProps {
  /** 240×180 inline SVG illustration. */
  illustration: React.ReactNode;
  title: string;
  description: string;
  primaryAction?: React.ReactNode;
  secondaryActions?: React.ReactNode[];
  /** 短小贴士，渲染为单色等宽字行。 */
  hints?: string[];
  /** "你看到这个是因为..." 解释，挂在 title 边的 HelpTip。 */
  reason?: React.ReactNode;
  /** 紧凑模式：用于嵌入小卡片。 */
  compact?: boolean;
  className?: string;
}

export function EmptyStateRich({
  illustration,
  title,
  description,
  primaryAction,
  secondaryActions,
  hints,
  reason,
  compact,
  className,
}: EmptyStateRichProps) {
  return (
    <div
      className={cn(
        'surface-strong overflow-hidden relative',
        compact ? 'p-5' : 'p-6 lg:p-8',
        'max-w-[640px] w-full mx-auto',
        'animate-fade-up',
        className
      )}
    >
      <EmptyIllustrationStyles />

      {/* 角落极淡装饰：oxide 角标 */}
      <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full bg-oxide-100/40 blur-2xl pointer-events-none" />

      <div
        className={cn(
          'relative flex gap-6 items-start',
          'flex-col sm:flex-row'
        )}
      >
        {/* 插画区 */}
        <div className="shrink-0 mx-auto sm:mx-0">
          <div
            className={cn(
              'rounded-md border border-ink-100/70 bg-parchment-50',
              'p-2 shadow-elevate'
            )}
          >
            {illustration}
          </div>
        </div>

        {/* 文字区 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="display text-2xl text-ink-800 font-normal tracking-tight">
              {title}
            </h3>
            {reason && <HelpTip>{reason}</HelpTip>}
          </div>

          <p className="mt-2 text-sm text-ink-500 leading-relaxed">
            {description}
          </p>

          {/* 操作 */}
          {(primaryAction || (secondaryActions && secondaryActions.length > 0)) && (
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {primaryAction}
              {secondaryActions?.map((node, i) => (
                <React.Fragment key={i}>{node}</React.Fragment>
              ))}
            </div>
          )}

          {/* 提示 */}
          {hints && hints.length > 0 && (
            <ul className="mt-5 space-y-1.5">
              {hints.map((h, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-2xs font-mono text-ink-400 leading-relaxed"
                >
                  <Sparkles className="w-3 h-3 mt-0.5 text-oxide-500 shrink-0" />
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
