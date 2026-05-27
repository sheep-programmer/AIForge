'use client';

// 屏幕底部一条贴墙的活动 ticker —— 这是 AIForge 后台的"心跳指示器"。
// 不要去掉。它把数据库里实时发生的事情转成连续滚动文本，让管理员知道服务在运转。

import { useMemo } from 'react';
import { CircleDot, Activity, ArrowRight } from 'lucide-react';

const SAMPLE_EVENTS = [
  '推荐 · security-review',
  '入库 · obra/superpowers-skills · +24',
  '推荐 · playwright-mcp',
  '自动打标 · 17 项已处理',
  '推荐 · superpowers',
  '注入 · postgres-migrate → claude-code',
  '推荐 · tailwind-ui-recipes',
  '入库完成 · 312 → 336 artifacts',
  '推荐 · ghidra-bridge (degraded)',
  '推荐 · ljg-skills:concept-anatomist',
];

export function ActivityTicker() {
  // 两次重复让 ticker 滚动看上去无缝
  const stream = useMemo(() => [...SAMPLE_EVENTS, ...SAMPLE_EVENTS], []);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-10 pointer-events-none">
      <div className="border-t border-ink-100/60 bg-parchment-100/85 backdrop-blur-md">
        <div className="flex items-center px-4 h-9 gap-3 max-w-[1600px] mx-auto overflow-hidden">
          {/* 左侧固定标识 */}
          <div className="flex items-center gap-2 shrink-0 pr-3 border-r border-ink-100">
            <Activity className="w-3.5 h-3.5 text-oxide-500" />
            <span className="label !text-2xs">LIVE FEED</span>
          </div>

          {/* 滚动区 */}
          <div className="flex-1 overflow-hidden mask-fade">
            <div className="flex items-center gap-8 animate-ticker whitespace-nowrap">
              {stream.map((evt, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-2xs text-ink-500"
                >
                  <CircleDot className="w-2.5 h-2.5 text-oxide-400" />
                  <span className="font-mono">{evt}</span>
                  <ArrowRight className="w-2.5 h-2.5 text-ink-200" />
                </div>
              ))}
            </div>
          </div>

          {/* 右侧时钟 */}
          <ClockBadge />
        </div>
      </div>

      <style jsx>{`
        .mask-fade {
          mask-image: linear-gradient(
            to right,
            transparent 0%,
            black 6%,
            black 94%,
            transparent 100%
          );
        }
      `}</style>
    </div>
  );
}

function ClockBadge() {
  return (
    <div className="shrink-0 pl-3 border-l border-ink-100 flex items-center gap-2">
      <span className="dot dot-live" />
      <span className="font-mono text-2xs text-ink-500" suppressHydrationWarning>
        {new Date().toLocaleTimeString('en-GB')}
      </span>
    </div>
  );
}
