'use client';

// 单个 tag 的卡片表现：name + description + usage bar + 右侧操作
// 预置 tag 显示 lock，自定义 tag 显示删除按钮

import * as React from 'react';
import Link from 'next/link';
import { ArrowUpRight, Lock, Trash2 } from 'lucide-react';
import type { TagItem } from '@/lib/api-types';
import { cn, fmtNumber } from '@/lib/utils';
import { HelpTip } from '@/components/ui/help-tip';

interface TagCardProps {
  tag: TagItem;
  maxCount: number;
  onDelete?: (name: string) => void;
}

export function TagCard({ tag, maxCount, onDelete }: TagCardProps) {
  const pct = maxCount > 0 ? Math.min(100, Math.round((tag.artifact_count / maxCount) * 100)) : 0;
  const isUsed = tag.artifact_count > 0;

  return (
    <div
      className={cn(
        'group relative surface p-4 flex flex-col gap-3 transition',
        'hover:shadow-elevate hover:-translate-y-px'
      )}
    >
      {/* 顶行：name + actions */}
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/artifacts?tag=${encodeURIComponent(tag.name)}`}
          className="min-w-0 flex-1 group/name"
        >
          <div className="font-mono text-[0.95rem] text-ink-800 truncate group-hover/name:text-oxide-500 transition">
            {tag.name}
          </div>
        </Link>
        <div className="shrink-0 -mr-1 -mt-1">
          {tag.is_builtin ? (
            <HelpTip
              className="!w-7 !h-7 hover:bg-ink-100/60 rounded"
              inline={false}
            >
              预置标签不可删除。它们覆盖最常见的场景，用来保证自动打标有稳定语义。
            </HelpTip>
          ) : (
            <button
              type="button"
              onClick={() => onDelete?.(tag.name)}
              aria-label={`删除标签 ${tag.name}`}
              className={cn(
                'inline-flex items-center justify-center w-7 h-7 rounded text-ink-300',
                'hover:text-ember-500 hover:bg-ember-100/60 transition'
              )}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* description */}
      <p className="text-xs text-ink-400 leading-relaxed min-h-[2rem] line-clamp-2">
        {tag.description || (tag.is_builtin ? '预置标签' : '自定义标签')}
      </p>

      {/* usage bar */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <span className="label !mb-0 !text-[0.625rem]">USAGE</span>
          <span className="text-2xs font-mono text-ink-500">
            <span className="num text-ink-700">{fmtNumber(tag.artifact_count)}</span>
            <span className="text-ink-300"> · {pct}%</span>
          </span>
        </div>
        <div className="relative h-1 rounded-full bg-ink-100/70 overflow-hidden">
          <div
            className={cn(
              'absolute inset-y-0 left-0 rounded-full transition-all',
              isUsed ? 'bg-oxide-500' : 'bg-ink-200'
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* footer link */}
      <div className="flex items-center justify-between pt-2 border-t hairline border-t-ink-100/50 mt-auto">
        <span className="inline-flex items-center gap-1 text-2xs">
          {tag.is_builtin ? (
            <>
              <Lock className="w-2.5 h-2.5 text-ink-300" />
              <span className="text-ink-400 uppercase tracking-wider">builtin</span>
            </>
          ) : (
            <span className="text-ink-400 uppercase tracking-wider">custom</span>
          )}
        </span>
        <Link
          href={`/artifacts?tag=${encodeURIComponent(tag.name)}`}
          className="inline-flex items-center gap-1 text-2xs text-ink-400 hover:text-oxide-500 transition"
        >
          查看 artifacts
          <ArrowUpRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}
