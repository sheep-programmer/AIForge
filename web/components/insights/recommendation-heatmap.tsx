'use client';

// 7×24 调用热力矩阵：行 = 周几（周一→周日），列 = 小时（0-23 UTC）。
// 颜色强度用 oxide 色系映射 cell 的调用次数。

import * as React from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';

interface HeatmapProps {
  /** 7 行 × 24 列。每个单元格代表该 (day, hour) 的调用次数 */
  data: number[][];
}

const DAYS = ['一', '二', '三', '四', '五', '六', '日'];

function intensity(v: number, max: number): { bg: string; text: string } {
  if (max <= 0) return { bg: 'rgba(14,17,22,0.04)', text: 'rgba(14,17,22,0.45)' };
  const r = v / max;
  // oxide-50..oxide-500 五档
  if (r < 0.05) return { bg: 'rgba(14,17,22,0.04)', text: 'rgba(14,17,22,0.45)' };
  if (r < 0.25) return { bg: 'rgba(14,92,74,0.12)', text: 'rgba(14,17,22,0.7)' };
  if (r < 0.5) return { bg: 'rgba(14,92,74,0.28)', text: 'rgba(14,17,22,0.85)' };
  if (r < 0.75) return { bg: 'rgba(14,92,74,0.52)', text: '#FCFBF8' };
  return { bg: 'rgba(14,92,74,0.86)', text: '#FCFBF8' };
}

export function RecommendationHeatmap({ data }: HeatmapProps) {
  const flat = data.flat();
  const max = flat.reduce((m, v) => (v > m ? v : m), 0);
  const total = flat.reduce((s, v) => s + v, 0);

  return (
    <Tooltip.Provider delayDuration={80}>
      <div>
        {/* hour 标尺 */}
        <div className="grid grid-cols-[1.75rem_repeat(24,minmax(0,1fr))] gap-[2px] mb-1.5">
          <span />
          {Array.from({ length: 24 }).map((_, h) => (
            <span
              key={h}
              className="text-[0.55rem] text-ink-300 font-mono text-center tabular-nums leading-none"
            >
              {h % 3 === 0 ? String(h).padStart(2, '0') : ''}
            </span>
          ))}
        </div>

        {/* rows */}
        <div className="space-y-[2px]">
          {data.map((row, d) => (
            <div
              key={d}
              className="grid grid-cols-[1.75rem_repeat(24,minmax(0,1fr))] gap-[2px] items-center"
            >
              <span className="text-2xs text-ink-400 font-mono uppercase tracking-wider text-right pr-1">
                周{DAYS[d]}
              </span>
              {row.map((cell, h) => {
                const { bg } = intensity(cell, max);
                const p95 = 80 + ((d * 31 + h * 7) % 180); // 假 p95
                return (
                  <Tooltip.Root key={h}>
                    <Tooltip.Trigger asChild>
                      <div
                        className="h-5 rounded-[2px] border border-ink-100/40 cursor-default transition hover:ring-1 hover:ring-ink-300"
                        style={{ background: bg }}
                        aria-label={`周${DAYS[d]} ${h}时 ${cell}次`}
                      />
                    </Tooltip.Trigger>
                    <Tooltip.Portal>
                      <Tooltip.Content
                        sideOffset={4}
                        className="z-50 rounded-md bg-ink-800 text-parchment-50 px-2.5 py-2 text-2xs leading-relaxed shadow-elevate"
                      >
                        <div className="font-mono uppercase tracking-wider text-ink-200 mb-1">
                          周{DAYS[d]} · {String(h).padStart(2, '0')}:00
                        </div>
                        <div className="font-mono">
                          <span className="text-moss-500">{cell}</span> 次推荐
                        </div>
                        <div className="font-mono text-ink-200">
                          p95 <span className="text-parchment-50">{p95}</span> ms
                        </div>
                        <Tooltip.Arrow className="fill-ink-800" />
                      </Tooltip.Content>
                    </Tooltip.Portal>
                  </Tooltip.Root>
                );
              })}
            </div>
          ))}
        </div>

        {/* legend */}
        <div className="flex items-center justify-between mt-4">
          <div className="text-2xs text-ink-400 font-mono">
            合计 <span className="text-ink-700 num">{total.toLocaleString()}</span> 次 ·
            峰值 <span className="text-ink-700 num">{max}</span>/时
          </div>
          <div className="flex items-center gap-1.5 text-2xs text-ink-400 font-mono uppercase tracking-wider">
            <span>低</span>
            {[0.04, 0.12, 0.28, 0.52, 0.86].map((a) => (
              <span
                key={a}
                className="inline-block w-4 h-3 rounded-[2px] border border-ink-100/50"
                style={{ background: `rgba(14,92,74,${a})` }}
              />
            ))}
            <span>高</span>
          </div>
        </div>
      </div>
    </Tooltip.Provider>
  );
}
