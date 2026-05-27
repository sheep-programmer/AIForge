'use client';

import useSWR from 'swr';
import Link from 'next/link';
import {
  ArrowUpRight,
  Boxes,
  Cpu,
  GitBranch,
  Plus,
  Radio,
  Sparkles,
  TagsIcon,
  Wand2,
  Zap,
} from 'lucide-react';
import { fetcher, api } from '@/lib/api-client';
import type { ArtifactListResponse, HealthResponse, TagListResponse } from '@/lib/api-types';
import {
  MOCK_ARTIFACTS,
  MOCK_HEALTH,
  MOCK_RECOMMEND_TIMESERIES,
  MOCK_TAGS,
} from '@/lib/mock-data';
import { PageHeader } from '@/components/ui/page-header';
import { Surface } from '@/components/ui/surface';
import { Stat } from '@/components/ui/stat';
import { Button } from '@/components/ui/button';
import { ArtifactTypeBadge, Badge, StatusDot, TagChip } from '@/components/ui/badge';
import { HelpTip } from '@/components/ui/help-tip';
import { fmtNumber, fmtRelativeTime, truncate } from '@/lib/utils';
import { Reactor } from '@/components/dashboard/reactor';
import { ThroughputChart } from '@/components/dashboard/throughput-chart';
import { TypeMix } from '@/components/dashboard/type-mix';

export default function DashboardPage() {
  const { data: rawHealth } = useSWR<HealthResponse>('/v1/health', fetcher, {
    refreshInterval: 15_000,
    onError: () => {},
  });
  const { data: rawArtifacts } = useSWR<ArtifactListResponse>(
    '/v1/artifacts?limit=50&offset=0',
    fetcher,
    { onError: () => {} }
  );
  const { data: rawTags } = useSWR<TagListResponse>('/v1/tags', fetcher, {
    onError: () => {},
  });

  const health = rawHealth ?? MOCK_HEALTH;
  const artifacts = rawArtifacts?.items ?? MOCK_ARTIFACTS;
  const total = rawArtifacts?.total ?? MOCK_ARTIFACTS.length;
  const tags = rawTags?.items ?? MOCK_TAGS;
  const isDemo = !rawArtifacts || !rawHealth;

  const counts = {
    skill: artifacts.filter((a) => a.artifact_type === 'skill').length,
    mcp: artifacts.filter((a) => a.artifact_type === 'mcp').length,
    plugin: artifacts.filter((a) => a.artifact_type === 'plugin').length,
  };
  const active = artifacts.filter((a) => a.is_active).length;
  const totalRecommends = artifacts.reduce((sum, a) => sum + a.recommend_count, 0);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={isDemo ? 'DEMO MODE · 后端未连接' : 'CONTROL PLANE · LIVE'}
        title={'统揽你的\nagent 工具箱'}
        description={
          '一个面板掌握 skill 知识库、MCP 服务器与 Claude Code 插件。每一次推荐、每一次入库都被记录在此。'
        }
        actions={
          <>
            <Button asChild variant="secondary" size="md">
              <Link href="/playground">
                <Sparkles className="w-4 h-4" />
                Playground
              </Link>
            </Button>
            <Button asChild variant="oxide" size="md">
              <Link href="/ingest">
                <Plus className="w-4 h-4" />
                入库新仓库
              </Link>
            </Button>
          </>
        }
      />

      {/* —— KPI 行 —— */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Surface padding="default">
          <Stat
            label="ARTIFACTS · 总量"
            value={fmtNumber(total)}
            unit="个"
            hint={`${active}/${total} 启用中`}
            topRight={<Boxes className="w-4 h-4 text-ink-300" />}
          >
            <TypeMix counts={counts} />
          </Stat>
        </Surface>

        <Surface padding="default">
          <Stat
            label="标签覆盖"
            value={fmtNumber(tags.length)}
            unit="个 tag"
            hint={`${tags.filter((t) => t.is_builtin).length} 个预置 · 其余自定义`}
            topRight={<TagsIcon className="w-4 h-4 text-ink-300" />}
            delta={12.4}
          />
        </Surface>

        <Surface padding="default">
          <Stat
            label="累计推荐"
            value={fmtNumber(totalRecommends)}
            unit="次注入"
            hint="过去 30 天"
            topRight={<Zap className="w-4 h-4 text-ink-300" />}
            delta={28.7}
          />
        </Surface>

        <Surface padding="default" className="relative overflow-hidden">
          <Stat
            label="推理状态"
            value={health.status === 'ok' ? 'NOMINAL' : health.status.toUpperCase()}
            hint={`embedder ${health.embedder_loaded ? '已加载' : '惰加载'} · reranker ${
              health.reranker_available ? 'Qwen-1.5B' : '不可用'
            }`}
            topRight={<Cpu className="w-4 h-4 text-ink-300" />}
          />
          <Reactor
            active={health.embedder_loaded}
            className="absolute -right-6 -bottom-6 w-32 h-32 opacity-90"
          />
        </Surface>
      </div>

      {/* —— 主体网格：左中右 三栏 —— */}
      <div className="grid grid-cols-12 gap-6">
        {/* 左 8/12: 流量曲线 + 最近 artifact */}
        <div className="col-span-12 xl:col-span-8 space-y-6">
          <Surface
            eyebrow="推荐流量 · 过去 24 小时"
            actions={
              <Link
                href="/playground"
                className="text-2xs text-ink-400 hover:text-ink-800 inline-flex items-center gap-1 transition"
              >
                打开 Playground <ArrowUpRight className="w-3 h-3" />
              </Link>
            }
          >
            <ThroughputChart data={MOCK_RECOMMEND_TIMESERIES} />
          </Surface>

          <Surface
            eyebrow="最近活跃 · ARTIFACTS"
            actions={
              <Link
                href="/artifacts"
                className="text-2xs text-ink-400 hover:text-ink-800 inline-flex items-center gap-1 transition"
              >
                浏览全部 <ArrowUpRight className="w-3 h-3" />
              </Link>
            }
            padding="none"
          >
            <ul>
              {artifacts.slice(0, 6).map((a) => (
                <li key={a.id} className="cell-row">
                  <Link
                    href={`/artifacts/${a.id}`}
                    className="grid grid-cols-12 items-center gap-3 px-5 py-3.5"
                  >
                    <div className="col-span-12 md:col-span-5 flex items-center gap-3 min-w-0">
                      <ArtifactTypeBadge type={a.artifact_type} withLabel={false} />
                      <div className="min-w-0">
                        <div className="font-medium text-sm text-ink-800 truncate">
                          {a.name}
                        </div>
                        <div className="text-2xs text-ink-400 truncate font-mono">
                          {a.source_repo}
                        </div>
                      </div>
                    </div>
                    <div className="hidden md:flex col-span-3 items-center gap-1 flex-wrap">
                      {a.tags.slice(0, 2).map((t) => (
                        <TagChip key={t} name={t} />
                      ))}
                      {a.tags.length > 2 && (
                        <span className="text-2xs text-ink-300">+{a.tags.length - 2}</span>
                      )}
                    </div>
                    <div className="hidden md:flex col-span-2 items-center gap-1.5 text-2xs text-ink-400">
                      <Radio className="w-3 h-3 text-oxide-400" />
                      <span className="num">{fmtNumber(a.recommend_count)}</span>
                      <span className="text-ink-300">次</span>
                    </div>
                    <div className="hidden md:block col-span-2 text-right text-2xs text-ink-400 font-mono">
                      {fmtRelativeTime(a.updated_at)}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Surface>
        </div>

        {/* 右 4/12: 快速操作 + 热门 tag */}
        <div className="col-span-12 xl:col-span-4 space-y-6">
          <Surface eyebrow="快速操作">
            <ul className="space-y-2">
              {[
                {
                  href: '/ingest',
                  icon: GitBranch,
                  title: '从 GitHub 入库',
                  hint: '粘贴仓库 URL · aiforge 自动识别类型',
                },
                {
                  href: '/autotag',
                  icon: Wand2,
                  title: '让小模型自动打标',
                  hint: '复用 Qwen-1.5B reranker · 串行批处理',
                },
                {
                  href: '/playground',
                  icon: Sparkles,
                  title: '试一次推荐',
                  hint: '输入 prompt 查看 top-K 注入预览',
                },
                {
                  href: '/discovery',
                  icon: Radio,
                  title: '审批新发现',
                  hint: '远程 finder 找到的高质量仓库',
                },
              ].map((a) => (
                <li key={a.href}>
                  <Link
                    href={a.href}
                    className="group flex items-start gap-3 p-3 rounded-md hover:bg-parchment-200 transition"
                  >
                    <div className="w-9 h-9 rounded shrink-0 bg-ink-800 text-parchment-50 inline-flex items-center justify-center group-hover:bg-oxide-500 transition">
                      <a.icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="text-sm font-medium text-ink-800 flex items-center gap-2">
                        {a.title}
                        <ArrowUpRight className="w-3 h-3 text-ink-300 opacity-0 group-hover:opacity-100 transition" />
                      </div>
                      <div className="text-2xs text-ink-400 mt-0.5">{a.hint}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Surface>

          <Surface eyebrow="热门分组">
            <div className="flex flex-wrap gap-1.5">
              {tags
                .slice()
                .sort((a, b) => b.artifact_count - a.artifact_count)
                .slice(0, 12)
                .map((t) => (
                  <Link key={t.name} href={`/artifacts?tag=${t.name}`} className="group">
                    <span className="inline-flex items-center gap-1.5 px-2 h-7 rounded border border-ink-100 bg-card text-2xs font-mono text-ink-700 hover:border-ink-300 hover:bg-parchment-200 transition">
                      {t.name}
                      <span className="text-ink-300 num">{t.artifact_count}</span>
                    </span>
                  </Link>
                ))}
            </div>
          </Surface>

          <Surface eyebrow="新手向导" className="bg-gradient-to-br from-card via-parchment-50 to-oxide-100/30">
            <div className="space-y-3">
              {[
                { step: 1, title: '入库一个仓库', done: total > 0 },
                { step: 2, title: '让小模型自动打标', done: tags.some((t) => t.artifact_count > 0) },
                { step: 3, title: '在 Playground 试一次推荐', done: totalRecommends > 0 },
                { step: 4, title: '安装 MCP / Plugin 到本地', done: false },
              ].map((s) => (
                <div key={s.step} className="flex items-center gap-3">
                  <div
                    className={`shrink-0 w-6 h-6 rounded-full inline-flex items-center justify-center text-2xs font-mono ${
                      s.done
                        ? 'bg-oxide-500 text-parchment-50'
                        : 'bg-card border border-ink-200 text-ink-400'
                    }`}
                  >
                    {s.done ? '✓' : s.step}
                  </div>
                  <span
                    className={`text-sm ${s.done ? 'text-ink-400 line-through' : 'text-ink-700'}`}
                  >
                    {s.title}
                  </span>
                  {s.step === 2 && (
                    <HelpTip>
                      自动打标会调用 Ollama 上的 Qwen2.5-1.5B（可换 Haiku），从 20 个预置 tag 里挑 1-3 个。每个 artifact 一次调用，串行执行。
                    </HelpTip>
                  )}
                </div>
              ))}
            </div>
          </Surface>
        </div>
      </div>
    </div>
  );
}
