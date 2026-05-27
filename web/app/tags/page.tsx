'use client';

// /tags 页面：浏览预置 + 自定义标签，支持搜索 / 新建 / 删除
// 数据通过 SWR 拉 /v1/tags，回退到 MOCK_TAGS 保证 demo 不会一片白。

import * as React from 'react';
import useSWR from 'swr';
import {
  AlertTriangle,
  Plus,
  Search,
  Sparkles,
  TagsIcon,
  Trash2,
} from 'lucide-react';
import { fetcher, api, ApiError } from '@/lib/api-client';
import type { TagListResponse } from '@/lib/api-types';
import { MOCK_TAGS } from '@/lib/mock-data';
import { PageHeader } from '@/components/ui/page-header';
import { Surface } from '@/components/ui/surface';
import { Stat } from '@/components/ui/stat';
import { Button } from '@/components/ui/button';
import { HelpTip } from '@/components/ui/help-tip';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { TagCard } from '@/components/tags/tag-card';
import { CreateTagDialog } from '@/components/tags/create-tag-dialog';
import { fmtNumber } from '@/lib/utils';
import { toast } from 'sonner';

export default function TagsPage() {
  const { data: raw, mutate, isLoading } = useSWR<TagListResponse>('/v1/tags', fetcher, {
    onError: () => {},
  });

  const tags = raw?.items ?? MOCK_TAGS;
  const isDemo = !raw && !isLoading;

  const [query, setQuery] = React.useState('');
  const [createOpen, setCreateOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const normalized = query.trim().toLowerCase();
  const filtered = React.useMemo(() => {
    if (!normalized) return tags;
    return tags.filter(
      (t) =>
        t.name.toLowerCase().includes(normalized) ||
        (t.description ?? '').toLowerCase().includes(normalized)
    );
  }, [tags, normalized]);

  const builtins = filtered.filter((t) => t.is_builtin);
  const customs = filtered.filter((t) => !t.is_builtin);
  const maxCount = Math.max(1, ...tags.map((t) => t.artifact_count));

  const totalBuiltin = tags.filter((t) => t.is_builtin).length;
  const totalCustom = tags.length - totalBuiltin;
  const totalUsed = tags.filter((t) => t.artifact_count > 0).length;

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteTag(deleteTarget);
      toast.success(`已删除标签 ${deleteTarget}`, {
        description: '已附加该标签的 artifact 不会自动重新打标。',
      });
      setDeleteTarget(null);
      await mutate();
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : '未知错误';
      toast.error('删除失败', { description: message });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={isDemo ? 'DEMO MODE · 后端未连接' : 'REGISTRY · CLASSIFICATION'}
        title={'分组标签'}
        description={
          '20 个预置标签覆盖常见场景；你也可以自由扩展。tag 不影响推荐排序，只用于浏览/过滤/审计自动打标。'
        }
        actions={
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-300" />
              <Input
                placeholder="搜索标签…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-8 w-[220px] h-9"
              />
            </div>
            <Button variant="oxide" size="md" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4" />
              新建标签
            </Button>
          </>
        }
      >
        <div className="inline-flex items-center gap-2 text-xs text-ink-400">
          <span>tag 不影响推荐排序</span>
          <HelpTip inline>
            tag 只决定 list/filter；reranker 看的是 prompt 与 description 的语义匹配。
          </HelpTip>
          <span className="text-ink-200">·</span>
          <span>自动打标由 Qwen-1.5B 处理</span>
          <HelpTip inline>
            Qwen-1.5B 串行处理，每条 artifact 选 1-3 个最贴合的 tag。
          </HelpTip>
        </div>
      </PageHeader>

      {/* —— KPI 行 —— */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Surface padding="default">
          <Stat
            label="标签 · 总量"
            value={fmtNumber(tags.length)}
            unit="个"
            hint="包括预置与自定义"
            topRight={<TagsIcon className="w-4 h-4 text-ink-300" />}
          />
        </Surface>
        <Surface padding="default">
          <Stat
            label="预置 · BUILTIN"
            value={fmtNumber(totalBuiltin)}
            unit="个"
            hint="开箱可用、不可删除"
            topRight={<Sparkles className="w-4 h-4 text-ink-300" />}
          />
        </Surface>
        <Surface padding="default">
          <Stat
            label="自定义"
            value={fmtNumber(totalCustom)}
            unit="个"
            hint="由你扩展的语义"
            topRight={<Plus className="w-4 h-4 text-ink-300" />}
          />
        </Surface>
        <Surface padding="default">
          <Stat
            label="实际被使用"
            value={fmtNumber(totalUsed)}
            unit={`/ ${tags.length}`}
            hint="artifact_count > 0"
            topRight={
              <span className="dot dot-live" aria-hidden />
            }
          />
        </Surface>
      </div>

      {/* —— BUILTIN 区 —— */}
      <Surface eyebrow="预置标签 · BUILTIN">
        {builtins.length === 0 ? (
          <p className="text-sm text-ink-400 py-2">没有匹配的预置标签。</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
            {builtins
              .slice()
              .sort((a, b) => b.artifact_count - a.artifact_count)
              .map((t) => (
                <TagCard key={t.name} tag={t} maxCount={maxCount} />
              ))}
          </div>
        )}
      </Surface>

      {/* —— CUSTOM 区 —— */}
      <Surface
        eyebrow="自定义标签 · CUSTOM"
        actions={
          customs.length > 0 ? (
            <span className="text-2xs text-ink-400 font-mono">{customs.length} 个</span>
          ) : null
        }
      >
        {customs.length === 0 ? (
          <EmptyState
            icon={<TagsIcon className="w-5 h-5" />}
            title={normalized ? '没有匹配的自定义标签' : '还没有自定义标签'}
            description={
              normalized
                ? '尝试清空搜索，或者新建一个匹配该关键字的标签。'
                : '20 个预置标签已经覆盖大多数常见场景。当你想沉淀团队专属的工作流分组时，再来扩展。'
            }
            action={
              <Button variant="oxide" onClick={() => setCreateOpen(true)}>
                <Plus className="w-4 h-4" />
                新建第一个标签
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
            {customs
              .slice()
              .sort((a, b) => b.artifact_count - a.artifact_count)
              .map((t) => (
                <TagCard
                  key={t.name}
                  tag={t}
                  maxCount={maxCount}
                  onDelete={(name) => setDeleteTarget(name)}
                />
              ))}
          </div>
        )}
      </Surface>

      {/* —— 新建 Dialog —— */}
      <CreateTagDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        existingNames={tags.map((t) => t.name)}
        onCreated={() => mutate()}
      />

      {/* —— 删除确认 —— */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && !deleting && setDeleteTarget(null)}
      >
        <DialogContent className="!w-[480px]">
          <DialogHeader>
            <div className="flex items-center gap-2 label !mb-1 text-ember-500">
              <AlertTriangle className="w-3 h-3" />
              <span>DELETE TAG</span>
            </div>
            <DialogTitle>删除 「{deleteTarget}」？</DialogTitle>
            <DialogDescription>
              所有附加了该标签的 artifact 会自动剥离它，但不会被重新打标。该动作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-6 flex items-center justify-end gap-2 pt-2 border-t hairline border-t-ink-100/60">
            <Button
              variant="ghost"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              取消
            </Button>
            <Button variant="danger" onClick={handleDelete} disabled={deleting}>
              <Trash2 className="w-4 h-4" />
              {deleting ? '正在删除…' : '确认删除'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
