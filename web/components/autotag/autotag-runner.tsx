// 自动打标控制面板：选范围、选 max_tags、选前后台模式 → 触发 job。

'use client';

import * as React from 'react';
import { Loader2, Play, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { HelpTip } from '@/components/ui/help-tip';
import { Divider } from '@/components/ui/divider';
import { cn } from '@/lib/utils';

export interface AutotagRunnerSubmit {
  onlyUntagged: boolean;
  maxTagsPerArtifact: number;
  background: boolean;
}

interface AutotagRunnerProps {
  onSubmit: (params: AutotagRunnerSubmit) => Promise<void> | void;
  submitting?: boolean;
  /** 显示在按钮辅助处的剩余 artifact 估算 */
  estimatedTotal?: number;
}

export function AutotagRunner({
  onSubmit,
  submitting = false,
  estimatedTotal,
}: AutotagRunnerProps) {
  const [onlyUntagged, setOnlyUntagged] = React.useState(true);
  const [maxTags, setMaxTags] = React.useState(3);
  const [background, setBackground] = React.useState(true);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    void onSubmit({
      onlyUntagged,
      maxTagsPerArtifact: Math.max(1, Math.min(5, maxTags)),
      background,
    });
  }

  const eta =
    estimatedTotal !== undefined
      ? Math.max(1, Math.ceil((estimatedTotal * 1.5) / 60))
      : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 范围 */}
      <section className="space-y-2.5">
        <div className="label flex items-center gap-2 !mb-0">
          范围
          <HelpTip>
            "只处理还没自动 tag 过的" 会跳过已经被 LLM 打过标的；适合增量处理。"整库重新打标" 会覆盖所有 auto-tag。
          </HelpTip>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          <RadioCard
            checked={onlyUntagged}
            onChange={() => setOnlyUntagged(true)}
            title="只处理还没自动 tag 过的"
            hint="推荐 · 增量"
            recommended
          />
          <RadioCard
            checked={!onlyUntagged}
            onChange={() => setOnlyUntagged(false)}
            title="整库重新打标"
            hint="慢 · 会覆盖之前的 auto 结果"
          />
        </div>
      </section>

      <Divider />

      {/* max_tags + background */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* max tags */}
        <div className="space-y-2">
          <label
            htmlFor="autotag-max"
            className="label flex items-center gap-2 !mb-0"
          >
            每条最多打几个 tag
            <HelpTip>
              模型会给每个 artifact 选 1 到 N 个最贴合的 tag；越多越宽松。默认 3。
            </HelpTip>
          </label>
          <div className="flex items-center gap-2">
            <Input
              id="autotag-max"
              type="number"
              min={1}
              max={5}
              value={maxTags}
              onChange={(e) => setMaxTags(Number(e.target.value) || 1)}
              disabled={submitting}
              className="h-10 w-20 font-mono text-center"
            />
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setMaxTags(n)}
                  disabled={submitting}
                  className={cn(
                    'w-8 h-8 rounded text-2xs font-mono transition',
                    maxTags === n
                      ? 'bg-ink-800 text-parchment-50'
                      : 'bg-parchment-200 text-ink-500 hover:bg-ink-100',
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* background */}
        <div className="space-y-2">
          <span className="label flex items-center gap-2 !mb-0">
            运行方式
            <HelpTip>
              后台模式立即返回 job_id，每 2s 轮询进度；阻塞模式适合用 curl/脚本，整个 HTTP 请求会一直挂到打完为止。
            </HelpTip>
          </span>
          <div className="grid grid-cols-2 gap-2">
            <ToggleCard
              checked={background}
              onChange={() => setBackground(true)}
              title="后台"
              hint="立即返回 · 轮询进度"
            />
            <ToggleCard
              checked={!background}
              onChange={() => setBackground(false)}
              title="阻塞"
              hint="HTTP 一直挂到完成"
            />
          </div>
        </div>
      </section>

      <Divider />

      {/* 提交 */}
      <div className="flex items-center gap-4">
        <Button
          type="submit"
          variant="oxide"
          size="lg"
          disabled={submitting}
          className="min-w-[180px]"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              正在启动…
            </>
          ) : (
            <>
              <Wand2 className="w-4 h-4" />
              开始打标
            </>
          )}
        </Button>
        <div className="text-2xs text-ink-400 space-y-0.5">
          <div className="flex items-center gap-1.5">
            <Play className="w-3 h-3 text-oxide-400" />
            预计每条 ≤ 3s · 串行处理
          </div>
          {eta !== null && (
            <div>
              全量预计 <span className="num text-ink-700">{eta}</span> 分钟（{estimatedTotal} 条 × 1.5s）
            </div>
          )}
        </div>
      </div>
    </form>
  );
}

function RadioCard({
  checked,
  onChange,
  title,
  hint,
  recommended,
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  hint: string;
  recommended?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onChange}
      className={cn(
        'text-left p-3 rounded-md border bg-card transition focus-ring',
        'flex items-start gap-3',
        checked
          ? 'border-oxide-400/60 bg-oxide-100/40'
          : 'border-ink-100 hover:bg-parchment-200 hover:border-ink-200',
      )}
    >
      <span
        className={cn(
          'mt-0.5 shrink-0 w-4 h-4 rounded-full border-2 inline-flex items-center justify-center',
          checked ? 'border-oxide-500' : 'border-ink-200',
        )}
      >
        {checked && <span className="w-2 h-2 rounded-full bg-oxide-500" />}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-ink-800 leading-tight">
          {title}
        </span>
        <span className="block mt-0.5 text-2xs text-ink-400">
          {hint}
          {recommended && (
            <span className="ml-1.5 text-oxide-600 font-mono uppercase tracking-wider">
              · 推荐
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

function ToggleCard({
  checked,
  onChange,
  title,
  hint,
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      aria-pressed={checked}
      className={cn(
        'text-left p-3 rounded-md border bg-card transition focus-ring h-full',
        checked
          ? 'border-ink-800 bg-ink-800 text-parchment-50'
          : 'border-ink-100 text-ink-700 hover:bg-parchment-200 hover:border-ink-200',
      )}
    >
      <div className={cn('text-sm font-medium')}>{title}</div>
      <div
        className={cn(
          'mt-0.5 text-2xs',
          checked ? 'text-parchment-200' : 'text-ink-400',
        )}
      >
        {hint}
      </div>
    </button>
  );
}
