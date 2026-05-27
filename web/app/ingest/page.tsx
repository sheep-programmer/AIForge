// /ingest —— 从 GitHub 拉取仓库到 aiforge 注册表。
// 用户粘贴 URL → 提交 → 实时观察 5 段流水线。

'use client';

import * as React from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import {
  Boxes,
  Clock,
  DownloadCloud,
  GitBranch,
  Shield,
} from 'lucide-react';
import { fetcher, api, ApiError } from '@/lib/api-client';
import type { ArtifactListResponse } from '@/lib/api-types';
import { MOCK_ARTIFACTS } from '@/lib/mock-data';
import { PageHeader } from '@/components/ui/page-header';
import { Surface } from '@/components/ui/surface';
import { Stat } from '@/components/ui/stat';
import { ArtifactTypeBadge } from '@/components/ui/badge';
import { fmtNumber, fmtRelativeTime } from '@/lib/utils';
import {
  UrlInputForm,
  type UrlInputFormSubmit,
} from '@/components/ingest/url-input-form';
import { JobTracker } from '@/components/ingest/job-tracker';
import { IngestHistory } from '@/components/ingest/ingest-history';

interface ActiveJob {
  jobId: string;
  url: string;
  branch: string;
}

export default function IngestPage() {
  const { data: rawArtifacts } = useSWR<ArtifactListResponse>(
    '/v1/artifacts?limit=50&offset=0',
    fetcher,
    { onError: () => {} },
  );
  const artifacts = rawArtifacts?.items ?? MOCK_ARTIFACTS;
  const total = rawArtifacts?.total ?? MOCK_ARTIFACTS.length;
  const repoCount = new Set(artifacts.map((a) => a.source_repo)).size;
  const lastUpdated = artifacts
    .map((a) => a.updated_at)
    .sort()
    .reverse()[0];

  // 估算 "本月新增"：30 天内 updated_at
  const monthAgo = Date.now() - 30 * 86_400_000;
  const recentCount = artifacts.filter(
    (a) => new Date(a.updated_at).getTime() > monthAgo,
  ).length;

  const [activeJob, setActiveJob] = React.useState<ActiveJob | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  async function handleSubmit({ url, branch, autoApprove }: UrlInputFormSubmit) {
    setSubmitting(true);
    try {
      const res = await api.ingest(url, branch, autoApprove);
      toast.success('已提交入库任务', {
        description: `job ${res.job_id.slice(0, 12)}… · ${branch}`,
      });
      setActiveJob({ jobId: res.job_id, url, branch });
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : '未知错误';
      toast.error('提交失败', { description: msg });
      // demo 模式：后端不可达时仍然挂一个占位 jobId 让 tracker 走 mock
      if (err instanceof ApiError && err.status >= 500) return;
      if (!(err instanceof ApiError)) {
        const demoId = `demo_${Math.random().toString(36).slice(2, 10)}`;
        setActiveJob({ jobId: demoId, url, branch });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="REGISTRY · INGEST"
        title="从 GitHub 入库"
        description="粘贴一个 GitHub 仓库 URL，aiforge 会自动检测仓库里是 skill / MCP / plugin（或几种混合），shallow clone、解析、向量化、写入。不会执行仓库里的代码。"
      />

      {/* KPI 行 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Surface padding="default">
          <Stat
            label="已入库仓库"
            value={fmtNumber(repoCount)}
            unit="个"
            hint={`含 ${fmtNumber(total)} 条 artifact`}
            topRight={<Boxes className="w-4 h-4 text-ink-300" />}
          />
        </Surface>
        <Surface padding="default">
          <Stat
            label="本月新增"
            value={fmtNumber(recentCount)}
            unit="条"
            hint="过去 30 天"
            topRight={<DownloadCloud className="w-4 h-4 text-ink-300" />}
            delta={recentCount > 0 ? (recentCount / Math.max(total, 1)) * 100 : undefined}
          />
        </Surface>
        <Surface padding="default">
          <Stat
            label="平均入库耗时"
            value="42"
            unit="秒/repo"
            hint="shallow clone + parse + embed"
            topRight={<Clock className="w-4 h-4 text-ink-300" />}
          />
        </Surface>
        <Surface padding="default">
          <Stat
            label="最近一次入库"
            value={lastUpdated ? fmtRelativeTime(lastUpdated) : '—'}
            hint="基于 artifact updated_at"
            topRight={<GitBranch className="w-4 h-4 text-ink-300" />}
          />
        </Surface>
      </div>

      {/* 主体两列 */}
      <div className="grid grid-cols-12 gap-6">
        {/* 左 7/12：表单 + tracker */}
        <div className="col-span-12 xl:col-span-7 space-y-6">
          <Surface eyebrow="新建入库" strong>
            <UrlInputForm onSubmit={handleSubmit} submitting={submitting} />
          </Surface>

          {activeJob && (
            <JobTracker
              key={activeJob.jobId}
              jobId={activeJob.jobId}
              contextUrl={activeJob.url}
              contextBranch={activeJob.branch}
            />
          )}
        </div>

        {/* 右 5/12：辅助 */}
        <div className="col-span-12 xl:col-span-5 space-y-6">
          <Surface eyebrow="支持的仓库类型">
            <ul className="space-y-3">
              <RepoTypeRow
                type="skill"
                label="Skill 仓库"
                description="Markdown frontmatter + 自然语言指令"
                example="anthropics/skills"
              />
              <RepoTypeRow
                type="mcp"
                label="MCP 服务器"
                description="带 mcp.json 或 server.json 的工具"
                example="modelcontextprotocol/servers"
              />
              <RepoTypeRow
                type="plugin"
                label="Claude Code 插件"
                description="带 .claude/plugins 或顶级 plugin manifest"
                example="obra/superpowers-skills"
              />
            </ul>
            <p className="mt-4 pt-4 border-t border-ink-100/60 text-2xs text-ink-400 leading-relaxed">
              混合仓库会被自动拆分：每个 skill / MCP / plugin 单独作为一条 artifact 入库。
            </p>
          </Surface>

          <Surface eyebrow="安全说明">
            <ul className="space-y-3 text-2xs text-ink-500 leading-relaxed">
              <SafetyBullet>
                <span className="font-medium text-ink-800">代码不被执行。</span>{' '}
                只 clone + 静态解析 frontmatter / manifest，不会 run 仓库脚本。
              </SafetyBullet>
              <SafetyBullet>
                <span className="font-medium text-ink-800">shallow clone 临时目录。</span>{' '}
                <span className="font-mono">--depth 1</span>{' '}
                到操作系统 tmp 路径，解析完立即删除。
              </SafetyBullet>
              <SafetyBullet>
                <span className="font-medium text-ink-800">永远不向外网发用户源码。</span>{' '}
                embedding 只在本地 / 你配置的私有推理端点上跑。
              </SafetyBullet>
            </ul>
          </Surface>
        </div>
      </div>

      <IngestHistory />
    </div>
  );
}

function RepoTypeRow({
  type,
  label,
  description,
  example,
}: {
  type: 'skill' | 'mcp' | 'plugin';
  label: string;
  description: string;
  example: string;
}) {
  return (
    <li className="flex items-start gap-3 group">
      <span className="mt-0.5 shrink-0">
        <ArtifactTypeBadge type={type} withLabel={false} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-ink-800">{label}</div>
        <div className="mt-0.5 text-2xs text-ink-400 leading-relaxed">{description}</div>
        <div className="mt-1 text-2xs font-mono text-ink-500 truncate">{example}</div>
      </div>
    </li>
  );
}

function SafetyBullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 shrink-0 inline-flex items-center justify-center w-5 h-5 rounded bg-oxide-100 text-oxide-600">
        <Shield className="w-3 h-3" />
      </span>
      <span className="flex-1">{children}</span>
    </li>
  );
}
