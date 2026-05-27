// 浮动 bulk 操作条：选中 ≥1 时从底部滑出。
// 居中、距底 96px（避开 activity-ticker），surface-strong 风格。

'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Copy,
  Download,
  MoreVertical,
  Power,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BulkAction {
  key: 'add-tag' | 'remove-tag' | 'enable' | 'disable' | 'delete';
  label: string;
  icon: React.ReactNode;
  tone?: 'default' | 'danger';
  onClick: () => void;
}

export interface BulkActionsBarProps {
  count: number;
  /** 当前是否有 bulk 操作正在执行 */
  busy?: boolean;
  /** 进度，仅 busy 时渲染 */
  progress?: { done: number; total: number; label?: string } | null;
  onAddTag: () => void;
  onRemoveTag: () => void;
  onEnable: () => void;
  onDisable: () => void;
  onDelete: () => void;
  onExportJson: () => void;
  onCopyIds: () => void;
  onClear: () => void;
}

export function BulkActionsBar({
  count,
  busy,
  progress,
  onAddTag,
  onRemoveTag,
  onEnable,
  onDisable,
  onDelete,
  onExportJson,
  onCopyIds,
  onClear,
}: BulkActionsBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // 点击外部关闭 overflow 菜单
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  if (count === 0) return null;

  const actions: BulkAction[] = [
    { key: 'add-tag', label: '添加标签', icon: <Tag className="w-3.5 h-3.5" />, onClick: onAddTag },
    {
      key: 'remove-tag',
      label: '移除标签',
      icon: <Tag className="w-3.5 h-3.5 rotate-180" />,
      onClick: onRemoveTag,
    },
    { key: 'enable', label: '启用', icon: <Power className="w-3.5 h-3.5" />, onClick: onEnable },
    {
      key: 'disable',
      label: '禁用',
      icon: <Power className="w-3.5 h-3.5 opacity-60" />,
      onClick: onDisable,
    },
    {
      key: 'delete',
      label: '删除',
      icon: <Trash2 className="w-3.5 h-3.5" />,
      tone: 'danger',
      onClick: onDelete,
    },
  ];

  const pct = progress && progress.total > 0
    ? Math.round((progress.done / progress.total) * 100)
    : 0;

  return (
    <div
      role="region"
      aria-label="批量操作"
      className={cn(
        'fixed left-1/2 -translate-x-1/2 z-40',
        'bottom-24 w-[720px] max-w-[calc(100vw-32px)]',
        'surface-strong shadow-elevate rounded-lg',
        'animate-in fade-in-0 slide-in-from-bottom-2 duration-150'
      )}
    >
      {/* 进度条（仅在执行时） */}
      {busy && progress && (
        <div className="h-0.5 w-full bg-ink-100/60 overflow-hidden rounded-t-lg">
          <div
            className="h-full bg-oxide-500 transition-all duration-150"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* 计数 */}
        <div className="inline-flex items-center gap-2 pr-3 border-r border-ink-100/80">
          <span className="inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded bg-ink-800 text-parchment-50 font-mono text-2xs num">
            {count}
          </span>
          <span className="text-xs text-ink-700 font-medium whitespace-nowrap">
            项已选
          </span>
        </div>

        {/* 主要动作 */}
        <div className="flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto">
          {actions.map((a) => (
            <button
              key={a.key}
              onClick={a.onClick}
              disabled={busy}
              className={cn(
                'inline-flex items-center gap-1.5 h-8 px-2.5 rounded text-xs whitespace-nowrap',
                'transition-colors duration-150 disabled:opacity-40 disabled:pointer-events-none',
                a.tone === 'danger'
                  ? 'text-ember-500 hover:bg-ember-100/60'
                  : 'text-ink-700 hover:bg-parchment-200'
              )}
            >
              {a.icon}
              {a.label}
            </button>
          ))}

          {/* overflow */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              disabled={busy}
              aria-label="更多操作"
              className={cn(
                'inline-flex items-center justify-center w-8 h-8 rounded text-ink-500',
                'hover:bg-parchment-200 hover:text-ink-800 transition-colors duration-150',
                'disabled:opacity-40 disabled:pointer-events-none',
                menuOpen && 'bg-parchment-200 text-ink-800'
              )}
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
            {menuOpen && (
              <div className="absolute bottom-full right-0 mb-2 w-44 surface-strong shadow-elevate rounded-md py-1 animate-in fade-in-0 zoom-in-95 duration-100">
                <MenuItem
                  icon={<Download className="w-3.5 h-3.5" />}
                  label="导出 JSON"
                  onClick={() => {
                    setMenuOpen(false);
                    onExportJson();
                  }}
                />
                <MenuItem
                  icon={<Copy className="w-3.5 h-3.5" />}
                  label="复制 ID 列表"
                  onClick={() => {
                    setMenuOpen(false);
                    onCopyIds();
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* 进度文案 */}
        {busy && progress && (
          <div className="hidden md:flex items-center gap-1.5 text-2xs text-ink-400 font-mono whitespace-nowrap pl-2 border-l border-ink-100/80">
            <span>{progress.label ?? '操作中…'}</span>
            <span className="num text-ink-700">
              {progress.done}/{progress.total}
            </span>
            <span className="text-ink-300">完成</span>
          </div>
        )}

        {/* 清除选择 */}
        <button
          onClick={onClear}
          className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded text-2xs text-ink-400 hover:text-ink-800 hover:bg-parchment-200 transition-colors duration-150 whitespace-nowrap"
        >
          <X className="w-3 h-3" />
          清除选择
          <kbd className="ml-1 px-1 py-0.5 rounded border border-ink-100 bg-card text-ink-300 font-mono text-[10px]">
            ESC
          </kbd>
        </button>
      </div>
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 h-8 text-xs text-ink-700 hover:bg-parchment-200 transition-colors duration-150"
    >
      <span className="text-ink-400">{icon}</span>
      {label}
    </button>
  );
}
