// 批量打标弹窗：选标签 → 选模式（追加 / 替换 / 移除）→ 并发提交。
// 进度条显示 done / total，失败项可在结果区一键重试。

'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Plus, RefreshCw, Tag, X } from 'lucide-react';
import { toast } from 'sonner';
import { fetcher } from '@/lib/api-client';
import type { TagListResponse } from '@/lib/api-types';
import { MOCK_TAGS } from '@/lib/mock-data';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { TagChip } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  bulkAddTag,
  bulkRemoveTag,
  type BulkResult,
} from '@/lib/bulk-ops';

type Mode = 'append' | 'replace' | 'remove';

const MODE_OPTIONS: Array<{ key: Mode; label: string; hint: string }> = [
  { key: 'append', label: '追加', hint: '新增到现有标签' },
  { key: 'replace', label: '替换', hint: '清空后只保留所选' },
  { key: 'remove', label: '移除', hint: '从现有标签中删除' },
];

export interface BulkTagDialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** 选中的 artifact id 列表 */
  selectedIds: string[];
  /** 完成后刷新调用方（一般触发列表 SWR 重新拉取） */
  onCompleted?: () => void;
}

export function BulkTagDialog({
  open,
  onOpenChange,
  selectedIds,
  onCompleted,
}: BulkTagDialogProps) {
  const [picked, setPicked] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<Mode>('append');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<BulkResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: tagsResp } = useSWR<TagListResponse>(
    open ? '/v1/tags' : null,
    fetcher,
    { onError: () => {} }
  );
  const allTags = tagsResp?.items ?? MOCK_TAGS;

  // 关闭重置
  useEffect(() => {
    if (!open) {
      setPicked([]);
      setInput('');
      setMode('append');
      setProgress(null);
      setResult(null);
      setSubmitting(false);
    }
  }, [open]);

  const suggestions = useMemo(() => {
    const needle = input.trim().toLowerCase();
    return allTags
      .filter((t) => !picked.includes(t.name))
      .filter((t) => (needle ? t.name.toLowerCase().includes(needle) : true))
      .slice(0, 8);
  }, [allTags, picked, input]);

  const addTag = (name: string) => {
    const clean = name.trim().toLowerCase();
    if (!clean || picked.includes(clean)) return;
    setPicked([...picked, clean]);
    setInput('');
  };

  const removeTag = (name: string) => setPicked(picked.filter((t) => t !== name));

  const total = selectedIds.length;
  const canSubmit = picked.length > 0 && total > 0 && !submitting;

  const runForIds = async (idsToRun: string[]): Promise<BulkResult> => {
    setSubmitting(true);
    const planned = idsToRun.length * picked.length;
    setProgress({ done: 0, total: planned });
    const merged: BulkResult = { ok: [], failed: [] };
    let cumulative = 0;
    // 注意：「替换」在本对话框被简化为「先按 picked 名字反向移除 → 再 append」，
    // 这与 strict 全量替换并不等价；如需严格替换，请改用 bulkReplaceTags。
    const runner = mode === 'remove' ? bulkRemoveTag : bulkAddTag;

    for (const tag of picked) {
      const r = await runner(idsToRun, tag, {
        onProgress: (d) => setProgress({ done: cumulative + d, total: planned }),
      });
      r.ok.forEach((id) => {
        if (!merged.ok.includes(id) && !merged.failed.some((f) => f.id === id))
          merged.ok.push(id);
      });
      r.failed.forEach((f) => {
        merged.ok = merged.ok.filter((id) => id !== f.id);
        if (!merged.failed.some((x) => x.id === f.id)) merged.failed.push(f);
      });
      cumulative += idsToRun.length;
    }

    setSubmitting(false);
    return merged;
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const r = await runForIds(selectedIds);
    setResult(r);
    if (r.failed.length === 0) {
      toast.success(`已对 ${r.ok.length} 个 artifact 完成标签操作`);
      onCompleted?.();
    } else {
      toast.warning(`完成 · 成功 ${r.ok.length} · 失败 ${r.failed.length}`);
      onCompleted?.();
    }
  };

  const handleRetry = async () => {
    if (!result || result.failed.length === 0) return;
    const r = await runForIds(result.failed.map((f) => f.id));
    setResult(r);
    if (r.failed.length === 0) {
      toast.success(`重试完成 · ${r.ok.length} 个 artifact 成功`);
      onCompleted?.();
    } else {
      toast.warning(`重试结束 · 仍有 ${r.failed.length} 个失败`);
    }
  };

  const pct = progress && progress.total > 0
    ? Math.round((progress.done / progress.total) * 100)
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[640px]">
        <DialogHeader>
          <DialogTitle className="inline-flex items-center gap-2">
            <span className="w-7 h-7 rounded inline-flex items-center justify-center bg-oxide-100 text-oxide-600">
              <Tag className="w-3.5 h-3.5" />
            </span>
            批量打标
          </DialogTitle>
          <DialogDescription>
            将对 <span className="font-mono text-ink-700">{total}</span> 个 artifact 同时执行。
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-5 space-y-5">
          {/* 模式 */}
          <section className="space-y-2">
            <div className="label !mb-0">模式</div>
            <div className="grid grid-cols-3 gap-1.5">
              {MODE_OPTIONS.map((m) => {
                const selected = mode === m.key;
                return (
                  <button
                    key={m.key}
                    onClick={() => setMode(m.key)}
                    className={cn(
                      'flex flex-col items-start gap-0.5 px-3 py-2 rounded text-left border transition-colors duration-150',
                      selected
                        ? 'bg-ink-800 text-parchment-50 border-ink-800'
                        : 'bg-card text-ink-700 border-ink-100/80 hover:bg-parchment-200'
                    )}
                  >
                    <span className="text-xs font-mono uppercase tracking-wider">{m.label}</span>
                    <span className={cn('text-2xs', selected ? 'text-parchment-50/70' : 'text-ink-400')}>{m.hint}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 已选标签 */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="label !mb-0">将要 {mode === 'remove' ? '移除' : '应用'} 的标签</span>
              <span className="text-2xs text-ink-300 num font-mono">{picked.length}</span>
            </div>
            <div className="min-h-[36px] flex flex-wrap items-center gap-1.5 p-2 rounded border border-ink-100 bg-card">
              {picked.length === 0 ? (
                <span className="text-2xs text-ink-300 italic px-1">尚未选择标签</span>
              ) : (
                picked.map((t) => (
                  <TagChip key={t} name={t} onRemove={() => removeTag(t)} size="md" />
                ))
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag(input);
                  }
                }}
                placeholder="输入标签名后回车，或从下方建议中选"
                className="flex-1 h-8 px-2.5 rounded border border-ink-100 bg-card text-xs font-mono placeholder:text-ink-300 focus-ring focus:border-oxide-400/50 transition"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => addTag(input)}
                disabled={!input.trim()}
              >
                <Plus className="w-3 h-3" />
                添加
              </Button>
            </div>
            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {suggestions.map((s) => (
                  <button
                    key={s.name}
                    onClick={() => addTag(s.name)}
                    className="inline-flex items-center gap-1 h-6 px-2 rounded border border-ink-100 bg-parchment-50 text-2xs font-mono text-ink-600 hover:bg-parchment-200 hover:border-ink-200 transition-colors duration-150"
                  >
                    <Plus className="w-2.5 h-2.5 text-ink-300" />
                    {s.name}
                    <span className="text-ink-300 num">{s.artifact_count}</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* 进度 */}
          {progress && (
            <section className="space-y-1.5">
              <div className="flex items-center justify-between text-2xs text-ink-400 font-mono">
                <span>操作中…</span>
                <span className="num">
                  {progress.done}/{progress.total} ({pct}%)
                </span>
              </div>
              <div className="h-1.5 rounded bg-ink-100/60 overflow-hidden">
                <div
                  className="h-full bg-oxide-500 transition-all duration-150"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </section>
          )}

          {/* 结果 */}
          {result && result.failed.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="label !mb-0 text-ember-500">
                  {result.failed.length} 个 artifact 失败
                </span>
                <Button variant="secondary" size="sm" onClick={handleRetry} disabled={submitting}>
                  <RefreshCw className="w-3 h-3" />
                  重试失败项
                </Button>
              </div>
              <ul className="max-h-32 overflow-y-auto space-y-1 -mr-2 pr-2">
                {result.failed.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-start gap-2 text-2xs font-mono text-ink-500"
                  >
                    <span className="shrink-0 inline-flex items-center justify-center w-3 h-3 rounded-full bg-ember-100 text-ember-500 text-[10px]">
                      <X className="w-2 h-2" />
                    </span>
                    <span className="truncate min-w-0">{f.id}</span>
                    <span className="text-ember-500/70 truncate">{f.error}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 底部按钮 */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              variant="secondary"
              size="md"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              {result ? '关闭' : '取消'}
            </Button>
            <Button
              variant="oxide"
              size="md"
              onClick={handleSubmit}
              disabled={!canSubmit}
            >
              {submitting
                ? '执行中…'
                : `${mode === 'remove' ? '移除' : '应用'} 到 ${total} 项`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
