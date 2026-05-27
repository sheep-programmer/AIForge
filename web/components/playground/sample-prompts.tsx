'use client';

import * as React from 'react';
import { Surface } from '@/components/ui/surface';
import { cn } from '@/lib/utils';

interface Sample {
  prompt: string;
  hint: string;
}

const SAMPLES: Sample[] = [
  { prompt: '审查这个 PR 的安全漏洞', hint: 'security-review · OWASP' },
  { prompt: '我想用 Playwright 写一个登录流程的 E2E', hint: 'browser-automation' },
  { prompt: '把这段 Python 重构成更小的函数', hint: 'refactor · code-quality' },
  { prompt: 'Postgres 加一个 NOT NULL 列，会锁表吗？', hint: 'db · migration' },
  { prompt: '帮我生成 OpenAPI 规范', hint: 'docs · api-integration' },
  { prompt: '我需要逆向一个二进制看协议格式', hint: 'reverse-engineering' },
  { prompt: '给 React 组件加 dark mode', hint: 'ui · frontend' },
  { prompt: '诊断 nginx 502 的可能原因', hint: 'devops · debug' },
];

interface SamplePromptsProps {
  onPick: (prompt: string) => void;
  activePrompt?: string;
}

export function SamplePrompts({ onPick, activePrompt }: SamplePromptsProps) {
  return (
    <Surface eyebrow="示例 · 一键填入">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {SAMPLES.map((s, i) => {
          const active = activePrompt === s.prompt;
          return (
            <button
              key={s.prompt}
              type="button"
              onClick={() => onPick(s.prompt)}
              className={cn(
                'group text-left rounded-md border transition px-3 py-2.5',
                'focus-ring',
                active
                  ? 'border-oxide-400/60 bg-oxide-100/40'
                  : 'border-ink-100 bg-parchment-50 hover:border-ink-200 hover:bg-parchment-200/60'
              )}
            >
              <div className="flex items-start gap-2">
                <span
                  className={cn(
                    'mt-0.5 font-mono text-2xs tabular-nums shrink-0 w-5',
                    active ? 'text-oxide-600' : 'text-ink-300'
                  )}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-ink-800 leading-snug">{s.prompt}</div>
                  <div className="mt-1 font-mono text-2xs text-ink-400 truncate">
                    {s.hint}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </Surface>
  );
}
