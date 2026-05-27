// 左侧筛选栏：sticky 定位。
// 类型 segmented + 标签云 + 启用状态开关 + 重置。

'use client';

import { Boxes, Filter, RotateCcw } from 'lucide-react';
import type { ArtifactType, TagItem } from '@/lib/api-types';
import { cn } from '@/lib/utils';

interface FilterRailProps {
  type: ArtifactType | null;
  tag: string | null;
  active: 'all' | 'on' | 'off';
  tags: TagItem[];
  tagsLoading: boolean;
  onTypeChange: (t: ArtifactType | null) => void;
  onTagChange: (t: string | null) => void;
  onActiveChange: (a: 'all' | 'on' | 'off') => void;
  onReset: () => void;
}

const TYPE_BUTTONS: Array<{ key: ArtifactType | null; label: string; symbol: React.ReactNode }> = [
  { key: null, label: '全部', symbol: <Boxes className="w-3.5 h-3.5" /> },
  {
    key: 'skill',
    label: 'Skill',
    symbol: <span className="w-1.5 h-1.5 rounded-full bg-oxide-500 inline-block" />,
  },
  {
    key: 'mcp',
    label: 'MCP',
    symbol: <span className="w-1.5 h-1.5 bg-navy-500 inline-block rotate-45" />,
  },
  {
    key: 'plugin',
    label: 'Plugin',
    symbol: <span className="w-2 h-1.5 rounded-full border border-amber-500 inline-block" />,
  },
];

export function FilterRail({
  type,
  tag,
  active,
  tags,
  tagsLoading,
  onTypeChange,
  onTagChange,
  onActiveChange,
  onReset,
}: FilterRailProps) {
  const hasFilters = type !== null || tag !== null || active !== 'all';

  return (
    <aside className="surface p-5 sticky top-4 space-y-6">
      <header className="flex items-center justify-between">
        <div className="label inline-flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-ink-400" />
          筛选
        </div>
        {hasFilters && (
          <button
            onClick={onReset}
            className="inline-flex items-center gap-1 text-2xs text-ink-400 hover:text-ink-800 transition-colors duration-150"
          >
            <RotateCcw className="w-3 h-3" />
            重置
          </button>
        )}
      </header>

      {/* 类型 segmented */}
      <section className="space-y-2">
        <div className="label !mb-0">类型</div>
        <div className="grid grid-cols-2 gap-1.5">
          {TYPE_BUTTONS.map((b) => {
            const selected = b.key === type;
            return (
              <button
                key={b.key ?? 'all'}
                onClick={() => onTypeChange(b.key)}
                className={cn(
                  'inline-flex items-center justify-center gap-1.5 h-8 px-2 rounded text-2xs font-mono uppercase tracking-wider',
                  'border transition-colors duration-150',
                  selected
                    ? 'bg-ink-800 text-parchment-50 border-ink-800'
                    : 'bg-card text-ink-600 border-ink-100/80 hover:bg-parchment-200 hover:border-ink-200'
                )}
              >
                {b.symbol}
                {b.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* 启用状态 */}
      <section className="space-y-2">
        <div className="label !mb-0">状态</div>
        <div className="flex gap-1.5">
          {(['all', 'on', 'off'] as const).map((k) => {
            const selected = active === k;
            const label = k === 'all' ? '全部' : k === 'on' ? '启用' : '禁用';
            return (
              <button
                key={k}
                onClick={() => onActiveChange(k)}
                className={cn(
                  'flex-1 h-7 px-2 rounded text-2xs font-mono uppercase tracking-wider',
                  'border transition-colors duration-150',
                  selected
                    ? 'bg-ink-800 text-parchment-50 border-ink-800'
                    : 'bg-card text-ink-600 border-ink-100/80 hover:bg-parchment-200'
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </section>

      {/* 标签 */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="label !mb-0">标签</span>
          <span className="text-2xs text-ink-300 font-mono num">{tags.length}</span>
        </div>
        <div className="max-h-[420px] overflow-y-auto -mr-2 pr-2 space-y-1">
          {tagsLoading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-7 bg-ink-100/40 rounded animate-pulse"
                />
              ))
            : tags
                .slice()
                .sort((a, b) => b.artifact_count - a.artifact_count)
                .map((t) => {
                  const selected = tag === t.name;
                  return (
                    <button
                      key={t.name}
                      onClick={() => onTagChange(selected ? null : t.name)}
                      className={cn(
                        'w-full flex items-center justify-between gap-2 h-7 px-2 rounded text-left',
                        'transition-colors duration-150',
                        selected
                          ? 'bg-oxide-100 text-oxide-700 ring-1 ring-oxide-200'
                          : 'text-ink-600 hover:bg-parchment-200'
                      )}
                    >
                      <span className="font-mono text-2xs truncate">{t.name}</span>
                      <span
                        className={cn(
                          'shrink-0 num text-2xs',
                          selected ? 'text-oxide-600' : 'text-ink-300'
                        )}
                      >
                        {t.artifact_count}
                      </span>
                    </button>
                  );
                })}
          {!tagsLoading && tags.length === 0 && (
            <div className="text-2xs text-ink-300 italic py-2">无可用标签</div>
          )}
        </div>
      </section>
    </aside>
  );
}
