'use client';

// 单个 agent 卡片：展示某台机器上某家 agent（Claude Code / Codex / ...）已装的清单。
// 头部是 agent 图标 + 名称 + 计数徽章；正文是按类型分组、可折叠的 install-row 列表。

import * as React from 'react';
import {
  Bot,
  ChevronDown,
  Code2,
  MonitorSmartphone,
  Sparkles,
  Wind,
  type LucideIcon,
} from 'lucide-react';
import type { AgentEnv } from '@/lib/api-types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { InstallRow } from './install-row';

interface AgentGlyph {
  icon: LucideIcon;
  /** 图标底色 + 前景色 */
  tint: string;
}

// 各家 agent 的图标 / 配色（单一 oxide 强调 + 中性色，避免花哨）
const AGENT_GLYPH: Record<string, AgentGlyph> = {
  'claude-code': { icon: Sparkles, tint: 'bg-oxide-100 text-oxide-600' },
  codex: { icon: Code2, tint: 'bg-ink-100 text-ink-600' },
  cursor: { icon: MonitorSmartphone, tint: 'bg-navy-100 text-navy-500' },
  'gemini-cli': { icon: Bot, tint: 'bg-amber-100 text-amber-500' },
  windsurf: { icon: Wind, tint: 'bg-navy-100 text-navy-500' },
  vscode: { icon: Code2, tint: 'bg-navy-100 text-navy-500' },
};

const FALLBACK_GLYPH: AgentGlyph = { icon: Bot, tint: 'bg-ink-100 text-ink-600' };

export function AgentCard({ agent }: { agent: AgentEnv }) {
  const [open, setOpen] = React.useState(true);
  const glyph = AGENT_GLYPH[agent.agent] ?? FALLBACK_GLYPH;
  const Icon = glyph.icon;
  const total = agent.counts.mcp + agent.counts.plugin + agent.counts.skill;

  return (
    <div className="surface overflow-hidden flex flex-col">
      {/* 头部 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-3 px-4 py-3.5 text-left hover:bg-parchment-200/40 transition"
      >
        <span
          className={cn(
            'shrink-0 w-9 h-9 rounded-md inline-flex items-center justify-center',
            glyph.tint
          )}
        >
          <Icon className="w-4 h-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-ink-800 flex items-center gap-2">
            {agent.display}
            {!agent.detected && (
              <Badge tone="neutral">未检测到配置</Badge>
            )}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-2xs font-mono text-ink-400">
            <span className="num text-ink-700">{agent.counts.mcp}</span> mcp
            <span className="text-ink-200">·</span>
            <span className="num text-ink-700">{agent.counts.plugin}</span> plugin
            <span className="text-ink-200">·</span>
            <span className="num text-ink-700">{agent.counts.skill}</span> skill
          </div>
        </div>
        <ChevronDown
          className={cn(
            'w-4 h-4 text-ink-300 shrink-0 transition-transform',
            open && 'rotate-180'
          )}
        />
      </button>

      {/* config 路径 */}
      {agent.config_paths.length > 0 && (
        <div className="px-4 pb-2 -mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
          {agent.config_paths.map((p) => (
            <span key={p} className="text-2xs text-ink-300 font-mono truncate max-w-full">
              {p}
            </span>
          ))}
        </div>
      )}

      {/* 正文：分组列表 */}
      {open && (
        <div className="border-t border-ink-100/60">
          {total === 0 ? (
            <p className="px-4 py-5 text-2xs text-ink-400 text-center font-mono">
              这台机器上该 agent 未装任何 MCP / plugin / skill
            </p>
          ) : (
            <div className="divide-y divide-ink-100/40">
              <Group label="MCP" count={agent.counts.mcp}>
                <ul>
                  {agent.mcps.map((m, i) => (
                    <InstallRow key={`${m.name}-${i}`} type="mcp" item={m} />
                  ))}
                </ul>
              </Group>
              <Group label="PLUGIN" count={agent.counts.plugin}>
                <ul>
                  {agent.plugins.map((p, i) => (
                    <InstallRow key={`${p.name}-${i}`} type="plugin" item={p} />
                  ))}
                </ul>
              </Group>
              <Group label="SKILL" count={agent.counts.skill}>
                <ul>
                  {agent.skills.map((s, i) => (
                    <InstallRow key={`${s.name}-${i}`} type="skill" item={s} />
                  ))}
                </ul>
              </Group>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Group({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div>
      <div className="px-3 pt-2.5 pb-1 flex items-center gap-2">
        <span className="label !mb-0 !text-[0.55rem]">{label}</span>
        <span className="num text-2xs text-ink-300">{count}</span>
      </div>
      {children}
    </div>
  );
}
