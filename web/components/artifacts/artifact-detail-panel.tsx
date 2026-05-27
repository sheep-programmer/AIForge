// 详情页主体：左 8/12 是 body + 元数据，右 4/12 是标签 / mcp / plugin / 推荐统计。
// 与详情页分离便于 server / client 边界控制。

'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Check, Copy, ExternalLink, Radio, ScrollText } from 'lucide-react';
import type { ArtifactDetail } from '@/lib/api-types';
import { Surface } from '@/components/ui/surface';
import { Stat } from '@/components/ui/stat';
import { Divider } from '@/components/ui/divider';
import { TagEditor } from '@/components/artifacts/tag-editor';
import { McpConfigBlock } from '@/components/artifacts/mcp-config-block';
import { fmtNumber, fmtRelativeTime } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface DetailPanelProps {
  artifact: ArtifactDetail;
}

export function ArtifactDetailPanel({ artifact }: DetailPanelProps) {
  return (
    <div className="grid grid-cols-12 gap-6">
      {/* —— 左：body + 时间戳 —— */}
      <div className="col-span-12 xl:col-span-8 space-y-6">
        <Surface eyebrow="BODY · MARKDOWN" padding="default">
          {artifact.body ? (
            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-ink-700 max-h-[600px] overflow-y-auto">
              {artifact.body}
            </pre>
          ) : (
            <p className="text-sm text-ink-400 italic">该 artifact 没有 body 内容。</p>
          )}
        </Surface>

        <Surface eyebrow="元数据 · METADATA">
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-y-4 gap-x-6 text-xs">
            <MetaItem
              label="创建于"
              value={fmtRelativeTime(artifact.created_at)}
              hint={artifact.created_at.slice(0, 10)}
            />
            <MetaItem
              label="更新于"
              value={fmtRelativeTime(artifact.updated_at)}
              hint={artifact.updated_at.slice(0, 10)}
            />
            <MetaItem
              label="最近推荐"
              value={fmtRelativeTime(artifact.last_recommended_at)}
              hint={artifact.last_recommended_at?.slice(0, 10) ?? '从未'}
            />
            <MetaItem
              label="许可"
              value={artifact.license ?? '—'}
              hint={artifact.license ? '声明的开源协议' : '未声明'}
            />
            <MetaItem
              label="cluster id"
              value={artifact.cluster_id !== null ? String(artifact.cluster_id) : '—'}
              hint="嵌入聚类编号"
              mono
            />
            <MetaItem
              label="source path"
              value={artifact.source_path}
              hint="仓库内相对路径"
              mono
            />
            <MetaItem
              label="token 占用"
              value={fmtNumber(artifact.body_tokens)}
              hint="body 估算 token"
              mono
            />
            <MetaItem
              label="是否审核"
              value={artifact.is_approved ? '已通过' : '待审'}
              hint="人工或自动审批"
            />
          </dl>
        </Surface>
      </div>

      {/* —— 右：标签编辑 / mcp / plugin / 推荐统计 —— */}
      <div className="col-span-12 xl:col-span-4 space-y-6">
        <Surface eyebrow="标签 · TAGS">
          <TagEditor artifactId={artifact.id} initialTags={artifact.tags} />
        </Surface>

        {artifact.artifact_type === 'mcp' && artifact.mcp_config && (
          <Surface eyebrow="MCP_CONFIG · 服务器配置">
            <McpConfigBlock name={artifact.name} config={artifact.mcp_config} />
          </Surface>
        )}

        {artifact.artifact_type === 'plugin' && artifact.plugin_manifest && (
          <Surface eyebrow="PLUGIN MANIFEST">
            <PluginManifestBlock manifest={artifact.plugin_manifest} />
          </Surface>
        )}

        <Surface eyebrow="推荐统计 · RECOMMEND">
          <Stat
            label="累计推荐"
            value={fmtNumber(artifact.recommend_count)}
            unit="次"
            hint={`最近一次：${fmtRelativeTime(artifact.last_recommended_at)}`}
            topRight={<Radio className="w-4 h-4 text-oxide-400" />}
            size="md"
          />
          <Divider className="my-4" />
          <div className="flex items-center gap-2 text-xs text-ink-500">
            <ScrollText className="w-3.5 h-3.5 text-ink-300" />
            该 artifact 出现在 Playground 注入历史中。
          </div>
        </Surface>

        <CopyIdBlock id={artifact.id} />
      </div>
    </div>
  );
}

function MetaItem({
  label,
  value,
  hint,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="label !mb-0.5">{label}</dt>
      <dd
        className={cn(
          'text-ink-700 truncate',
          mono ? 'font-mono text-2xs' : 'text-sm'
        )}
      >
        {value}
      </dd>
      {hint && <div className="text-2xs text-ink-300 mt-0.5 truncate">{hint}</div>}
    </div>
  );
}

function PluginManifestBlock({ manifest }: { manifest: Record<string, unknown> }) {
  const commands = Array.isArray(manifest['commands'])
    ? (manifest['commands'] as unknown[])
    : [];
  const hooks = Array.isArray(manifest['hooks']) ? (manifest['hooks'] as unknown[]) : [];
  const installUrl =
    typeof manifest['install_url'] === 'string' ? (manifest['install_url'] as string) : null;
  return (
    <div className="space-y-3 text-xs">
      <Section label="commands" count={commands.length}>
        {commands.length === 0 ? (
          <span className="text-ink-300 italic">无</span>
        ) : (
          <ul className="space-y-1">
            {commands.map((c, i) => (
              <li key={i} className="font-mono text-2xs text-ink-700 truncate">
                /{describePluginEntry(c, 'name')}
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section label="hooks" count={hooks.length}>
        {hooks.length === 0 ? (
          <span className="text-ink-300 italic">无</span>
        ) : (
          <ul className="space-y-1">
            {hooks.map((h, i) => (
              <li key={i} className="font-mono text-2xs text-ink-700 truncate">
                {describePluginEntry(h, 'event')}
              </li>
            ))}
          </ul>
        )}
      </Section>
      {installUrl && (
        <Link
          href={installUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-2xs text-oxide-500 hover:text-oxide-600 transition-colors duration-150"
        >
          <ExternalLink className="w-3 h-3" />
          安装地址
        </Link>
      )}
    </div>
  );
}

function describePluginEntry(entry: unknown, key: string): string {
  if (entry && typeof entry === 'object') {
    const v = (entry as Record<string, unknown>)[key];
    if (typeof v === 'string' && v) return v;
    const name = (entry as Record<string, unknown>)['name'];
    if (typeof name === 'string' && name) return name;
  }
  if (typeof entry === 'string') return entry;
  return '(unknown)';
}

function Section({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="label !mb-0">{label}</span>
        <span className="text-2xs text-ink-300 num">{count}</span>
      </div>
      {children}
    </div>
  );
}

function CopyIdBlock({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // ignore
    }
  };
  return (
    <div className="surface p-3 flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="label !mb-0.5">artifact id</div>
        <div className="font-mono text-2xs text-ink-700 truncate">{id}</div>
      </div>
      <button
        onClick={onCopy}
        aria-label="复制 ID"
        className={cn(
          'shrink-0 h-7 w-7 inline-flex items-center justify-center rounded',
          'text-ink-400 hover:text-ink-800 hover:bg-parchment-200 transition-colors duration-150',
          copied && 'text-oxide-500'
        )}
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}
