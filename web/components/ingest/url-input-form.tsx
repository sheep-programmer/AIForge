// 入库表单：粘贴 GitHub URL → 提交 → 触发 ingest job。
// 包含 URL 正则校验、分支选择、auto_approve toggle。

'use client';

import * as React from 'react';
import { AlertCircle, DownloadCloud, GitBranch, Github, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { HelpTip } from '@/components/ui/help-tip';
import { cn } from '@/lib/utils';

const GITHUB_URL_RE = /^https?:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/;

const BRANCHES = ['main', 'master', 'develop', 'trunk'];

export interface UrlInputFormSubmit {
  url: string;
  branch: string;
  autoApprove: boolean;
}

interface UrlInputFormProps {
  onSubmit: (params: UrlInputFormSubmit) => Promise<void> | void;
  /** 当前是否正在提交 */
  submitting?: boolean;
}

export function UrlInputForm({ onSubmit, submitting = false }: UrlInputFormProps) {
  const [url, setUrl] = React.useState('');
  const [branch, setBranch] = React.useState('main');
  const [autoApprove, setAutoApprove] = React.useState(true);
  const [touched, setTouched] = React.useState(false);

  const trimmed = url.trim();
  const valid = trimmed.length > 0 && GITHUB_URL_RE.test(trimmed);
  const showError = touched && trimmed.length > 0 && !valid;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!valid || submitting) return;
    await onSubmit({ url: trimmed, branch, autoApprove });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* URL 输入区 */}
      <div className="space-y-2">
        <label
          htmlFor="ingest-url"
          className="label flex items-center gap-2 !mb-0"
        >
          <Github className="w-3.5 h-3.5 text-ink-400" />
          GitHub 仓库地址
          <HelpTip>
            目前支持公开的 GitHub 仓库。aiforge 会自动识别仓库里是 skill / MCP / plugin（或几种混合）并入库。私有仓库需要先在「设置」里配置 token。
          </HelpTip>
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300 pointer-events-none">
            <Github className="w-4 h-4" />
          </span>
          <Input
            id="ingest-url"
            type="url"
            placeholder="https://github.com/obra/superpowers-skills"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={() => setTouched(true)}
            disabled={submitting}
            className={cn(
              'h-11 pl-10 font-mono text-[0.9rem]',
              showError && 'border-ember-500/60 focus:border-ember-500/60'
            )}
            aria-invalid={showError || undefined}
            aria-describedby={showError ? 'ingest-url-err' : undefined}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        {showError && (
          <div
            id="ingest-url-err"
            className="flex items-start gap-2 text-2xs text-ember-500"
            role="alert"
          >
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              请粘贴形如 <span className="font-mono">https://github.com/owner/repo</span> 的完整 URL；不要带分支后缀或 .git。
            </span>
          </div>
        )}
        {!showError && (
          <div className="text-2xs text-ink-400">
            支持公开仓库。例:
            <span className="font-mono ml-1 text-ink-500">
              github.com/anthropics/skills
            </span>
          </div>
        )}
      </div>

      {/* 分支 + auto_approve */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 分支 */}
        <div className="space-y-2">
          <label
            htmlFor="ingest-branch"
            className="label flex items-center gap-2 !mb-0"
          >
            <GitBranch className="w-3.5 h-3.5 text-ink-400" />
            分支
          </label>
          <div className="relative">
            <select
              id="ingest-branch"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              disabled={submitting}
              className={cn(
                'flex h-9 w-full rounded-md border border-ink-100 bg-card pl-3 pr-8 text-sm font-mono',
                'focus-ring focus:border-oxide-400/50 focus:bg-parchment-50 transition',
                'appearance-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-50'
              )}
            >
              {BRANCHES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-ink-300 text-2xs">
              ▾
            </span>
          </div>
        </div>

        {/* auto_approve */}
        <div className="space-y-2">
          <span className="label flex items-center gap-2 !mb-0">
            自动批准
            <HelpTip>
              开启后：解析出的 artifact 立即生效、可被推荐。关闭：进入待审队列，需要手动在「Discovery」里点通过。
            </HelpTip>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={autoApprove}
            onClick={() => setAutoApprove((v) => !v)}
            disabled={submitting}
            className={cn(
              'flex items-center justify-between gap-3 w-full h-9 px-3',
              'rounded-md border bg-card text-left transition',
              'focus-ring disabled:opacity-50 disabled:cursor-not-allowed',
              autoApprove
                ? 'border-oxide-400/40 bg-oxide-100/40'
                : 'border-ink-100 hover:bg-parchment-200'
            )}
          >
            <span className={cn('text-sm', autoApprove ? 'text-oxide-600' : 'text-ink-500')}>
              {autoApprove ? '已开启 · 立即生效' : '关闭 · 待审'}
            </span>
            <span
              className={cn(
                'inline-flex w-9 h-5 rounded-full transition relative shrink-0',
                autoApprove ? 'bg-oxide-500' : 'bg-ink-200'
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 w-4 h-4 bg-parchment-50 rounded-full transition shadow-sm',
                  autoApprove ? 'left-[18px]' : 'left-0.5'
                )}
              />
            </span>
          </button>
        </div>
      </div>

      {/* 提交 */}
      <div className="flex items-center gap-3 pt-1">
        <Button
          type="submit"
          variant="oxide"
          size="lg"
          disabled={!valid || submitting}
          className="min-w-[160px]"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              正在提交…
            </>
          ) : (
            <>
              <DownloadCloud className="w-4 h-4" />
              开始入库
            </>
          )}
        </Button>
        <span className="text-2xs text-ink-400">
          shallow clone · 不执行仓库代码 · 解析 + 向量化
        </span>
      </div>
    </form>
  );
}
