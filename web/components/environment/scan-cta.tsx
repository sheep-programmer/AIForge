'use client';

// 扫描指引面板：展示 aiforge scan --sync 的运行方式 + 一键复制。
// 当没有任何上报数据时作为主行动入口，也可常驻页面底部。

import * as React from 'react';
import { Check, Copy, Terminal } from 'lucide-react';
import { Surface } from '@/components/ui/surface';
import { cn } from '@/lib/utils';

const SCAN_SNIPPET = `# 在装了 Claude Code / Codex 的机器上运行
/aiforge:scan --sync          # 在 Claude Code 里
# 或直接
python3 ~/.claude/plugins/aiforge/lib/cli.py scan --sync`;

export function ScanCTA({ id, className }: { id?: string; className?: string }) {
  const [copied, setCopied] = React.useState(false);

  const onCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(SCAN_SNIPPET);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // 剪贴板不可用时静默：用户仍可手动复制
    }
  }, []);

  return (
    <Surface
      id={id}
      eyebrow="如何扫描 · AIFORGE SCAN"
      className={cn('scroll-mt-6', className)}
      actions={
        <span className="inline-flex items-center gap-1.5 text-2xs text-ink-400 font-mono">
          <Terminal className="w-3 h-3 text-oxide-500" />
          只读 · 不执行
        </span>
      }
    >
      <div className="relative">
        <pre className="rounded-md border border-ink-100/70 bg-ink-800 text-parchment-50 text-xs leading-relaxed font-mono px-4 py-3.5 overflow-x-auto">
          {SCAN_SNIPPET.split('\n').map((line, i) => (
            <div
              key={i}
              className={line.trimStart().startsWith('#') ? 'text-ink-300' : 'text-parchment-50'}
            >
              {line || ' '}
            </div>
          ))}
        </pre>
        <button
          type="button"
          onClick={onCopy}
          aria-label="复制扫描命令"
          className={cn(
            'absolute right-2.5 top-2.5 inline-flex items-center gap-1.5 h-7 px-2.5 rounded',
            'text-2xs font-mono transition focus-ring',
            copied
              ? 'bg-oxide-500 text-parchment-50'
              : 'bg-ink-700 text-parchment-300 hover:bg-ink-600 hover:text-parchment-50'
          )}
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <p className="mt-3 text-2xs text-ink-400 leading-relaxed">
        扫描只读不执行，MCP 密钥会脱敏 —— 只上报 env 的 key 名，不上报具体的值。
      </p>
    </Surface>
  );
}
