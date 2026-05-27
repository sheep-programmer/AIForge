'use client';

// 顶部下方的"仪表条"：6-8 个 mini 指标实时滚动，模拟驾驶舱面板。
// 数据走 mock + api.health()，每 5s 抖动一次。可折叠，状态持久化到 localStorage。

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Cpu,
  Gauge,
  HardDrive,
  Network,
  Package,
  Timer,
  Zap,
} from 'lucide-react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { fetcher } from '@/lib/api-client';
import type { HealthResponse } from '@/lib/api-types';
import { MOCK_HEALTH } from '@/lib/mock-data';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'aiforge.system_pulse_expanded';

interface PulseData {
  apiP50: number;
  rerankQueued: number;
  rerankSlots: number;
  embedQueued: number;
  embedSlots: number;
  cacheHit: number;
  diskGb: number;
  rps: number;
  rpsDelta: number;
  toolsExposed: number;
  downstreams: number;
  lastIngestMin: number;
  lastIngestAdded: number;
  sparkline: number[];
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function nextPulse(prev?: PulseData): PulseData {
  const apiP50 = Math.max(40, Math.round((prev?.apiP50 ?? 92) + rand(-8, 8)));
  const sparkline = [...(prev?.sparkline ?? [4, 5, 3, 6, 4, 7, 5, 4]).slice(-7), Math.round(rand(2, 9))];
  const rps = +((prev?.rps ?? 2.1) + rand(-0.4, 0.4)).toFixed(1);
  const rpsDelta = +(rps - (prev?.rps ?? rps)).toFixed(2);
  return {
    apiP50,
    rerankQueued: Math.max(0, Math.round(rand(0, 4))),
    rerankSlots: 4,
    embedQueued: Math.max(0, Math.round(rand(0, 1.6))),
    embedSlots: 1,
    cacheHit: +(rand(91, 97)).toFixed(1),
    diskGb: +(prev?.diskGb ?? 7.4 + rand(-0.05, 0.05)).toFixed(1),
    rps: Math.max(0.1, rps),
    rpsDelta,
    toolsExposed: 34,
    downstreams: 6,
    lastIngestMin: (prev?.lastIngestMin ?? 5) + 0,
    lastIngestAdded: prev?.lastIngestAdded ?? 24,
    sparkline,
  };
}

export function SystemPulse() {
  const { data: health } = useSWR<HealthResponse>('/v1/health', fetcher, {
    refreshInterval: 15_000,
    revalidateOnFocus: false,
    onError: () => {},
  });
  const effectiveHealth = health ?? MOCK_HEALTH;

  const [expanded, setExpanded] = useState(true);
  const [pulse, setPulse] = useState<PulseData>(() => nextPulse());

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(STORAGE_KEY);
      if (v === '0') setExpanded(false);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, expanded ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    const id = window.setInterval(() => setPulse((p) => nextPulse(p)), 5000);
    return () => window.clearInterval(id);
  }, [expanded]);

  const cells = useMemo<PulseCellSpec[]>(
    () => [
      {
        key: 'p50',
        icon: Timer,
        label: 'API p50',
        value: `${pulse.apiP50}ms`,
        sub: <Sparkbar data={pulse.sparkline} />,
        tip: 'API 请求 P50 延迟 · 取最近 60 秒滚动窗口',
      },
      {
        key: 'rerank',
        icon: Gauge,
        label: 'Rerank q',
        value: `${pulse.rerankQueued}/${pulse.rerankSlots}`,
        sub: <QueueBars filled={pulse.rerankQueued} total={pulse.rerankSlots} />,
        tip: '在队列中的 rerank 请求 / 并发 slot 数',
      },
      {
        key: 'embed',
        icon: Cpu,
        label: 'Embed q',
        value: `${pulse.embedQueued}/${pulse.embedSlots}`,
        sub: <QueueBars filled={pulse.embedQueued} total={pulse.embedSlots} />,
        tip: 'Embedding 队列 · BGE-small 单 worker 运行',
      },
      {
        key: 'cache',
        icon: Zap,
        label: 'Cache hit',
        value: `${pulse.cacheHit.toFixed(1)}%`,
        sub: <Bar value={pulse.cacheHit / 100} />,
        tip: '本地推荐结果缓存命中率',
      },
      {
        key: 'disk',
        icon: HardDrive,
        label: 'Disk',
        value: `${pulse.diskGb.toFixed(1)} GB`,
        sub: <Bar value={Math.min(pulse.diskGb / 32, 1)} />,
        tip: '索引 + 元数据占用 (上限 32 GB)',
      },
      {
        key: 'rps',
        icon: Network,
        label: 'RPS',
        value: `${pulse.rps.toFixed(1)}/s`,
        sub:
          pulse.rpsDelta >= 0 ? (
            <span className="inline-flex items-center gap-0.5 text-2xs text-oxide-500 font-mono">
              <ArrowUp className="w-2.5 h-2.5" />
              {pulse.rpsDelta.toFixed(2)}
            </span>
          ) : (
            <span className="inline-flex items-center gap-0.5 text-2xs text-ember-500 font-mono">
              <ArrowDown className="w-2.5 h-2.5" />
              {Math.abs(pulse.rpsDelta).toFixed(2)}
            </span>
          ),
        tip: '当前 5 秒平均请求速率与上一次抽样的差值',
      },
      {
        key: 'gateway',
        icon: Network,
        label: 'Gateway',
        value: `${pulse.toolsExposed}·${pulse.downstreams}`,
        sub: <span className="text-2xs font-mono text-ink-300">tools · ds</span>,
        tip: 'MCP gateway 当前对外暴露的 tool 数与下游服务数',
      },
      {
        key: 'ingest',
        icon: Package,
        label: 'Last ingest',
        value: `${pulse.lastIngestMin}m`,
        sub: (
          <span className="text-2xs font-mono text-oxide-500">
            +{pulse.lastIngestAdded}
          </span>
        ),
        tip: '最近一次成功入库距今时长与新增 artifact 数',
      },
    ],
    [pulse]
  );

  const statusLabel = effectiveHealth.status === 'ok' ? 'NOMINAL' : effectiveHealth.status.toUpperCase();

  return (
    <div className="border-b border-ink-100/60 bg-parchment-100/70 backdrop-blur-md">
      <div
        className={cn(
          'max-w-[1600px] mx-auto px-4 lg:px-8 flex items-stretch',
          expanded ? 'h-9' : 'h-7'
        )}
      >
        <div className="shrink-0 pr-3 mr-3 flex items-center gap-2 border-r border-ink-100/70">
          <span className="dot dot-live" />
          <span className="label !text-2xs !tracking-ultra">SYSTEM · {statusLabel}</span>
        </div>

        {expanded ? (
          <div className="flex-1 min-w-0 flex items-stretch overflow-x-auto">
            <Tooltip.Provider delayDuration={120}>
              {cells.map((c, i) => (
                <PulseCell key={c.key} spec={c} divider={i > 0} />
              ))}
            </Tooltip.Provider>
          </div>
        ) : (
          <div className="flex-1 text-2xs font-mono text-ink-400 flex items-center gap-3 overflow-hidden">
            <span>
              p50 <span className="text-ink-700">{pulse.apiP50}ms</span>
            </span>
            <span className="text-ink-200">·</span>
            <span>
              rps <span className="text-ink-700">{pulse.rps}/s</span>
            </span>
            <span className="text-ink-200">·</span>
            <span>
              cache <span className="text-ink-700">{pulse.cacheHit.toFixed(1)}%</span>
            </span>
            <span className="text-ink-200">·</span>
            <span>
              disk <span className="text-ink-700">{pulse.diskGb} GB</span>
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? '收起仪表' : '展开仪表'}
          className="shrink-0 ml-3 inline-flex items-center justify-center w-7 self-center h-7 rounded text-ink-300 hover:text-ink-800 hover:bg-ink-100/60 transition"
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

interface PulseCellSpec {
  key: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: React.ReactNode;
  tip: string;
}

function PulseCell({ spec, divider }: { spec: PulseCellSpec; divider: boolean }) {
  const Icon = spec.icon;
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <div
          className={cn(
            'shrink-0 flex items-center gap-2 px-3.5 cursor-help group',
            divider && 'border-l border-ink-100/60'
          )}
        >
          <Icon className="w-3 h-3 text-ink-300 group-hover:text-oxide-500 transition" />
          <span className="label !text-[0.625rem] !tracking-ultra text-ink-400">{spec.label}</span>
          <span className="font-mono text-2xs text-ink-800">{spec.value}</span>
          <span className="ml-0.5">{spec.sub}</span>
        </div>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          sideOffset={6}
          className="z-50 max-w-[260px] rounded-md bg-ink-800 text-parchment-50 px-3 py-2 text-2xs leading-relaxed shadow-elevate"
        >
          {spec.tip}
          <Tooltip.Arrow className="fill-ink-800" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function Sparkbar({ data }: { data: number[] }) {
  const max = Math.max(1, ...data);
  return (
    <div className="inline-flex items-end gap-[2px] h-3.5">
      {data.map((v, i) => (
        <span
          key={i}
          className={cn(
            'w-[3px] rounded-sm',
            i === data.length - 1 ? 'bg-oxide-500' : 'bg-ink-200'
          )}
          style={{ height: `${(v / max) * 14}px` }}
        />
      ))}
    </div>
  );
}

function QueueBars({ filled, total }: { filled: number; total: number }) {
  return (
    <span className="inline-flex items-center gap-[2px]">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={cn('w-[6px] h-2 rounded-sm', i < filled ? 'bg-oxide-500' : 'bg-ink-100')}
        />
      ))}
    </span>
  );
}

function Bar({ value }: { value: number }) {
  return (
    <span className="inline-block w-10 h-1 rounded-sm bg-ink-100 overflow-hidden align-middle">
      <span
        className="block h-full bg-oxide-500"
        style={{ width: `${Math.max(0, Math.min(value, 1)) * 100}%` }}
      />
    </span>
  );
}
