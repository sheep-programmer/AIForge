// Artifact 行：表格视图 + 卡片视图 两种形态。
// 表格行模仿 dashboard 的 cell-row 样式；卡片用于栅格视图。

'use client';

import Link from 'next/link';
import { Check, GitBranch, Radio, Star } from 'lucide-react';
import type { ArtifactBrief } from '@/lib/api-types';
import { ArtifactTypeBadge, StatusDot, TagChip } from '@/components/ui/badge';
import { fmtNumber, fmtRelativeTime, cn } from '@/lib/utils';

interface ArtifactRowProps {
  artifact: ArtifactBrief;
  view?: 'table' | 'card';
  /** 是否被选中（仅 table 视图渲染 checkbox） */
  selected?: boolean;
  /** 切换选中状态，传入则渲染 checkbox 列 */
  onToggle?: (id: string, next: boolean) => void;
}

export function ArtifactRow({ artifact, view = 'table', selected, onToggle }: ArtifactRowProps) {
  if (view === 'card') return <ArtifactCard artifact={artifact} />;
  return <ArtifactTableRow artifact={artifact} selected={selected} onToggle={onToggle} />;
}

function ArtifactTableRow({
  artifact: a,
  selected,
  onToggle,
}: {
  artifact: ArtifactBrief;
  selected?: boolean;
  onToggle?: (id: string, next: boolean) => void;
}) {
  const showCheckbox = !!onToggle;

  // 当处于选择模式时，整行的导航被禁用：点击空白处会切换选中。
  // 让 checkbox 独立可点；链接区域用 stopPropagation 避免冒泡。
  return (
    <li
      className={cn(
        'cell-row relative',
        selected && 'bg-oxide-100/40 hover:bg-oxide-100/60'
      )}
    >
      {selected && (
        <span
          aria-hidden
          className="absolute left-0 top-0 bottom-0 w-[1.5px] bg-oxide-500"
        />
      )}
      <div className="flex items-stretch">
        {showCheckbox && (
          <div className="flex items-center pl-5 pr-2 shrink-0">
            <RowCheckbox
              checked={!!selected}
              onChange={(next) => onToggle!(a.id, next)}
              label={a.name}
            />
          </div>
        )}
        <Link
          href={`/artifacts/${a.id}`}
          className={cn(
            'flex-1 min-w-0 grid grid-cols-12 items-center gap-3 py-3.5',
            showCheckbox ? 'pl-2 pr-5' : 'px-5'
          )}
        >
          {/* 名称 + 类型 + repo */}
          <div className="col-span-12 md:col-span-4 flex items-center gap-3 min-w-0">
            <ArtifactTypeBadge type={a.artifact_type} withLabel={false} />
            <div className="min-w-0">
              <div className="font-medium text-sm text-ink-800 truncate flex items-center gap-2">
                {a.name}
                {!a.is_active && <StatusDot state="inactive" />}
              </div>
              <div className="text-2xs text-ink-400 truncate font-mono">
                {a.source_repo}
              </div>
            </div>
          </div>

          {/* 类型徽章 */}
          <div className="hidden md:flex col-span-1 items-center">
            <ArtifactTypeBadge type={a.artifact_type} />
          </div>

          {/* 标签 */}
          <div className="hidden md:flex col-span-3 items-center gap-1 flex-wrap">
            {a.tags.slice(0, 3).map((t) => (
              <TagChip key={t} name={t} />
            ))}
            {a.tags.length > 3 && (
              <span className="text-2xs text-ink-300">+{a.tags.length - 3}</span>
            )}
            {a.tags.length === 0 && (
              <span className="text-2xs text-ink-300 italic">未打标</span>
            )}
          </div>

          {/* stars */}
          <div className="hidden md:flex col-span-1 items-center gap-1.5 text-2xs text-ink-400">
            <Star className="w-3 h-3 text-ink-300" />
            <span className="num">{fmtNumber(a.source_stars)}</span>
          </div>

          {/* 推荐次数 */}
          <div className="hidden md:flex col-span-1 items-center gap-1.5 text-2xs text-ink-400">
            <Radio className="w-3 h-3 text-oxide-400" />
            <span className="num">{fmtNumber(a.recommend_count)}</span>
          </div>

          {/* 更新时间 */}
          <div className="hidden md:block col-span-2 text-right text-2xs text-ink-400 font-mono">
            {fmtRelativeTime(a.updated_at)}
          </div>
        </Link>
      </div>
    </li>
  );
}

/** 行内复选框：与表头使用的 SelectionCheckbox 共享样式。 */
export function RowCheckbox({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (next: boolean) => void;
  label?: string;
}) {
  return (
    <button
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={label ? `选择 ${label}` : '选择该行'}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onChange(!checked);
      }}
      className={cn(
        'inline-flex items-center justify-center w-4 h-4 rounded-sm border transition-colors duration-150',
        'focus-ring',
        checked || indeterminate
          ? 'bg-oxide-500 border-oxide-500 text-parchment-50'
          : 'bg-card border-ink-200 hover:border-ink-300'
      )}
    >
      {indeterminate ? (
        <span className="block w-2 h-[1.5px] bg-parchment-50" />
      ) : checked ? (
        <Check className="w-3 h-3" strokeWidth={3} />
      ) : null}
    </button>
  );
}

function ArtifactCard({ artifact: a }: { artifact: ArtifactBrief }) {
  return (
    <Link
      href={`/artifacts/${a.id}`}
      className="group surface p-4 flex flex-col gap-3 hover:shadow-elevate transition-shadow duration-150"
    >
      {/* 顶部：类型 + 状态 */}
      <div className="flex items-center justify-between gap-2">
        <ArtifactTypeBadge type={a.artifact_type} />
        <StatusDot
          state={a.is_active ? 'active' : 'inactive'}
          label={a.is_active ? '启用' : '禁用'}
        />
      </div>

      {/* 名称 + 描述 */}
      <div className="min-w-0 flex-1">
        <h3 className="display text-lg text-ink-800 leading-tight font-normal tracking-tight truncate">
          {a.name}
        </h3>
        <p className="mt-1 text-xs text-ink-400 line-clamp-2 leading-relaxed">
          {a.description}
        </p>
      </div>

      {/* 标签 */}
      <div className="flex items-center gap-1 flex-wrap min-h-[20px]">
        {a.tags.slice(0, 3).map((t) => (
          <TagChip key={t} name={t} />
        ))}
        {a.tags.length > 3 && (
          <span className="text-2xs text-ink-300">+{a.tags.length - 3}</span>
        )}
      </div>

      {/* 底部 metadata strip */}
      <div className="pt-3 border-t border-ink-100/80 flex items-center justify-between text-2xs text-ink-400">
        <span className="inline-flex items-center gap-1.5 font-mono truncate">
          <GitBranch className="w-3 h-3 text-ink-300 shrink-0" />
          <span className="truncate">{a.source_repo}</span>
        </span>
        <span className="inline-flex items-center gap-2.5 shrink-0">
          <span className="inline-flex items-center gap-1">
            <Star className="w-3 h-3 text-ink-300" />
            <span className="num">{fmtNumber(a.source_stars)}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Radio className="w-3 h-3 text-oxide-400" />
            <span className="num">{fmtNumber(a.recommend_count)}</span>
          </span>
        </span>
      </div>
    </Link>
  );
}

export function ArtifactRowSkeleton() {
  return (
    <li className="border-b border-ink-100/60">
      <div className="grid grid-cols-12 items-center gap-3 px-5 py-3.5">
        <div className="col-span-12 md:col-span-4 flex items-center gap-3">
          <div className="w-5 h-5 rounded-sm bg-ink-100/40 animate-pulse" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-1/2 bg-ink-100/40 rounded animate-pulse" />
            <div className="h-2.5 w-2/3 bg-ink-100/30 rounded animate-pulse" />
          </div>
        </div>
        <div className="hidden md:block col-span-1 h-4 w-12 bg-ink-100/40 rounded animate-pulse" />
        <div className="hidden md:flex col-span-3 gap-1">
          <div className="h-4 w-12 bg-ink-100/40 rounded animate-pulse" />
          <div className="h-4 w-10 bg-ink-100/40 rounded animate-pulse" />
        </div>
        <div className="hidden md:block col-span-1 h-3 w-10 bg-ink-100/40 rounded animate-pulse" />
        <div className="hidden md:block col-span-1 h-3 w-10 bg-ink-100/40 rounded animate-pulse" />
        <div className="hidden md:block col-span-2 h-3 w-16 bg-ink-100/40 rounded animate-pulse ml-auto" />
      </div>
    </li>
  );
}

export function ArtifactCardSkeleton() {
  return (
    <div className="surface p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="h-5 w-16 bg-ink-100/40 rounded animate-pulse" />
        <div className="h-3 w-10 bg-ink-100/40 rounded animate-pulse" />
      </div>
      <div className="space-y-2">
        <div className="h-5 w-2/3 bg-ink-100/40 rounded animate-pulse" />
        <div className="h-3 w-full bg-ink-100/30 rounded animate-pulse" />
        <div className="h-3 w-3/4 bg-ink-100/30 rounded animate-pulse" />
      </div>
      <div className="flex gap-1">
        <div className="h-4 w-12 bg-ink-100/40 rounded animate-pulse" />
        <div className="h-4 w-10 bg-ink-100/40 rounded animate-pulse" />
      </div>
      <div className="pt-3 border-t border-ink-100/80 flex justify-between">
        <div className="h-3 w-24 bg-ink-100/40 rounded animate-pulse" />
        <div className="h-3 w-16 bg-ink-100/40 rounded animate-pulse" />
      </div>
    </div>
  );
}
