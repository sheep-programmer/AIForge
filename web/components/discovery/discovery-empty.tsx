'use client';

import * as React from 'react';
import { Radio } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DiscoveryEmptyProps {
  /** 当前选中的 filter，用于个性化文案 */
  filter?: 'all' | 'pending' | 'approved' | 'rejected';
  className?: string;
}

const TEXT: Record<NonNullable<DiscoveryEmptyProps['filter']>, { title: string; hint: string }> = {
  all: {
    title: '队列为空 · 一切都安静',
    hint: '远程 finder 还没有上报任何新仓库。下一轮抓取通常每天一次。',
  },
  pending: {
    title: '没有待审批的发现',
    hint: '所有上报的仓库都已处理过。打开「已批准 / 已拒绝」查看历史。',
  },
  approved: {
    title: '尚未批准过任何发现',
    hint: '当你批准一个仓库，它会出现在这里 · 后台 ingest 完成后自动可用。',
  },
  rejected: {
    title: '没有被拒绝的发现',
    hint: '被拒绝的仓库会留在此处作为「永不推荐」名单。',
  },
};

export function DiscoveryEmpty({ filter = 'all', className }: DiscoveryEmptyProps) {
  const t = TEXT[filter];
  return (
    <div
      className={cn(
        'relative overflow-hidden',
        'rounded-md border border-dashed border-ink-200/70 bg-parchment-100/60',
        'px-8 py-16 text-center',
        className
      )}
    >
      {/* 装饰：极淡的扫描线纹理 */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.06] bg-grid-faint bg-grid-32 pointer-events-none"
      />

      <div className="relative flex flex-col items-center">
        <div className="relative w-14 h-14 rounded-md bg-ink-800 text-parchment-50 inline-flex items-center justify-center shadow-elevate mb-5">
          <Radio className="w-5 h-5" />
          {/* 静止的 ring，呼应 '一切都安静' */}
          <span
            aria-hidden
            className="absolute -inset-2 rounded-lg ring-1 ring-oxide-200/60"
          />
          <span
            aria-hidden
            className="absolute -inset-4 rounded-xl ring-1 ring-oxide-100/40"
          />
        </div>
        <h3 className="display text-xl text-ink-800 font-normal tracking-tight">
          {t.title}
        </h3>
        <p className="mt-2 text-sm text-ink-400 max-w-md leading-relaxed">
          {t.hint}
        </p>

        <div className="mt-5 inline-flex items-center gap-2 font-mono text-2xs text-ink-300">
          <span className="dot bg-ink-200" />
          NO SIGNAL
        </div>
      </div>
    </div>
  );
}
