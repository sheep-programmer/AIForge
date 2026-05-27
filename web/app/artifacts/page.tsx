// Artifacts 列表页：左 FilterRail + 右结果面板（表格 / 卡片切换）。
// URL 即状态：?type=&tag=&q=&active=&offset= 全部可分享。

'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR, { useSWRConfig } from 'swr';
import {
  Boxes,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Plus,
  Rows3,
  Search,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { fetcher } from '@/lib/api-client';
import type {
  ArtifactBrief,
  ArtifactListResponse,
  ArtifactType,
  TagListResponse,
} from '@/lib/api-types';
import { MOCK_ARTIFACTS, MOCK_TAGS } from '@/lib/mock-data';
import { PageHeader } from '@/components/ui/page-header';
import { Surface } from '@/components/ui/surface';
import { Stat } from '@/components/ui/stat';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { fmtNumber } from '@/lib/utils';
import { FilterRail } from '@/components/artifacts/filter-rail';
import {
  ArtifactCardSkeleton,
  ArtifactRow,
  ArtifactRowSkeleton,
  RowCheckbox,
} from '@/components/artifacts/artifact-row';
import { BulkActionsBar } from '@/components/artifacts/bulk-actions-bar';
import { BulkTagDialog } from '@/components/artifacts/bulk-tag-dialog';
import { BulkConfirmDialog } from '@/components/artifacts/bulk-confirm-dialog';
import { bulkDelete, bulkToggleActive } from '@/lib/bulk-ops';

const PAGE_SIZE = 50;

type SortKey = 'updated' | 'stars' | 'recommends';

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'updated', label: '最近更新' },
  { key: 'stars', label: 'Star 数' },
  { key: 'recommends', label: '推荐次数' },
];

function isArtifactType(v: string | null): v is ArtifactType {
  return v === 'skill' || v === 'mcp' || v === 'plugin';
}

export default function ArtifactsPage() {
  return (
    <Suspense fallback={<ArtifactsPageSkeleton />}>
      <ArtifactsPageInner />
    </Suspense>
  );
}

function ArtifactsPageInner() {
  const router = useRouter();
  const sp = useSearchParams();

  const type = isArtifactType(sp.get('type')) ? (sp.get('type') as ArtifactType) : null;
  const tag = sp.get('tag');
  const q = sp.get('q') ?? '';
  const activeParam = sp.get('active');
  const active: 'all' | 'on' | 'off' =
    activeParam === 'true' ? 'on' : activeParam === 'false' ? 'off' : 'all';
  const offset = Math.max(0, parseInt(sp.get('offset') ?? '0', 10) || 0);
  const sort = (sp.get('sort') as SortKey | null) ?? 'updated';
  const view = (sp.get('view') as 'table' | 'card' | null) ?? 'table';

  const [searchInput, setSearchInput] = useState(q);

  // —— Bulk 选择 ——
  // 选中集合：跨分页只在同一 session 内保留（Set<string>）。
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] =
    useState<{ done: number; total: number; label?: string } | null>(null);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const { mutate } = useSWRConfig();

  // 构建 SWR key
  const apiUrl = useMemo(() => {
    const p = new URLSearchParams();
    if (type) p.set('type', type);
    if (tag) p.set('tag', tag);
    if (q) p.set('q', q);
    if (active !== 'all') p.set('active', active === 'on' ? 'true' : 'false');
    p.set('limit', String(PAGE_SIZE));
    p.set('offset', String(offset));
    return `/v1/artifacts?${p.toString()}`;
  }, [type, tag, q, active, offset]);

  const {
    data: artifactsResp,
    error: artifactsError,
    isLoading: artifactsLoading,
  } = useSWR<ArtifactListResponse>(apiUrl, fetcher, { onError: () => {} });

  const { data: tagsResp, isLoading: tagsLoading } = useSWR<TagListResponse>(
    '/v1/tags',
    fetcher,
    { onError: () => {} }
  );

  const isDemo = !!artifactsError && !artifactsResp;
  const items: ArtifactBrief[] = useMemo(() => {
    if (artifactsResp?.items) return artifactsResp.items;
    if (!isDemo) return [];
    // 本地过滤 mock
    return MOCK_ARTIFACTS.filter((a) => {
      if (type && a.artifact_type !== type) return false;
      if (tag && !a.tags.includes(tag)) return false;
      if (active === 'on' && !a.is_active) return false;
      if (active === 'off' && a.is_active) return false;
      if (q) {
        const needle = q.toLowerCase();
        if (
          !a.name.toLowerCase().includes(needle) &&
          !a.description.toLowerCase().includes(needle)
        )
          return false;
      }
      return true;
    });
  }, [artifactsResp, isDemo, type, tag, q, active]);

  const totalAll = artifactsResp?.total ?? (isDemo ? MOCK_ARTIFACTS.length : 0);
  const tags = tagsResp?.items ?? (isDemo ? MOCK_TAGS : []);

  // KPI 总览（基于已加载页 + total 的折中口径）
  const visible = items;
  const visibleActive = visible.filter((a) => a.is_active).length;
  const visibleInactive = visible.length - visibleActive;
  const avgTokens =
    visible.length > 0
      ? Math.round(visible.reduce((s, a) => s + a.body_tokens, 0) / visible.length)
      : 0;

  // sort 排序（客户端，因为后端没暴露 sort 参数）
  const sortedItems = useMemo(() => {
    const arr = [...visible];
    if (sort === 'stars') {
      arr.sort((a, b) => b.source_stars - a.source_stars);
    } else if (sort === 'recommends') {
      arr.sort((a, b) => b.recommend_count - a.recommend_count);
    } else {
      arr.sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
    }
    return arr;
  }, [visible, sort]);

  // —— Bulk: 当前页可见 ID + 选中状态衍生 ——
  const visibleIds = useMemo(() => sortedItems.map((a) => a.id), [sortedItems]);
  const visibleSelectedCount = useMemo(
    () => visibleIds.filter((id) => selected.has(id)).length,
    [visibleIds, selected]
  );
  const allVisibleSelected =
    visibleIds.length > 0 && visibleSelectedCount === visibleIds.length;
  const someVisibleSelected =
    visibleSelectedCount > 0 && !allVisibleSelected;

  const toggleOne = useCallback((id: string, next: boolean) => {
    setSelected((prev) => {
      const ns = new Set(prev);
      if (next) ns.add(id);
      else ns.delete(id);
      return ns;
    });
  }, []);

  const toggleAllVisible = useCallback(
    (next: boolean) => {
      setSelected((prev) => {
        const ns = new Set(prev);
        for (const id of visibleIds) {
          if (next) ns.add(id);
          else ns.delete(id);
        }
        return ns;
      });
    },
    [visibleIds]
  );

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const selectedIds = useMemo(() => Array.from(selected), [selected]);

  const refreshList = useCallback(() => {
    // 让任何 /v1/artifacts? 开头的 SWR key 重新拉取 + tags（artifact_count 可能变）
    mutate((key) => typeof key === 'string' && key.startsWith('/v1/artifacts'));
    mutate('/v1/tags');
  }, [mutate]);

  // ESC 清除选择；Cmd/Ctrl+A 选中当前页全部
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selected.size > 0) {
        clearSelection();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
        const t = e.target as HTMLElement | null;
        const tag = t?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (t && t.isContentEditable)) return;
        e.preventDefault();
        toggleAllVisible(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected.size, clearSelection, toggleAllVisible]);

  // —— Bulk 动作 ——
  const runBulk = useCallback(
    async (
      label: string,
      runner: (
        ids: string[],
        opts: { onProgress: (d: number, t: number) => void }
      ) => Promise<{ ok: string[]; failed: { id: string; error: string }[] }>
    ) => {
      if (selectedIds.length === 0 || bulkBusy) return;
      setBulkBusy(true);
      setBulkProgress({ done: 0, total: selectedIds.length, label });
      const result = await runner(selectedIds, {
        onProgress: (done, total) => setBulkProgress({ done, total, label }),
      });
      setBulkBusy(false);
      setBulkProgress(null);
      refreshList();
      if (result.failed.length === 0) {
        toast.success(`${label} · ${result.ok.length} 项完成`);
      } else {
        toast.warning(
          `${label} · 成功 ${result.ok.length} · 失败 ${result.failed.length}`,
          { description: result.failed.slice(0, 3).map((f) => f.id).join('  ') }
        );
      }
    },
    [selectedIds, bulkBusy, refreshList]
  );

  const handleBulkEnable = useCallback(
    () => runBulk('启用', (ids, opts) => bulkToggleActive(ids, true, opts)),
    [runBulk]
  );
  const handleBulkDisable = useCallback(
    () => runBulk('禁用', (ids, opts) => bulkToggleActive(ids, false, opts)),
    [runBulk]
  );
  const handleBulkDelete = useCallback(async () => {
    await runBulk('删除', (ids, opts) => bulkDelete(ids, opts));
    clearSelection();
  }, [runBulk, clearSelection]);

  const handleExportJson = useCallback(() => {
    const rows = sortedItems.filter((a) => selected.has(a.id));
    const blob = new Blob([JSON.stringify(rows, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `artifacts-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success(`已导出 ${rows.length} 项 JSON`);
  }, [sortedItems, selected]);

  const handleCopyIds = useCallback(async () => {
    const text = selectedIds.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`已复制 ${selectedIds.length} 个 ID`);
    } catch {
      toast.error('剪贴板不可用');
    }
  }, [selectedIds]);

  // URL helpers
  const pushQuery = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    // 修改筛选时回到第一页
    if ('type' in updates || 'tag' in updates || 'q' in updates || 'active' in updates) {
      next.delete('offset');
    }
    router.replace(`/artifacts?${next.toString()}`, { scroll: false });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    pushQuery({ q: searchInput.trim() || null });
  };

  // 分页
  const pageStart = offset + 1;
  const pageEnd = Math.min(offset + sortedItems.length, totalAll);
  const canPrev = offset > 0;
  const canNext = offset + PAGE_SIZE < totalAll;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={isDemo ? 'DEMO MODE · 后端未连接' : 'REGISTRY · UNIFIED VIEW'}
        title="Artifacts"
        description="一个面板浏览所有 skill / MCP / plugin。点击任意行查看详情、调整标签、查看 mcp_config。"
        actions={
          <>
            <form onSubmit={handleSearchSubmit} className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-300 pointer-events-none" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="搜索名称 / 描述"
                className="pl-8 w-64"
              />
            </form>
            <Button asChild variant="oxide" size="md">
              <Link href="/ingest">
                <Plus className="w-4 h-4" />
                新增入库
              </Link>
            </Button>
          </>
        }
      />

      {/* KPI 行 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Surface padding="default">
          <Stat
            label="ARTIFACTS · 总量"
            value={fmtNumber(totalAll)}
            unit="个"
            hint={`本页 ${visible.length} 条`}
            topRight={<Boxes className="w-4 h-4 text-ink-300" />}
          />
        </Surface>
        <Surface padding="default">
          <Stat
            label="本页 · 启用中"
            value={fmtNumber(visibleActive)}
            unit="个"
            hint={`${visible.length === 0 ? 0 : Math.round((visibleActive / visible.length) * 100)}% 在线`}
          />
        </Surface>
        <Surface padding="default">
          <Stat
            label="本页 · 已禁用"
            value={fmtNumber(visibleInactive)}
            unit="个"
            hint="可被人工或自动启用"
          />
        </Surface>
        <Surface padding="default">
          <Stat
            label="平均 token"
            value={fmtNumber(avgTokens)}
            unit="tok"
            hint="单 artifact body 体量"
          />
        </Surface>
      </div>

      {/* 主体 */}
      <div className="grid grid-cols-12 gap-6">
        {/* 左 筛选栏 */}
        <div className="col-span-12 lg:col-span-3">
          <FilterRail
            type={type}
            tag={tag}
            active={active}
            tags={tags}
            tagsLoading={tagsLoading && !isDemo}
            onTypeChange={(t) => pushQuery({ type: t })}
            onTagChange={(t) => pushQuery({ tag: t })}
            onActiveChange={(a) =>
              pushQuery({ active: a === 'all' ? null : a === 'on' ? 'true' : 'false' })
            }
            onReset={() => {
              setSearchInput('');
              router.replace('/artifacts', { scroll: false });
            }}
          />
        </div>

        {/* 右 结果面板 */}
        <div className="col-span-12 lg:col-span-9 space-y-4">
          {/* 顶部工具条 */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap min-w-0">
              <span className="label !mb-0">
                共 <span className="num text-ink-700">{fmtNumber(totalAll)}</span> 条
              </span>
              <ActiveFilterChips
                type={type}
                tag={tag}
                q={q}
                active={active}
                onClearType={() => pushQuery({ type: null })}
                onClearTag={() => pushQuery({ tag: null })}
                onClearQ={() => {
                  setSearchInput('');
                  pushQuery({ q: null });
                }}
                onClearActive={() => pushQuery({ active: null })}
              />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* 排序 */}
              <label className="inline-flex items-center gap-1.5 text-2xs text-ink-400">
                <span className="label !mb-0">排序</span>
                <select
                  value={sort}
                  onChange={(e) => pushQuery({ sort: e.target.value })}
                  className="h-7 px-2 rounded border border-ink-100/80 bg-card text-xs text-ink-700 font-mono focus-ring"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>

              {/* 视图切换 */}
              <div className="inline-flex items-center rounded border border-ink-100/80 bg-card overflow-hidden">
                <button
                  onClick={() => pushQuery({ view: 'table' })}
                  aria-label="表格视图"
                  className={`h-7 w-7 inline-flex items-center justify-center transition-colors duration-150 ${
                    view === 'table'
                      ? 'bg-ink-800 text-parchment-50'
                      : 'text-ink-400 hover:text-ink-800 hover:bg-parchment-200'
                  }`}
                >
                  <Rows3 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => pushQuery({ view: 'card' })}
                  aria-label="卡片视图"
                  className={`h-7 w-7 inline-flex items-center justify-center transition-colors duration-150 ${
                    view === 'card'
                      ? 'bg-ink-800 text-parchment-50'
                      : 'text-ink-400 hover:text-ink-800 hover:bg-parchment-200'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* 内容 */}
          {view === 'table' ? (
            <Surface padding="none">
              {/* 表头 */}
              <div className="hidden md:flex items-stretch border-b border-ink-100/60 bg-parchment-100/60">
                <div className="flex items-center pl-5 pr-2 shrink-0 py-2.5">
                  <RowCheckbox
                    checked={allVisibleSelected}
                    indeterminate={someVisibleSelected}
                    onChange={(next) => toggleAllVisible(next)}
                    label="本页全部"
                  />
                </div>
                <div className="flex-1 min-w-0 grid grid-cols-12 items-center gap-3 pl-2 pr-5 py-2.5">
                  <div className="col-span-4 label !mb-0">名称</div>
                  <div className="col-span-1 label !mb-0">类型</div>
                  <div className="col-span-3 label !mb-0">标签</div>
                  <div className="col-span-1 label !mb-0">Stars</div>
                  <div className="col-span-1 label !mb-0">推荐</div>
                  <div className="col-span-2 label !mb-0 text-right">更新</div>
                </div>
              </div>
              <ul>
                {artifactsLoading && !isDemo
                  ? Array.from({ length: 8 }).map((_, i) => <ArtifactRowSkeleton key={i} />)
                  : sortedItems.map((a) => (
                      <ArtifactRow
                        key={a.id}
                        artifact={a}
                        view="table"
                        selected={selected.has(a.id)}
                        onToggle={toggleOne}
                      />
                    ))}
              </ul>
              {!artifactsLoading && sortedItems.length === 0 && (
                <EmptyState
                  icon={<Search className="w-5 h-5" />}
                  title="没有匹配的 artifact"
                  description="试着放宽筛选条件，或者前往「入库」从 GitHub 拉一个新的仓库。"
                  action={
                    <Button asChild variant="oxide">
                      <Link href="/ingest">
                        <Plus className="w-4 h-4" />
                        入库新仓库
                      </Link>
                    </Button>
                  }
                />
              )}
            </Surface>
          ) : (
            <>
              {artifactsLoading && !isDemo ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <ArtifactCardSkeleton key={i} />
                  ))}
                </div>
              ) : sortedItems.length === 0 ? (
                <EmptyState
                  icon={<Search className="w-5 h-5" />}
                  title="没有匹配的 artifact"
                  description="试着放宽筛选条件，或者前往「入库」从 GitHub 拉一个新的仓库。"
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {sortedItems.map((a) => (
                    <ArtifactRow key={a.id} artifact={a} view="card" />
                  ))}
                </div>
              )}
            </>
          )}

          {/* 分页 */}
          {totalAll > 0 && (
            <div className="flex items-center justify-between text-2xs text-ink-400 pt-2">
              <span className="font-mono">
                第 <span className="num text-ink-700">{pageStart}</span>–
                <span className="num text-ink-700">{pageEnd}</span> 条 ·
                共 <span className="num text-ink-700">{fmtNumber(totalAll)}</span> 条
              </span>
              <div className="flex items-center gap-1">
                <button
                  disabled={!canPrev}
                  onClick={() =>
                    pushQuery({ offset: String(Math.max(0, offset - PAGE_SIZE)) })
                  }
                  className="h-7 px-2 inline-flex items-center gap-1 rounded border border-ink-100/80 bg-card text-ink-600 hover:bg-parchment-200 disabled:opacity-40 disabled:pointer-events-none transition-colors duration-150"
                >
                  <ChevronLeft className="w-3 h-3" /> 上一页
                </button>
                <button
                  disabled={!canNext}
                  onClick={() => pushQuery({ offset: String(offset + PAGE_SIZE) })}
                  className="h-7 px-2 inline-flex items-center gap-1 rounded border border-ink-100/80 bg-card text-ink-600 hover:bg-parchment-200 disabled:opacity-40 disabled:pointer-events-none transition-colors duration-150"
                >
                  下一页 <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 浮动 Bulk 操作条 */}
      <BulkActionsBar
        count={selected.size}
        busy={bulkBusy}
        progress={bulkProgress}
        onAddTag={() => setTagDialogOpen(true)}
        onRemoveTag={() => setTagDialogOpen(true)}
        onEnable={handleBulkEnable}
        onDisable={handleBulkDisable}
        onDelete={() => setDeleteDialogOpen(true)}
        onExportJson={handleExportJson}
        onCopyIds={handleCopyIds}
        onClear={clearSelection}
      />

      {/* 批量打标弹窗 */}
      <BulkTagDialog
        open={tagDialogOpen}
        onOpenChange={setTagDialogOpen}
        selectedIds={selectedIds}
        onCompleted={refreshList}
      />

      {/* 批量删除二次确认 */}
      <BulkConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title={`删除 ${selected.size} 个 artifact`}
        description={
          <>
            该操作会从数据库中移除所选条目及其标签关联。请输入下方文案以确认。
          </>
        }
        dangerText="该操作不可撤销 · 服务端不支持回滚"
        requireText="DELETE"
        confirmLabel={`删除 ${selected.size} 项`}
        onConfirm={handleBulkDelete}
      />
    </div>
  );
}

function ActiveFilterChips({
  type,
  tag,
  q,
  active,
  onClearType,
  onClearTag,
  onClearQ,
  onClearActive,
}: {
  type: ArtifactType | null;
  tag: string | null;
  q: string;
  active: 'all' | 'on' | 'off';
  onClearType: () => void;
  onClearTag: () => void;
  onClearQ: () => void;
  onClearActive: () => void;
}) {
  const chips: Array<{ key: string; label: string; onClear: () => void }> = [];
  if (type) chips.push({ key: 't', label: `type: ${type}`, onClear: onClearType });
  if (tag) chips.push({ key: 'g', label: `tag: ${tag}`, onClear: onClearTag });
  if (q) chips.push({ key: 'q', label: `q: ${q}`, onClear: onClearQ });
  if (active !== 'all')
    chips.push({
      key: 'a',
      label: active === 'on' ? '仅启用' : '仅禁用',
      onClear: onClearActive,
    });
  if (chips.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {chips.map((c) => (
        <button
          key={c.key}
          onClick={c.onClear}
          className="group inline-flex items-center gap-1 h-6 px-2 rounded bg-ink-800 text-parchment-50 text-2xs font-mono hover:bg-ink-700 transition-colors duration-150"
        >
          {c.label}
          <X className="w-2.5 h-2.5 opacity-70 group-hover:opacity-100" />
        </button>
      ))}
    </div>
  );
}

function ArtifactsPageSkeleton() {
  return (
    <div className="space-y-8">
      <div className="h-32 bg-ink-100/30 rounded animate-pulse" />
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 surface animate-pulse" />
        ))}
      </div>
    </div>
  );
}
