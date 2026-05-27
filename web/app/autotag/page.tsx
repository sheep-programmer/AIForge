// /autotag —— 小模型批量自动打标。
// 用户配置范围/max_tags/后台开关 → 触发 job → 实时进度。

'use client';

import * as React from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Boxes, Cpu, Tag, Wand2 } from 'lucide-react';
import { fetcher, api, ApiError } from '@/lib/api-client';
import type {
  ArtifactListResponse,
  HealthResponse,
  TagListResponse,
} from '@/lib/api-types';
import { MOCK_ARTIFACTS, MOCK_HEALTH, MOCK_TAGS } from '@/lib/mock-data';
import { PageHeader } from '@/components/ui/page-header';
import { Surface } from '@/components/ui/surface';
import { Stat } from '@/components/ui/stat';
import { TagChip } from '@/components/ui/badge';
import { fmtNumber } from '@/lib/utils';
import {
  AutotagRunner,
  type AutotagRunnerSubmit,
} from '@/components/autotag/autotag-runner';
import { JobProgress } from '@/components/autotag/job-progress';
import { PreviewStrip } from '@/components/autotag/preview-strip';

interface ActiveJob {
  jobId: string;
  total: number;
}

export default function AutotagPage() {
  const { data: rawArtifacts } = useSWR<ArtifactListResponse>(
    '/v1/artifacts?limit=200&offset=0',
    fetcher,
    { onError: () => {} },
  );
  const { data: rawTags } = useSWR<TagListResponse>('/v1/tags', fetcher, {
    onError: () => {},
  });
  const { data: rawHealth } = useSWR<HealthResponse>('/v1/health', fetcher, {
    refreshInterval: 30_000,
    onError: () => {},
  });

  const artifacts = rawArtifacts?.items ?? MOCK_ARTIFACTS;
  const total = rawArtifacts?.total ?? MOCK_ARTIFACTS.length;
  const tags = rawTags?.items ?? MOCK_TAGS;
  const health = rawHealth ?? MOCK_HEALTH;

  const untaggedCount = artifacts.filter((a) => a.tags.length === 0).length;
  // 简化估计：已被 tag 的总数 (无法在 brief 里区分 auto/manual 来源)
  const taggedCount = artifacts.filter((a) => a.tags.length > 0).length;
  // mock: 假设 60% 的 "已 tag" 都是 auto-tag
  const autoTaggedEstimate = Math.floor(taggedCount * 0.6);

  const [activeJob, setActiveJob] = React.useState<ActiveJob | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [runnerState, setRunnerState] = React.useState({
    onlyUntagged: true,
  });

  async function handleSubmit(params: AutotagRunnerSubmit) {
    setSubmitting(true);
    setRunnerState({ onlyUntagged: params.onlyUntagged });
    try {
      const job = await api.startAutotag({
        only_untagged: params.onlyUntagged,
        max_tags_per_artifact: params.maxTagsPerArtifact,
        background: params.background,
      });
      toast.success('已启动打标任务', {
        description: `job ${job.job_id.slice(0, 12)}… · ${job.artifacts_total} 条待处理`,
      });
      setActiveJob({ jobId: job.job_id, total: job.artifacts_total });
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : '未知错误';
      toast.error('启动失败', { description: msg });
      // 后端不可达：进入 demo 模式
      if (!(err instanceof ApiError)) {
        const demoTotal = params.onlyUntagged ? untaggedCount || 8 : total;
        const demoId = `demo_${Math.random().toString(36).slice(2, 10)}`;
        setActiveJob({ jobId: demoId, total: demoTotal });
      }
    } finally {
      setSubmitting(false);
    }
  }

  const estimatedScope = runnerState.onlyUntagged ? untaggedCount : total;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="REGISTRY · AUTO CLASSIFICATION"
        title="小模型自动打标"
        description="用本地 Qwen2.5-1.5B（或 Anthropic Haiku）从 20 个预置标签里给每个 artifact 挑 1-3 个最贴合的。串行处理，每条 ≤ 3s。"
      />

      {/* KPI 行 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Surface padding="default">
          <Stat
            label="全库 artifact"
            value={fmtNumber(total)}
            unit="条"
            hint={`${taggedCount} 已打标 · ${untaggedCount} 未打标`}
            topRight={<Boxes className="w-4 h-4 text-ink-300" />}
          />
        </Surface>
        <Surface padding="default">
          <Stat
            label="已被自动打标"
            value={fmtNumber(autoTaggedEstimate)}
            unit="条"
            hint="预估 · auto 来源占比 ~60%"
            topRight={<Wand2 className="w-4 h-4 text-ink-300" />}
          />
        </Surface>
        <Surface padding="default">
          <Stat
            label="还没自动 tag"
            value={fmtNumber(untaggedCount)}
            unit="条"
            hint="本次默认范围"
            topRight={<Tag className="w-4 h-4 text-ink-300" />}
            delta={untaggedCount > 0 ? -((untaggedCount / Math.max(total, 1)) * 100) : undefined}
          />
        </Surface>
      </div>

      {/* 主体两列 */}
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 xl:col-span-8 space-y-6">
          <Surface eyebrow="任务配置" strong>
            <AutotagRunner
              onSubmit={handleSubmit}
              submitting={submitting}
              estimatedTotal={estimatedScope}
            />
          </Surface>

          {activeJob && (
            <JobProgress
              key={activeJob.jobId}
              jobId={activeJob.jobId}
              estimatedTotal={activeJob.total}
              onClear={() => setActiveJob(null)}
            />
          )}
        </div>

        <div className="col-span-12 xl:col-span-4 space-y-6">
          <Surface eyebrow="候选标签">
            <div className="flex flex-wrap gap-1.5">
              {tags
                .slice()
                .sort((a, b) => b.artifact_count - a.artifact_count)
                .map((t) => (
                  <span key={t.name} className="inline-flex items-center">
                    <TagChip name={`${t.name} · ${t.artifact_count}`} size="sm" />
                  </span>
                ))}
            </div>
            <div className="mt-3 pt-3 border-t border-ink-100/60 text-2xs text-ink-400 leading-relaxed">
              共 <span className="num text-ink-700">{tags.length}</span> 个候选 ·{' '}
              {tags.filter((t) => t.is_builtin).length} 个预置 ·{' '}
              {tags.filter((t) => !t.is_builtin).length} 个自定义
            </div>
          </Surface>

          <Surface eyebrow="LLM 后端">
            <ul className="space-y-2.5">
              <BackendRow
                label="后端"
                value={health.reranker_available ? 'ollama (local)' : 'anthropic haiku'}
                hint={health.reranker_available ? '复用 reranker 通道' : 'API key 已配'}
              />
              <BackendRow
                label="模型"
                value={health.reranker_available ? 'qwen2.5:1.5b' : 'claude-haiku-4-5'}
                hint={health.reranker_available ? '4-bit 量化' : 'managed'}
              />
              <BackendRow
                label="本地体积"
                value={health.reranker_available ? '~1.0 GB' : '0 B'}
                hint={health.reranker_available ? 'GGUF Q4_K_M' : '仅 HTTP 调用'}
              />
              <BackendRow
                label="健康"
                value={
                  <span className="inline-flex items-center gap-1.5">
                    <span className="dot dot-live" />
                    <span className="font-mono text-2xs uppercase tracking-wider">
                      {health.status}
                    </span>
                  </span>
                }
                hint={`uptime · ${Math.floor(health.uptime_seconds / 3600)}h`}
              />
            </ul>
            <div className="mt-3 pt-3 border-t border-ink-100/60 flex items-center gap-2 text-2xs text-ink-400">
              <Cpu className="w-3.5 h-3.5 text-ink-300" />
              每条调用 ≤ 3s · 串行 · 失败自动重试 1 次
            </div>
          </Surface>
        </div>
      </div>

      <PreviewStrip onlyUntagged={runnerState.onlyUntagged} />
    </div>
  );
}

function BackendRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <li className="flex items-baseline justify-between gap-3">
      <span className="label !mb-0 shrink-0">{label}</span>
      <span className="flex-1 text-right min-w-0">
        <div className="text-sm font-mono text-ink-800 truncate">{value}</div>
        {hint && <div className="text-2xs text-ink-400">{hint}</div>}
      </span>
    </li>
  );
}
