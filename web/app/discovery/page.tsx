'use client';

import * as React from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import {
  Clock,
  GitPullRequestArrow,
  MessageSquare,
  Radio,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import { api, fetcher } from '@/lib/api-client';
import type { PendingDiscovery } from '@/lib/api-types';
import { MOCK_DISCOVERIES } from '@/lib/mock-data';
import { PageHeader } from '@/components/ui/page-header';
import { Surface } from '@/components/ui/surface';
import { Stat } from '@/components/ui/stat';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DiscoveryRow } from '@/components/discovery/discovery-row';
import { DiscoveryEmpty } from '@/components/discovery/discovery-empty';
import { fmtNumber, cn } from '@/lib/utils';

type Filter = 'all' | 'pending' | 'approved' | 'rejected';
type LocalDecisionMap = Record<string, 'approved' | 'rejected' | undefined>;

const REMOTE_FINDER_ENABLED = process.env.NEXT_PUBLIC_AIFORGE_REMOTE_FINDER !== 'false';

export default function DiscoveryPage() {
  const { data, error, mutate, isLoading } = useSWR<{ items: PendingDiscovery[] }>(
    '/v1/admin/discoveries',
    fetcher,
    { onError: () => {} }
  );

  // 后端不可用回退到 demo 数据
  const isDemo = !data && (error || !isLoading);
  const items = data?.items ?? (isDemo ? MOCK_DISCOVERIES : []);

  const [filter, setFilter] = React.useState<Filter>('pending');
  const [localDecisions, setLocalDecisions] = React.useState<LocalDecisionMap>({});
  const [busyId, setBusyId] = React.useState<string | null>(null);

  // dialog state
  const [pending, setPending] = React.useState<{
    item: PendingDiscovery;
    action: 'approve' | 'reject';
  } | null>(null);
  const [notes, setNotes] = React.useState('');

  // 合并真实 decision 与本地乐观决策
  const effectiveDecision = React.useCallback(
    (it: PendingDiscovery): PendingDiscovery['decision'] => {
      const local = localDecisions[it.id];
      if (local) return local;
      return it.decision;
    },
    [localDecisions]
  );

  const counts = React.useMemo(() => {
    let pending_ = 0;
    let approved = 0;
    let rejected = 0;
    for (const it of items) {
      const d = effectiveDecision(it);
      if (d === 'pending') pending_++;
      else if (d === 'approved') approved++;
      else if (d === 'rejected') rejected++;
    }
    return { pending: pending_, approved, rejected };
  }, [items, effectiveDecision]);

  const filtered = React.useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((it) => effectiveDecision(it) === filter);
  }, [items, filter, effectiveDecision]);

  const openDialog = (item: PendingDiscovery, action: 'approve' | 'reject') => {
    setPending({ item, action });
    setNotes('');
  };

  const confirm = async () => {
    if (!pending) return;
    const { item, action } = pending;
    setBusyId(item.id);
    try {
      if (action === 'approve') {
        const res = await api.approveDiscovery(item.id, notes || undefined);
        toast.success('已批准 · 已加入入库队列', {
          description: res.ingest_job_id
            ? `job_id ${res.ingest_job_id}`
            : '后台 ingest 已派发',
        });
        setLocalDecisions((m) => ({ ...m, [item.id]: 'approved' }));
      } else {
        await api.rejectDiscovery(item.id, notes || undefined);
        toast.success('已拒绝', {
          description: `${item.source_repo} 进入永不推荐名单`,
        });
        setLocalDecisions((m) => ({ ...m, [item.id]: 'rejected' }));
      }
      // 乐观更新 SWR 缓存
      mutate(
        (cur) =>
          cur
            ? {
                ...cur,
                items: cur.items.map((x) =>
                  x.id === item.id
                    ? { ...x, decision: action === 'approve' ? 'approved' : 'rejected' }
                    : x
                ),
              }
            : cur,
        { revalidate: false }
      );
      setPending(null);
    } catch (err) {
      // 即便服务端不可达，演示态也乐观标记
      setLocalDecisions((m) => ({
        ...m,
        [item.id]: action === 'approve' ? 'approved' : 'rejected',
      }));
      toast.error('网络异常 · 已在本地记录决策', {
        description: err instanceof Error ? err.message : '稍后会自动重试',
      });
      setPending(null);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={isDemo ? 'ADMIN · DEMO MODE' : 'ADMIN · APPROVAL QUEUE'}
        title={'审批新发现'}
        description="远程 finder 在 GitHub 上找到的高质量 skill / MCP / plugin 仓库。批准后自动 ingest；拒绝后永不再次推荐。"
      />

      {/* 关闭提示 */}
      {!REMOTE_FINDER_ENABLED && (
        <Surface
          className={cn('border-l-2 border-l-amber-500 bg-amber-100/40')}
          padding="tight"
        >
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 shrink-0 rounded bg-amber-500 text-parchment-50 inline-flex items-center justify-center">
              <Radio className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-amber-500">
                远程 finder 当前未启用
              </div>
              <div className="mt-0.5 text-2xs text-ink-500 leading-relaxed font-mono">
                设置 <span className="text-ink-800">AIFORGE_ENABLE_REMOTE_FINDER=true</span>{' '}
                后这个队列才会有新条目。当前列表只显示历史决策。
              </div>
            </div>
          </div>
        </Surface>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {([
          { label: '待审批', value: fmtNumber(counts.pending), unit: '个', hint: '等待你的判断', icon: <GitPullRequestArrow className="w-4 h-4 text-ink-300" /> },
          { label: '已批准', value: fmtNumber(counts.approved), unit: '个', hint: '已进入 ingest 队列', icon: <ThumbsUp className="w-4 h-4 text-oxide-500" /> },
          { label: '已拒绝', value: fmtNumber(counts.rejected), unit: '个', hint: '永不推荐名单', icon: <ThumbsDown className="w-4 h-4 text-ember-500" /> },
          { label: '平均处理', value: '—', unit: 'h', hint: '从发现到决策', icon: <Clock className="w-4 h-4 text-ink-300" /> },
        ] as const).map((k) => (
          <Surface key={k.label} padding="default">
            <Stat label={k.label} value={k.value} unit={k.unit} hint={k.hint} topRight={k.icon} size="sm" />
          </Surface>
        ))}
      </div>

      {/* filter segmented control */}
      <div className="flex items-center justify-between gap-3">
        <FilterChips active={filter} onChange={setFilter} counts={counts} />
        <span className="font-mono text-2xs text-ink-400">
          {filtered.length} / {items.length} 显示
        </span>
      </div>

      {/* list */}
      {filtered.length === 0 ? (
        <DiscoveryEmpty filter={filter} />
      ) : (
        <Surface padding="none">
          <ul>
            {filtered.map((it) => (
              <DiscoveryRow
                key={it.id}
                item={it}
                busy={busyId === it.id}
                localDecision={localDecisions[it.id] ?? null}
                onApprove={(x) => openDialog(x, 'approve')}
                onReject={(x) => openDialog(x, 'reject')}
              />
            ))}
          </ul>
        </Surface>
      )}

      <ConfirmDialog
        pending={pending}
        notes={notes}
        setNotes={setNotes}
        busy={pending ? busyId === pending.item.id : false}
        onCancel={() => setPending(null)}
        onConfirm={confirm}
      />
    </div>
  );
}

function ConfirmDialog({
  pending,
  notes,
  setNotes,
  busy,
  onCancel,
  onConfirm,
}: {
  pending: { item: PendingDiscovery; action: 'approve' | 'reject' } | null;
  notes: string;
  setNotes: (v: string) => void;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isApprove = pending?.action === 'approve';
  return (
    <Dialog open={pending !== null} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        {pending && (
          <>
            <DialogHeader>
              <DialogTitle>{isApprove ? '批准入库' : '拒绝并加入黑名单'}</DialogTitle>
              <DialogDescription>
                {isApprove
                  ? '后台会立即对该仓库发起 ingest，完成后 artifact 自动可推荐。'
                  : '该仓库将永远不会再被远程 finder 上报。请简单说明原因（可选）。'}
              </DialogDescription>
            </DialogHeader>
            <div className="px-6 pb-3 space-y-3">
              <div className="rounded-md border border-ink-100 bg-parchment-50 px-3 py-2 font-mono text-2xs text-ink-700">
                {pending.item.source_repo}
                <span className="text-ink-300 ml-2">
                  · {fmtNumber(pending.item.source_stars)} stars · {pending.item.skill_count} skill
                </span>
              </div>
              <div>
                <label htmlFor="notes" className="label !mb-1.5 inline-flex items-center gap-1.5">
                  <MessageSquare className="w-3 h-3" />
                  备注 · 可选
                </label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder={
                    isApprove
                      ? '例如：值得推荐给做安全审查的 agent'
                      : '例如：与现有 superpowers 高度重复'
                  }
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 pb-5 pt-2 border-t hairline">
              <Button variant="ghost" onClick={onCancel}>取消</Button>
              <Button
                variant={isApprove ? 'oxide' : 'danger'}
                onClick={onConfirm}
                disabled={busy}
              >
                {isApprove ? <ThumbsUp className="w-3.5 h-3.5" /> : <ThumbsDown className="w-3.5 h-3.5" />}
                {isApprove ? '确认批准' : '确认拒绝'}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FilterChips({
  active,
  onChange,
  counts,
}: {
  active: Filter;
  onChange: (f: Filter) => void;
  counts: { pending: number; approved: number; rejected: number };
}) {
  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: '全部', count: counts.pending + counts.approved + counts.rejected },
    { key: 'pending', label: '待审批', count: counts.pending },
    { key: 'approved', label: '已批准', count: counts.approved },
    { key: 'rejected', label: '已拒绝', count: counts.rejected },
  ];
  return (
    <div className="inline-flex p-0.5 rounded-md border border-ink-100 bg-card">
      {tabs.map((t) => {
        const isActive = active === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={cn(
              'inline-flex items-center gap-1.5 h-7 px-3 rounded text-2xs transition focus-ring',
              isActive
                ? 'bg-ink-800 text-parchment-50'
                : 'text-ink-500 hover:text-ink-800 hover:bg-parchment-200/60'
            )}
          >
            {t.label}
            <span
              className={cn(
                'num font-mono px-1 rounded-sm',
                isActive ? 'bg-parchment-50/15 text-parchment-50' : 'bg-ink-100 text-ink-500'
              )}
            >
              {t.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
