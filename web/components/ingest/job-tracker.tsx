// 实时入库进度面板：轮询 /v1/ingest/{job_id} 直到 done / error。
// 渲染 5 段管道（pending → fetching → parsing → embedding → done）+ 计时器。

'use client';

import * as React from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  DownloadCloud,
  GitBranch,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { Surface } from '@/components/ui/surface';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { fetcher } from '@/lib/api-client';
import type { IngestJob } from '@/lib/api-types';
import { MOCK_INGEST_JOB } from '@/lib/mock-data';
import { cn } from '@/lib/utils';

interface JobTrackerProps {
  jobId: string;
  /** 提交时附带的 URL/branch，便于在还没轮询到结果时也能展示上下文 */
  contextUrl?: string;
  contextBranch?: string;
}

type Phase = 'pending' | 'fetching' | 'parsing' | 'embedding' | 'done';

const PHASES: { key: Phase; label: string; description: string }[] = [
  { key: 'pending', label: '排队', description: '等待 worker' },
  { key: 'fetching', label: '抓取', description: 'shallow clone' },
  { key: 'parsing', label: '解析', description: '读 frontmatter / manifest' },
  { key: 'embedding', label: '向量化', description: '生成 embedding' },
  { key: 'done', label: '完成', description: '入库' },
];

function phaseIndex(status: IngestJob['status']): number {
  if (status === 'error') return -1;
  const i = PHASES.findIndex((p) => p.key === status);
  return i < 0 ? 0 : i;
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m}m ${rs}s`;
}

function repoSlug(url?: string | null): string {
  if (!url) return '';
  const m = url.match(/github\.com\/([\w.-]+\/[\w.-]+?)(?:\.git|\/)?$/);
  return m ? m[1] : url;
}

export function JobTracker({ jobId, contextUrl, contextBranch }: JobTrackerProps) {
  const startedAt = React.useMemo(() => Date.now(), [jobId]);
  const [now, setNow] = React.useState(() => Date.now());

  // 用 SWR 的 refreshInterval 实时轮询；终态时关闭轮询。
  const { data, error, mutate, isLoading } = useSWR<IngestJob>(
    `/v1/ingest/${jobId}`,
    fetcher,
    {
      refreshInterval: (latest) =>
        latest && (latest.status === 'done' || latest.status === 'error') ? 0 : 1500,
      revalidateOnFocus: false,
      onError: () => {},
    },
  );

  // 在终态前每 200ms 推动 elapsed 计数。
  const isTerminal = data?.status === 'done' || data?.status === 'error';
  React.useEffect(() => {
    if (isTerminal) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [isTerminal]);

  // 后端连不上时落回 mock，便于演示
  const job: IngestJob =
    data ??
    (error
      ? { ...MOCK_INGEST_JOB, job_id: jobId, source_url: contextUrl ?? MOCK_INGEST_JOB.source_url }
      : { job_id: jobId, status: 'pending', skills_added: 0, skills_updated: 0, error: null });

  const idx = phaseIndex(job.status);
  const isError = job.status === 'error';
  const repo = repoSlug(job.source_url ?? contextUrl ?? '');
  const elapsed = isTerminal && data ? null : now - startedAt;

  return (
    <Surface
      eyebrow="入库进行中"
      actions={
        <button
          type="button"
          onClick={() => mutate()}
          className="text-2xs text-ink-400 hover:text-ink-800 inline-flex items-center gap-1 transition"
        >
          <RefreshCw className={cn('w-3 h-3', isLoading && 'animate-spin')} />
          刷新
        </button>
      }
    >
      {/* 元信息行 */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-5 text-2xs text-ink-400">
        <span className="inline-flex items-center gap-1.5 font-mono text-ink-700">
          <DownloadCloud className="w-3.5 h-3.5 text-ink-300" />
          {repo || <span className="text-ink-300">unknown repo</span>}
        </span>
        {contextBranch && (
          <span className="inline-flex items-center gap-1.5 font-mono">
            <GitBranch className="w-3 h-3 text-ink-300" />
            {contextBranch}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          job
          <span className="font-mono text-ink-500">{jobId.slice(0, 12)}…</span>
        </span>
        <span className="inline-flex items-center gap-1.5 ml-auto">
          {isTerminal ? (
            isError ? (
              <Badge tone="ember">FAILED</Badge>
            ) : (
              <Badge tone="oxide">DONE</Badge>
            )
          ) : (
            <Badge tone="live">
              <span className="dot dot-live" />
              LIVE
            </Badge>
          )}
          {elapsed !== null && (
            <span className="font-mono text-ink-500 num">{fmtDuration(elapsed)}</span>
          )}
        </span>
      </div>

      {/* 5 段管道 */}
      <Pipeline status={job.status} />

      {/* 阶段说明 */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-6 text-2xs">
        <Metric label="新增 artifact" value={job.skills_added} accent={job.skills_added > 0} />
        <Metric label="更新 artifact" value={job.skills_updated} />
        <Metric
          label="当前阶段"
          value={
            isError ? (
              <span className="text-ember-500">{job.status}</span>
            ) : (
              <span className="font-mono">{PHASES[idx]?.key ?? job.status}</span>
            )
          }
        />
      </div>

      {/* 终态：成功/失败横幅 */}
      {job.status === 'done' && (
        <div className="mt-5 rounded-md border border-oxide-200 bg-oxide-50/70 p-4 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-oxide-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-ink-800">入库成功</div>
            <div className="text-2xs text-ink-500 mt-0.5">
              新增 <span className="num text-ink-700">{job.skills_added}</span> 条，更新{' '}
              <span className="num text-ink-700">{job.skills_updated}</span> 条。
              下一步：自动打标 / 抽样审阅。
            </div>
          </div>
          <Button asChild variant="oxide" size="sm">
            <Link
              href={
                repo
                  ? `/artifacts?source_repo=${encodeURIComponent(repo)}`
                  : '/artifacts'
              }
            >
              查看入库结果 <ArrowUpRight className="w-3 h-3" />
            </Link>
          </Button>
        </div>
      )}

      {job.status === 'error' && (
        <div className="mt-5 rounded-md border border-ember-500/30 bg-ember-100/40 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-ember-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-ember-500">入库失败</div>
            <pre className="mt-1.5 text-2xs font-mono text-ink-700 whitespace-pre-wrap break-all">
              {job.error ?? '未知错误。请检查 URL 是否可访问以及后端日志。'}
            </pre>
          </div>
        </div>
      )}
    </Surface>
  );
}

function Pipeline({ status }: { status: IngestJob['status'] }) {
  const idx = phaseIndex(status);
  const isError = status === 'error';

  return (
    <ol className="relative grid grid-cols-5 gap-2">
      {/* 底层连线 */}
      <span
        aria-hidden
        className="absolute top-3 left-3 right-3 h-px bg-ink-100"
      />
      {!isError && idx > 0 && (
        <span
          aria-hidden
          className="absolute top-3 left-3 h-px bg-oxide-400 transition-all"
          style={{
            width: `calc(${(idx / (PHASES.length - 1)) * 100}% - 12px)`,
          }}
        />
      )}

      {PHASES.map((p, i) => {
        const done = !isError && i < idx;
        const current = !isError && i === idx && status !== 'done';
        const finalDone = !isError && p.key === 'done' && status === 'done';
        return (
          <li key={p.key} className="relative flex flex-col items-start gap-1.5">
            <span
              className={cn(
                'relative z-10 inline-flex items-center justify-center w-6 h-6 rounded-full border bg-card transition',
                done && 'border-oxide-400 bg-oxide-500 text-parchment-50',
                finalDone && 'border-oxide-400 bg-oxide-500 text-parchment-50',
                current &&
                  'border-oxide-400 text-oxide-600 shadow-[0_0_0_4px_rgba(63,199,154,0.18)]',
                !done && !current && !finalDone && 'border-ink-200 text-ink-300',
                isError && i === 0 && 'border-ember-500 text-ember-500',
              )}
            >
              {done || finalDone ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : current ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : isError && i === 0 ? (
                <AlertCircle className="w-3.5 h-3.5" />
              ) : (
                <span className="text-2xs font-mono">{i + 1}</span>
              )}
            </span>
            <div className="min-w-0">
              <div
                className={cn(
                  'text-2xs font-medium uppercase tracking-wider',
                  done || finalDone ? 'text-oxide-600' : current ? 'text-ink-800' : 'text-ink-400',
                )}
              >
                {p.label}
              </div>
              <div className="text-2xs text-ink-400 leading-tight font-mono">{p.description}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="rounded-md border border-ink-100/70 bg-parchment-50/60 px-3 py-2">
      <div className="label !mb-0.5 text-[0.625rem]">{label}</div>
      <div
        className={cn(
          'display text-lg leading-none tracking-tight',
          accent ? 'text-oxide-600' : 'text-ink-800',
        )}
      >
        {value}
      </div>
    </div>
  );
}
