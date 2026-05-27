'use client';

// /insights — 深度分析面板：召回质量、延迟分布、覆盖矩阵、流量热力。
// 走 mock 优先：API 失败时所有面板都有可读的演示数据。

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Activity, Filter, TrendingDown } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { fetcher } from '@/lib/api-client';
import type {
  ArtifactListResponse,
  HealthResponse,
  PendingDiscovery,
  TagListResponse,
} from '@/lib/api-types';
import {
  MOCK_COVERAGE_MATRIX,
  MOCK_COVERAGE_TAGS,
  MOCK_DISCOVERIES,
  MOCK_HEALTH,
  MOCK_HEATMAP_DATA,
  MOCK_KPI_TIMESERIES,
  MOCK_LATENCY_BUCKETS,
  MOCK_PIPELINE_FUNNEL,
  MOCK_TAG_DISTRIBUTION,
  MOCK_TOP_ARTIFACTS_BY_PERIOD,
  MOCK_TOP_ERRORS,
} from '@/lib/mock-data';
import { PageHeader } from '@/components/ui/page-header';
import { Surface } from '@/components/ui/surface';
import { Badge } from '@/components/ui/badge';
import { HelpTip } from '@/components/ui/help-tip';
import { RecommendationHeatmap } from '@/components/insights/recommendation-heatmap';
import { FunnelChart } from '@/components/insights/funnel-chart';
import { TopArtifactsList } from '@/components/insights/top-artifacts-list';
import { TagDistribution } from '@/components/insights/tag-distribution';
import { LatencyHistogram } from '@/components/insights/latency-histogram';
import { CoverageMatrix } from '@/components/insights/coverage-matrix';
import { RealtimeStrip } from '@/components/insights/realtime-strip';
import { KpiTile } from '@/components/insights/kpi-tile';
import {
  Chip,
  RANGES,
  RangeControl,
  type RangeKey,
} from '@/components/insights/filter-controls';

type TypeFilter = 'all' | 'skill' | 'mcp' | 'plugin';
const TYPE_OPTIONS: { key: TypeFilter; label: string }[] = [
  { key: 'all', label: '全部类型' },
  { key: 'skill', label: 'skill' },
  { key: 'mcp', label: 'mcp' },
  { key: 'plugin', label: 'plugin' },
];

export default function InsightsPage() {
  const [range, setRange] = useState<RangeKey>('7d');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  const { data: rawHealth } = useSWR<HealthResponse>('/v1/health', fetcher, {
    refreshInterval: 15_000,
    onError: () => {},
  });
  const { data: rawArtifacts } = useSWR<ArtifactListResponse>(
    '/v1/artifacts?limit=100&offset=0',
    fetcher,
    { onError: () => {} }
  );
  const { data: rawTags } = useSWR<TagListResponse>('/v1/tags', fetcher, {
    onError: () => {},
  });
  const { data: rawDiscoveries } = useSWR<{ items: PendingDiscovery[] }>(
    '/v1/admin/discoveries',
    fetcher,
    { onError: () => {} }
  );

  const health = rawHealth ?? MOCK_HEALTH;
  const isDemo = !rawArtifacts || !rawHealth;

  // 演示中 p50/p95/p99 — 用 mock 序列的最后一个点近似
  const last = MOCK_KPI_TIMESERIES[MOCK_KPI_TIMESERIES.length - 1];
  const p50 = last.p50;
  const p95 = last.p95;
  const p99 = last.p99;

  const topArtifacts = useMemo(() => {
    return MOCK_TOP_ARTIFACTS_BY_PERIOD.filter(
      (a) => typeFilter === 'all' || a.artifact_type === typeFilter
    ).filter((a) => !tagFilter || a.tags.includes(tagFilter));
  }, [typeFilter, tagFilter]);

  const discoveries = rawDiscoveries?.items ?? MOCK_DISCOVERIES;
  const tagsForChip = (rawTags?.items ?? []).slice(0, 8);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={isDemo ? 'ANALYTICS · DEMO 数据' : 'ANALYTICS · RECOMMENDATION QUALITY'}
        title="深度洞察"
        description="推荐管线的每一层都在这里被量化：召回率、去重压缩率、重排器分布、token 预算命中率、最热 artifact、tag 覆盖矩阵。"
        actions={<RangeControl value={range} onChange={setRange} />}
      />

      {/* —— 过滤 chip 行（sticky） —— */}
      <div className="sticky top-0 z-20 -mx-2 px-2 py-2 bg-parchment-100/80 backdrop-blur-sm border-y border-ink-100/40 flex flex-wrap items-center gap-2">
        <Filter className="w-3.5 h-3.5 text-ink-300" />
        <span className="label !text-[0.55rem] mr-1">FILTER</span>
        {RANGES.map((r) => (
          <Chip
            key={r.key}
            active={r.key === range}
            onClick={() => setRange(r.key)}
            label={r.label}
          />
        ))}
        <span className="w-px h-4 bg-ink-100 mx-1" />
        {TYPE_OPTIONS.map((t) => (
          <Chip
            key={t.key}
            active={t.key === typeFilter}
            onClick={() => setTypeFilter(t.key)}
            label={t.label}
            mono
          />
        ))}
        <span className="w-px h-4 bg-ink-100 mx-1" />
        {tagsForChip.map((t) => (
          <Chip
            key={t.name}
            active={tagFilter === t.name}
            onClick={() => setTagFilter((cur) => (cur === t.name ? null : t.name))}
            label={t.name}
            mono
          />
        ))}
        {tagFilter && (
          <Chip active onClick={() => setTagFilter(null)} label="清除 ×" mono danger />
        )}
        <span className="ml-auto text-2xs text-ink-300 font-mono">
          范围 <span className="text-ink-700">{range.toUpperCase()}</span> · 类型{' '}
          <span className="text-ink-700">{typeFilter}</span>
          {tagFilter && (
            <>
              {' '}· tag <span className="text-ink-700">{tagFilter}</span>
            </>
          )}
        </span>
      </div>

      {/* —— Row 1: KPI strip —— */}
      <Surface eyebrow="KPI · 仪表板" padding="default">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 lg:gap-6 mb-5">
          <KpiTile label="p50 延迟" value={`${p50}`} unit="ms" delta={-6.4} hint="过去 1 小时" />
          <KpiTile
            label="p95 延迟"
            value={`${p95}`}
            unit="ms"
            delta={3.1}
            tone={p95 > 300 ? 'amber' : undefined}
            hint="过去 1 小时"
          />
          <KpiTile
            label="p99 延迟"
            value={`${p99}`}
            unit="ms"
            delta={1.2}
            tone="ember"
            hint="尾延迟，瓶颈在 rerank"
          />
          <KpiTile label="降级回退率" value="1.8" unit="%" tone="oxide" hint="< 5% 表示 rerank 健康" />
          <KpiTile
            label="候选→精选压缩率"
            value="90"
            unit="%"
            tone="oxide"
            hint="30 → 3 平均"
            help="评估 dedup + rerank 把候选压缩到最终注入的程度，越高代表选择越激进。"
          />
          <KpiTile
            label="Token 预算命中率"
            value="96.4"
            unit="%"
            tone="oxide"
            hint="装配阶段未截断"
            help="recommend 时 top-K artifacts 的 token 之和不超过 max_tokens 的请求占比。"
          />
        </div>

        {/* 主 KPI sparkline */}
        <div className="h-[88px] -mx-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={MOCK_KPI_TIMESERIES} margin={{ top: 6, right: 12, left: 12, bottom: 0 }}>
              <defs>
                <linearGradient id="kpi-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0E5C4A" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#0E5C4A" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="t" hide />
              <YAxis hide domain={['dataMin - 10', 'dataMax + 20']} />
              <Tooltip
                cursor={{ stroke: 'rgba(14,17,22,0.18)', strokeWidth: 1 }}
                contentStyle={{
                  background: '#FFFFFF',
                  border: '1px solid rgba(14,17,22,0.1)',
                  borderRadius: 6,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  padding: 8,
                }}
                formatter={(v: number) => [`${v} ms`, 'p95']}
              />
              <Area
                type="monotone"
                dataKey="p95"
                stroke="#0E5C4A"
                strokeWidth={1.2}
                fill="url(#kpi-grad)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center justify-between mt-1 text-2xs text-ink-400 font-mono">
          <span>p95 趋势 · {range.toUpperCase()}</span>
          <span className="inline-flex items-center gap-1">
            <span className="dot dot-live" />
            实时采样 · 30s 步长
          </span>
        </div>
      </Surface>

      {/* —— Row 2: heatmap + funnel —— */}
      <div className="grid grid-cols-12 gap-6">
        <Surface
          eyebrow="调用热力 · 7 天 × 24 小时"
          className="col-span-12 xl:col-span-8"
          actions={
            <span className="text-2xs text-ink-400 font-mono">
              <Activity className="w-3 h-3 inline mr-1 text-oxide-500" />
              基于 /v1/recommend 入口
            </span>
          }
        >
          <RecommendationHeatmap data={MOCK_HEATMAP_DATA} />
        </Surface>

        <Surface
          eyebrow="管线 funnel · 平均每次请求"
          className="col-span-12 xl:col-span-4"
          actions={
            <HelpTip>
              一次推荐请求从 embed→retrieve→dedup→rerank→fit 五个阶段。每行是该阶段的平均剩余候选数；右侧标记上一阶段的丢弃比例。
            </HelpTip>
          }
        >
          <FunnelChart stages={MOCK_PIPELINE_FUNNEL} />
        </Surface>
      </div>

      {/* —— Row 3: top artifacts + latency histogram —— */}
      <div className="grid grid-cols-12 gap-6">
        <Surface
          eyebrow="当期 TOP ARTIFACTS"
          padding="none"
          className="col-span-12 xl:col-span-6"
          actions={
            <span className="text-2xs text-ink-400 font-mono uppercase tracking-wider px-5">
              {topArtifacts.length} 项 · 按推荐次数
            </span>
          }
        >
          {topArtifacts.length > 0 ? (
            <TopArtifactsList items={topArtifacts} />
          ) : (
            <div className="px-5 py-8 text-2xs text-ink-400 text-center font-mono">
              当前过滤器没有匹配 artifact
            </div>
          )}
        </Surface>

        <Surface
          eyebrow="延迟直方图 · /v1/recommend"
          className="col-span-12 xl:col-span-6"
          actions={
            <Badge tone="oxide">
              <TrendingDown className="w-3 h-3" />
              p95 稳定
            </Badge>
          }
        >
          <LatencyHistogram buckets={MOCK_LATENCY_BUCKETS} p50={p50} p95={p95} p99={p99} />
        </Surface>
      </div>

      {/* —— Row 4: coverage matrix + tag distribution —— */}
      <div className="grid grid-cols-12 gap-6">
        <Surface
          eyebrow="覆盖矩阵 · 类型 × 标签"
          className="col-span-12 xl:col-span-7"
          actions={
            <span className="text-2xs text-ink-400 font-mono">
              {MOCK_COVERAGE_TAGS.length} 个 tag × 3 类型
            </span>
          }
        >
          <CoverageMatrix
            rowTypes={['skill', 'mcp', 'plugin']}
            tags={MOCK_COVERAGE_TAGS}
            matrix={MOCK_COVERAGE_MATRIX}
          />
        </Surface>

        <Surface eyebrow="TAG 分布 · 按类型拆分" className="col-span-12 xl:col-span-5">
          <TagDistribution rows={MOCK_TAG_DISTRIBUTION} />
        </Surface>
      </div>

      {/* —— Row 5: realtime strip —— */}
      <Surface eyebrow="实时面板" padding="default">
        <RealtimeStrip
          uptimeSeconds={health.uptime_seconds}
          topErrors={MOCK_TOP_ERRORS}
          discoveries={discoveries}
        />
      </Surface>
    </div>
  );
}
