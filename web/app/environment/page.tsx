'use client';

// /environment — 本机环境：各家 agent 配置目录里已装的 MCP / plugin / skill。
// 数据来自 aiforge scan --sync 上报。API 失败时回退到 MOCK 并显示 DEMO 标记。

import useSWR from 'swr';
import { Boxes, MonitorSmartphone, RefreshCw, Server } from 'lucide-react';

import { fetcher } from '@/lib/api-client';
import type { EnvironmentMachine, EnvironmentResponse, InstalledNames } from '@/lib/api-types';
import { MOCK_ENVIRONMENT, MOCK_INSTALLED_NAMES } from '@/lib/mock-data';
import { PageHeader } from '@/components/ui/page-header';
import { Surface } from '@/components/ui/surface';
import { Stat } from '@/components/ui/stat';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HelpTip } from '@/components/ui/help-tip';
import { fmtNumber, fmtRelativeTime } from '@/lib/utils';
import { EmptyStateRich } from '@/components/empty/empty-state-rich';
import { NoDiscoveriesIllustration } from '@/components/empty/empty-illustrations';
import { AgentCard } from '@/components/environment/agent-card';
import { ScanCTA } from '@/components/environment/scan-cta';

const CTA_ID = 'env-scan-cta';

export default function EnvironmentPage() {
  const { data: rawEnv, error: envError } = useSWR<EnvironmentResponse>(
    '/v1/environment',
    fetcher,
    { onError: () => {} }
  );
  const { data: rawNames } = useSWR<InstalledNames>('/v1/environment/installed', fetcher, {
    onError: () => {},
  });

  // 仅在 API 出错且无数据时回退到 mock（与 dashboard 模式一致）
  const isDemo = !!envError && !rawEnv;
  const env = rawEnv ?? (isDemo ? MOCK_ENVIRONMENT : { machines: [] });
  const names = rawNames ?? (isDemo ? MOCK_INSTALLED_NAMES : null);
  const machines = env.machines;

  const totals = machines.reduce(
    (acc, m) => {
      acc.mcp += m.total_mcp;
      acc.plugin += m.total_plugin;
      acc.skill += m.total_skill;
      return acc;
    },
    { mcp: 0, plugin: 0, skill: 0 }
  );

  const scrollToCta = () => {
    document.getElementById(CTA_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={isDemo ? 'DEMO MODE · 后端未连接' : 'LOCAL · INSTALLED INVENTORY'}
        title="本机环境"
        description="AIForge 自动发现各家 agent（Claude Code / Codex / Cursor / Gemini / Windsurf / VS Code）配置目录里已经装了什么。运行 aiforge scan --sync 上报后在这里查看。"
        actions={
          <Button variant="secondary" size="md" onClick={scrollToCta}>
            <RefreshCw className="w-4 h-4" />
            如何扫描
          </Button>
        }
      />

      {machines.length === 0 ? (
        // —— 真·空状态：API 正常但没有任何机器上报 ——
        <div className="space-y-6">
          <EmptyStateRich
            illustration={<NoDiscoveriesIllustration />}
            title="还没有扫描数据"
            description="目前没有任何机器上报本机环境。在装了 Claude Code / Codex 的机器上运行下面的命令，AIForge 就会汇总各家 agent 已装的 MCP / plugin / skill。"
            reason="这个面板的数据来自 aiforge scan --sync —— 它只读各家 agent 的配置目录，不会执行任何命令，MCP 密钥也会脱敏。"
            primaryAction={
              <Button variant="oxide" size="md" onClick={scrollToCta}>
                <RefreshCw className="w-4 h-4" />
                查看扫描命令
              </Button>
            }
            hints={[
              '支持 Claude Code / Codex / Cursor / Gemini CLI / Windsurf / VS Code',
              'env 密钥脱敏，只上报 key 名',
            ]}
          />
          <div className="max-w-[640px] mx-auto w-full">
            <ScanCTA id={CTA_ID} />
          </div>
        </div>
      ) : (
        <>
          {/* —— KPI 行 —— */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Surface padding="default">
              <Stat
                label="机器数"
                value={fmtNumber(machines.length)}
                unit="台"
                hint={`${machines.reduce((s, m) => s + m.agent_count, 0)} 个 agent 已检测`}
                topRight={<MonitorSmartphone className="w-4 h-4 text-ink-300" />}
              />
            </Surface>
            <Surface padding="default">
              <Stat
                label="已装 MCP · 总数"
                value={fmtNumber(totals.mcp)}
                unit="个"
                hint={names ? `去重后 ${names.mcp.length} 个唯一` : '跨机器累计'}
                topRight={<Server className="w-4 h-4 text-ink-300" />}
              />
            </Surface>
            <Surface padding="default">
              <Stat
                label="已装 plugin · 总数"
                value={fmtNumber(totals.plugin)}
                unit="个"
                hint={names ? `去重后 ${names.plugin.length} 个唯一` : '跨机器累计'}
                topRight={<Boxes className="w-4 h-4 text-ink-300" />}
              />
            </Surface>
            <Surface padding="default">
              <Stat
                label="已装 skill · 总数"
                value={fmtNumber(totals.skill)}
                unit="个"
                hint={names ? `去重后 ${names.skill.length} 个唯一` : '跨机器累计'}
                topRight={<Boxes className="w-4 h-4 text-ink-300" />}
              />
            </Surface>
          </div>

          {/* —— 每台机器一节 —— */}
          {machines.map((m) => (
            <MachineSection key={m.machine} machine={m} />
          ))}

          {/* —— 底部常驻扫描指引 —— */}
          <ScanCTA id={CTA_ID} />
        </>
      )}
    </div>
  );
}

function MachineSection({ machine }: { machine: EnvironmentMachine }) {
  // 仅渲染：detected 为 true 或确实装了东西的 agent
  const agents = machine.payload.agents.filter(
    (a) => a.detected || a.counts.mcp + a.counts.plugin + a.counts.skill > 0
  );

  return (
    <Surface
      eyebrow={`机器 · ${machine.machine}`}
      actions={
        <span className="inline-flex items-center gap-2 text-2xs text-ink-400 font-mono">
          <span className="dot dot-live" />
          扫描于 {fmtRelativeTime(machine.scanned_at)}
          <HelpTip inline>
            cwd: <span className="font-mono">{machine.payload.cwd}</span>
          </HelpTip>
        </span>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone="navy">{machine.total_mcp} MCP</Badge>
        <Badge tone="amber">{machine.total_plugin} PLUGIN</Badge>
        <Badge tone="oxide">{machine.total_skill} SKILL</Badge>
        <span className="text-2xs text-ink-400 font-mono">
          · {agents.length}/{machine.agent_count} agent 有配置
        </span>
      </div>

      {agents.length === 0 ? (
        <p className="py-6 text-2xs text-ink-400 text-center font-mono">
          这台机器上没有检测到任何 agent 配置
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {agents.map((agent) => (
            <AgentCard key={agent.agent} agent={agent} />
          ))}
        </div>
      )}
    </Surface>
  );
}
