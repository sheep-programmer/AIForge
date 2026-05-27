// MCP 配置块：展示 transport / command / args / env + 一键复制安装命令。

'use client';

import { useState } from 'react';
import { Check, Copy, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';

interface McpConfigBlockProps {
  name: string;
  config: Record<string, unknown>;
}

export function McpConfigBlock({ name, config }: McpConfigBlockProps) {
  // 容错读取
  const transport = stringOrUndef(config['transport']);
  const command = stringOrUndef(config['command']);
  const args = stringArrayOrEmpty(config['args']);
  const env =
    (config['env'] && typeof config['env'] === 'object'
      ? (config['env'] as Record<string, string>)
      : undefined) ?? undefined;
  const url = stringOrUndef(config['url']);

  // 构造 `claude mcp add` 命令
  const cliCommand = buildClaudeMcpAdd({ name, transport, command, args, env, url });

  return (
    <div className="space-y-3">
      {/* 关键参数表 */}
      <dl className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-1.5 text-xs">
        {transport && <Row label="transport" value={transport} mono />}
        {command && <Row label="command" value={command} mono />}
        {args.length > 0 && (
          <Row label="args" value={args.join(' ')} mono />
        )}
        {url && <Row label="url" value={url} mono />}
        {env && Object.keys(env).length > 0 && (
          <Row
            label="env"
            value={`${Object.keys(env).length} 个变量`}
            mono={false}
          />
        )}
      </dl>

      {/* JSON 预览 */}
      <details className="group">
        <summary className="cursor-pointer label !mb-0 inline-flex items-center gap-1 hover:text-ink-700 transition-colors duration-150">
          <span className="group-open:rotate-90 inline-block transition-transform">▸</span>
          完整 JSON
        </summary>
        <pre className="mt-2 p-3 rounded bg-ink-900 text-parchment-50 text-2xs font-mono overflow-x-auto leading-relaxed">
          {JSON.stringify(config, null, 2)}
        </pre>
      </details>

      {/* 一键复制 CLI */}
      <div className="space-y-1.5">
        <div className="label !mb-0 inline-flex items-center gap-1.5">
          <Terminal className="w-3 h-3 text-ink-400" />
          安装到 Claude Code
        </div>
        <CopyableCommand value={cliCommand} />
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono: boolean;
}) {
  return (
    <>
      <dt className="label !mb-0 self-center">{label}</dt>
      <dd
        className={cn(
          'text-ink-700 truncate',
          mono && 'font-mono text-2xs'
        )}
      >
        {value}
      </dd>
    </>
  );
}

function CopyableCommand({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // ignore
    }
  };
  return (
    <div className="relative group rounded border border-ink-100/80 bg-parchment-100/70 overflow-hidden">
      <pre className="p-3 pr-10 text-2xs font-mono text-ink-700 leading-relaxed whitespace-pre-wrap break-all">
        {value}
      </pre>
      <button
        onClick={onCopy}
        aria-label="复制命令"
        className={cn(
          'absolute top-2 right-2 w-6 h-6 inline-flex items-center justify-center rounded',
          'text-ink-400 hover:text-ink-800 hover:bg-card transition-colors duration-150',
          copied && 'text-oxide-500 hover:text-oxide-600'
        )}
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

function stringOrUndef(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function stringArrayOrEmpty(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

function buildClaudeMcpAdd(opts: {
  name: string;
  transport?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}): string {
  const parts: string[] = ['claude', 'mcp', 'add'];
  if (opts.transport && opts.transport !== 'stdio') {
    parts.push('--transport', opts.transport);
  }
  if (opts.url) {
    parts.push(opts.name, opts.url);
    return parts.join(' ');
  }
  if (opts.env) {
    for (const [k, v] of Object.entries(opts.env)) {
      parts.push('--env', `${k}=${v}`);
    }
  }
  parts.push(opts.name);
  if (opts.command) {
    parts.push('--', opts.command);
    if (opts.args) parts.push(...opts.args);
  }
  return parts.join(' ');
}
