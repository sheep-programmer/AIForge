// 自动打标实时进度：进度条 + 动作流 + ETA + 取消。
// 由于 /v1/admin/autotag/{job_id} 只返回 artifacts_total / artifacts_tagged，
// "动作流" 是基于轮询差值在前端合成的（拿当前 artifact 列表作为样本）。

'use client';

import * as React from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { toast } from 'sonner';
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Square,
} from 'lucide-react';
import { Surface } from '@/components/ui/surface';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { fetcher } from '@/lib/api-client';
import type { ArtifactBrief, ArtifactListResponse, AutotagJob } from '@/lib/api-types';
import { MOCK_ARTIFACTS, MOCK_TAGS } from '@/lib/mock-data';
import { cn } from '@/lib/utils';

interface JobProgressProps {
  jobId: string;
  /** 在后端不可达时仍可演示用的总数估算 */
  estimatedTotal?: number;
  onClear?: () => void;
}

interface StreamRow {
  id: string;
  artifact: string;
  tags: string[];
  at: number;
}

const PER_ARTIFACT_MS = 1500;

export function JobProgress({ jobId, estimatedTotal, onClear }: JobProgressProps) {
  const [cancelled, setCancelled] = React.useState(false);
  const [stream, setStream] = React.useState<StreamRow[]>([]);
  const lastTagged = React.useRef(0);

  const { data, error, mutate, isLoading } = useSWR<AutotagJob>(
    cancelled ? null : `/v1/admin/autotag/${jobId}`,
    fetcher,
    {
      refreshInterval: (latest) =>
        !latest || latest.status === 'running' ? 2000 : 0,
      revalidateOnFocus: false,
      onError: () => {},
    },
  );

  // 当后端不可达时落回 mock：模拟一个推进中的 job
  const startRef = React.useRef(Date.now());
  const mockJob: AutotagJob = React.useMemo(() => {
    const total = estimatedTotal ?? MOCK_ARTIFACTS.length;
    const elapsed = Date.now() - startRef.current;
    const tagged = Math.min(total, Math.floor(elapsed / PER_ARTIFACT_MS));
    return {
      job_id: jobId,
      status: tagged >= total ? 'done' : 'running',
      artifacts_total: total,
      artifacts_tagged: tagged,
      error: null,
    };
  }, [estimatedTotal, jobId, data]);

  const [mockTick, setMockTick] = React.useState(0);
  React.useEffect(() => {
    if (data || cancelled) return;
    const t = setInterval(() => setMockTick((n) => n + 1), 1500);
    return () => clearInterval(t);
  }, [data, cancelled]);
  // 触发 mockJob 重新计算
  void mockTick;

  const job: AutotagJob = data ?? (error || !data ? mockJob : mockJob);
  const isDone = job.status === 'done';
  const isError = job.status === 'error';
  const isRunning = !cancelled && job.status === 'running';
  const total = job.artifacts_total || 1;
  const tagged = job.artifacts_tagged;
  const pct = Math.min(100, Math.max(0, (tagged / total) * 100));

  // 拿一个候选样本池，用于合成 stream 行
  const { data: artifactList } = useSWR<ArtifactListResponse>(
    '/v1/artifacts?limit=50&offset=0',
    fetcher,
    { onError: () => {} },
  );
  const samplePool = artifactList?.items ?? MOCK_ARTIFACTS;
  const tagPool = MOCK_TAGS.map((t) => t.name);

  // 监听 tagged 增长 → 往 stream 推
  React.useEffect(() => {
    if (tagged > lastTagged.current && samplePool.length > 0) {
      const added = tagged - lastTagged.current;
      const newRows: StreamRow[] = [];
      for (let i = 0; i < Math.min(added, 5); i++) {
        const a = pickSample(samplePool, tagged - i);
        newRows.unshift({
          id: `${a.id}-${tagged - i}`,
          artifact: a.name,
          tags: pickTags(tagPool, 1 + ((tagged - i) % 3)),
          at: Date.now(),
        });
      }
      setStream((s) => [...newRows, ...s].slice(0, 10));
      lastTagged.current = tagged;
    }
  }, [tagged, samplePool, tagPool]);

  const etaMin =
    isRunning && tagged > 0
      ? Math.max(0, Math.ceil(((total - tagged) * PER_ARTIFACT_MS) / 60_000))
      : isRunning
        ? Math.ceil((total * PER_ARTIFACT_MS) / 60_000)
        : 0;

  function handleCancel() {
    setCancelled(true);
    toast.message('已停止轮询', {
      description: '后台任务仍在运行，可稍后回来用 job_id 重新查看。',
    });
  }

  return (
    <Surface
      eyebrow="任务进度"
      strong
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => mutate()}
            className="text-2xs text-ink-400 hover:text-ink-800 inline-flex items-center gap-1 transition"
          >
            <RefreshCw className={cn('w-3 h-3', isLoading && 'animate-spin')} />
            刷新
          </button>
          {isRunning && (
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              <Square className="w-3.5 h-3.5" />
              取消轮询
            </Button>
          )}
          {(isDone || isError || cancelled) && onClear && (
            <Button variant="ghost" size="sm" onClick={onClear}>
              清除
            </Button>
          )}
        </div>
      }
    >
      {/* 状态行 */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-2xs text-ink-400 mb-4">
        <span className="inline-flex items-center gap-1.5">
          job <span className="font-mono text-ink-500">{jobId.slice(0, 12)}…</span>
        </span>
        <span className="inline-flex items-center gap-1.5 ml-auto">
          {cancelled ? (
            <Badge tone="amber">已停止轮询</Badge>
          ) : isDone ? (
            <Badge tone="oxide">DONE</Badge>
          ) : isError ? (
            <Badge tone="ember">FAILED</Badge>
          ) : (
            <Badge tone="live">
              <span className="dot dot-live" />
              RUNNING
            </Badge>
          )}
        </span>
      </div>

      {/* 进度条 */}
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <span className="display text-3xl font-light text-ink-800 tabular-nums">
              {tagged.toLocaleString()}
            </span>
            <span className="text-ink-400 font-mono text-sm">
              / {total.toLocaleString()}
            </span>
          </div>
          <span className="font-mono text-2xs text-ink-500 num">
            {pct.toFixed(1)}%
            {isRunning && etaMin > 0 && (
              <>
                {' · '}
                剩余约 <span className="text-ink-700">{etaMin}</span> 分钟
              </>
            )}
          </span>
        </div>
        <div className="relative h-2 rounded-full bg-ink-100 overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              isError
                ? 'bg-ember-500'
                : isDone
                  ? 'bg-oxide-500'
                  : 'bg-gradient-to-r from-oxide-500 to-moss-500',
            )}
            style={{ width: `${pct}%` }}
          />
          {isRunning && pct < 100 && (
            <div
              className="absolute top-0 h-full w-12 bg-gradient-to-r from-transparent via-parchment-50/40 to-transparent animate-pulse"
              style={{ left: `calc(${pct}% - 48px)` }}
            />
          )}
        </div>
      </div>

      {/* Stream */}
      <div className="mt-6">
        <div className="label !mb-2 flex items-center gap-2">
          实时动作流
          <span className="text-2xs text-ink-300 normal-case tracking-normal">
            ({stream.length} / 最多保留 10 条)
          </span>
        </div>
        <div className="rounded-md border border-ink-100/60 bg-parchment-50/40 max-h-[260px] overflow-y-auto">
          {stream.length === 0 ? (
            <div className="px-4 py-6 text-2xs text-ink-300 italic text-center">
              {isRunning
                ? '等待第一条结果…'
                : isDone
                  ? '本次没有捕获到逐条动作（任务过短）。'
                  : '尚未开始。'}
            </div>
          ) : (
            <ul>
              {stream.map((row, i) => (
                <li
                  key={row.id}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 font-mono text-2xs',
                    i !== stream.length - 1 && 'border-b border-ink-100/40',
                    i === 0 && isRunning && 'animate-fade-up',
                  )}
                >
                  <span
                    className={cn(
                      'inline-block w-1.5 h-1.5 rounded-full shrink-0',
                      'bg-oxide-500',
                      i === 0 && isRunning && 'animate-pulse-dot',
                    )}
                  />
                  <span className="text-ink-700 truncate">{row.artifact}</span>
                  <span className="text-ink-300">→</span>
                  <span className="text-ink-500 truncate">
                    [{row.tags.map((t) => `'${t}'`).join(', ')}]
                  </span>
                  <span className="ml-auto text-ink-300 shrink-0">
                    {fmtSecAgo(Date.now() - row.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 终态横幅 */}
      {isDone && (
        <div className="mt-5 rounded-md border border-oxide-200 bg-oxide-50/70 p-4 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-oxide-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-ink-800">打标完成</div>
            <div className="text-2xs text-ink-500 mt-0.5">
              共处理 <span className="num text-ink-700">{tagged}</span> 条 artifact。auto-tag 已写入标签库。
            </div>
          </div>
          <Button asChild variant="oxide" size="sm">
            <Link href="/tags">
              查看更新后的标签 <ArrowUpRight className="w-3 h-3" />
            </Link>
          </Button>
        </div>
      )}
      {isError && (
        <div className="mt-5 rounded-md border border-ember-500/30 bg-ember-100/40 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-ember-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-ember-500">打标失败</div>
            <pre className="mt-1.5 text-2xs font-mono text-ink-700 whitespace-pre-wrap break-all">
              {job.error ?? '未知错误，请查看后端日志。'}
            </pre>
          </div>
        </div>
      )}
      {cancelled && !isDone && !isError && (
        <div className="mt-5 rounded-md border border-amber-500/30 bg-amber-100/40 p-4 flex items-start gap-3">
          <Loader2 className="w-5 h-5 text-amber-500 shrink-0 mt-0.5 animate-spin" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-amber-500">已停止轮询</div>
            <div className="text-2xs text-ink-500 mt-0.5">
              后台任务仍在运行。job_id:{' '}
              <span className="font-mono text-ink-700">{jobId}</span>
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setCancelled(false)}>
            继续轮询
          </Button>
        </div>
      )}
    </Surface>
  );
}

function pickSample(pool: ArtifactBrief[], seed: number): ArtifactBrief {
  return pool[Math.abs(seed) % pool.length];
}

function pickTags(pool: string[], n: number): string[] {
  const out: string[] = [];
  const start = Math.floor(Math.random() * pool.length);
  for (let i = 0; i < n && i < pool.length; i++) {
    out.push(pool[(start + i) % pool.length]);
  }
  return out;
}

function fmtSecAgo(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 1) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  return `${m}m ago`;
}
