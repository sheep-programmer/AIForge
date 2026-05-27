'use client';

// 实时面板：world clock / 错误代码 / 自动打标进度 / 待审发现。
// 接收所需数据，避免在父组件里堆几十行。

import { BarChart3, Clock, TrendingUp, Zap } from 'lucide-react';
import { WorldClock } from './world-clock';
import { StatusDot } from '@/components/ui/badge';
import { fmtNumber } from '@/lib/utils';
import type { PendingDiscovery } from '@/lib/api-types';

interface Props {
  uptimeSeconds: number;
  topErrors: { code: string; count: number; hint: string }[];
  discoveries: PendingDiscovery[];
}

export function RealtimeStrip({ uptimeSeconds, topErrors, discoveries }: Props) {
  const pendingCount = discoveries.filter((d) => d.decision === 'pending').length;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* world clock */}
        <div>
          <WorldClock uptimeSeconds={uptimeSeconds} />
        </div>

        {/* top errors */}
        <div className="lg:border-l border-ink-100/60 lg:pl-6">
          <div className="flex items-center justify-between mb-2">
            <span className="label !text-[0.55rem]">过去 1H · 错误代码 TOP 3</span>
            <TrendingUp className="w-3 h-3 text-ember-500" />
          </div>
          <ul className="space-y-1.5">
            {topErrors.map((e, i) => (
              <li key={e.code} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-2xs text-ink-300 w-4 tabular-nums">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <code className="text-2xs font-mono text-ink-700 truncate">{e.code}</code>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-2xs text-ink-300 font-mono truncate hidden xl:inline">
                    {e.hint}
                  </span>
                  <span className="text-2xs font-mono num text-ember-500 bg-ember-100 px-1 rounded-sm">
                    {e.count}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* autotag jobs */}
        <div className="lg:border-l border-ink-100/60 lg:pl-6">
          <div className="flex items-center justify-between mb-2">
            <span className="label !text-[0.55rem]">运行中 · 自动打标</span>
            <Zap className="w-3 h-3 text-oxide-500" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <StatusDot state="active" label="批 #b1f" />
              <span className="font-mono text-2xs text-ink-700 tabular-nums">18 / 32</span>
            </div>
            <div className="h-1 bg-ink-100/60 rounded-full overflow-hidden">
              <div className="h-full bg-oxide-500" style={{ width: '56%' }} />
            </div>
            <div className="flex items-center justify-between text-2xs text-ink-400 font-mono">
              <span>Qwen-1.5B · serial</span>
              <span>est. 2m</span>
            </div>
            <div className="flex items-center justify-between pt-1">
              <StatusDot state="pending" label="批 #ce2" />
              <span className="font-mono text-2xs text-ink-700 tabular-nums">queued</span>
            </div>
          </div>
        </div>

        {/* pending discoveries */}
        <div className="lg:border-l border-ink-100/60 lg:pl-6">
          <div className="flex items-center justify-between mb-2">
            <span className="label !text-[0.55rem]">待审 · 远程发现</span>
            <BarChart3 className="w-3 h-3 text-navy-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="display text-[2rem] leading-none font-light text-ink-800">
              {pendingCount}
            </span>
            <span className="text-2xs font-mono text-ink-400">个仓库</span>
          </div>
          <div className="mt-2 space-y-1">
            {discoveries.slice(0, 3).map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-2">
                <span className="text-2xs font-mono text-ink-700 truncate">{d.source_repo}</span>
                <span className="text-2xs font-mono text-ink-400 num shrink-0">
                  ★ {fmtNumber(d.source_stars)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 pt-4 border-t border-ink-100/60 flex items-center justify-between text-2xs text-ink-400 font-mono">
        <span className="inline-flex items-center gap-2">
          <Clock className="w-3 h-3" />
          数据点采样自 <code className="text-ink-700">/v1/metrics</code>，5 秒滚动窗口
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="dot dot-live" />
          LIVE
        </span>
      </div>
    </>
  );
}
