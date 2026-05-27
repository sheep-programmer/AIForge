'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  ArrowLeft,
  ArrowRight,
  Compass,
  Github,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOnboarding, ONBOARDING_TOTAL_STEPS } from './use-onboarding';
import { Button } from '@/components/ui/button';
import { EmptyIllustrationStyles } from '@/components/empty/empty-illustrations';
import {
  VisualWelcome,
  VisualThreeCards,
  VisualPipeline,
  VisualInjection,
  VisualOutro,
} from './onboarding-visuals';

// —————————————————————————————————————————
// 5 步引导：欢迎 / 三种 artifact / 入库与打标 / 推荐 / 接下来
// 在 / 上首次访问时弹出；localStorage 持久化。
// —————————————————————————————————————————

export function OnboardingWizard() {
  const { state, isOpen, next, prev, goto, complete } = useOnboarding();
  const router = useRouter();

  const [internalOpen, setInternalOpen] = React.useState(false);
  React.useEffect(() => {
    setInternalOpen(isOpen);
  }, [isOpen]);

  if (!internalOpen) return null;

  const step = state.step;

  const skip = () => {
    complete();
    setInternalOpen(false);
  };

  const onPrimary = () => {
    if (step >= ONBOARDING_TOTAL_STEPS) {
      complete();
      setInternalOpen(false);
      return;
    }
    next();
  };

  const goAndComplete = (href: string) => {
    if (href.startsWith('http')) {
      complete();
      window.open(href, '_blank', 'noopener,noreferrer');
      setInternalOpen(false);
      return;
    }
    complete();
    setInternalOpen(false);
    router.push(href);
  };

  return (
    <DialogPrimitive.Root
      open={internalOpen}
      onOpenChange={(o) => {
        if (!o) {
          complete();
          setInternalOpen(false);
        }
      }}
    >
      <DialogPrimitive.Portal>
        {/* 注入插画用的全局关键帧 */}
        <EmptyIllustrationStyles />
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-[3px]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            'fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
            'w-[920px] max-w-[94vw] max-h-[90vh] overflow-hidden',
            'surface-strong',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95'
          )}
        >
          <DialogPrimitive.Title className="sr-only">
            AIForge 新手引导
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            五步介绍 AIForge 的核心概念与下一步操作。
          </DialogPrimitive.Description>

          <DialogPrimitive.Close
            onClick={skip}
            className="absolute right-3 top-3 z-10 w-7 h-7 inline-flex items-center justify-center rounded text-ink-300 hover:text-ink-800 hover:bg-ink-100/60 transition focus-ring"
            aria-label="关闭引导"
          >
            <X className="w-3.5 h-3.5" />
          </DialogPrimitive.Close>

          {/* 顶部进度 */}
          <div className="px-7 pt-6 pb-4 border-b hairline">
            <div className="flex items-center justify-between">
              <span className="label !text-2xs">
                AIForge · 新手引导 · {step}/{ONBOARDING_TOTAL_STEPS}
              </span>
              <div className="flex items-center gap-1.5">
                {Array.from({ length: ONBOARDING_TOTAL_STEPS }).map((_, i) => {
                  const n = i + 1;
                  const active = n === step;
                  const done = n < step;
                  return (
                    <button
                      key={n}
                      onClick={() => goto(n)}
                      aria-label={`跳到第 ${n} 步`}
                      className={cn(
                        'h-1.5 rounded-full transition-all',
                        active
                          ? 'w-10 bg-oxide-500'
                          : done
                            ? 'w-3 bg-oxide-300'
                            : 'w-3 bg-ink-100'
                      )}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          {/* 主体 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0 items-stretch min-h-[420px]">
            <div className="p-7 lg:p-9 flex flex-col justify-center">
              <StepContent step={step} onCardClick={goAndComplete} />
            </div>
            <div className="relative bg-parchment-200/60 border-l hairline overflow-hidden">
              <div className="absolute inset-0 bg-grid-faint bg-grid-32 opacity-50 pointer-events-none" />
              <div className="relative z-10 h-full flex items-center justify-center p-6">
                <StepVisual step={step} />
              </div>
            </div>
          </div>

          {/* 底部 */}
          <div className="px-7 py-4 border-t hairline flex items-center justify-between bg-parchment-50/60">
            <button
              onClick={skip}
              className="text-2xs text-ink-400 hover:text-ink-700 underline-offset-4 hover:underline transition"
            >
              跳过引导
            </button>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="md"
                onClick={prev}
                disabled={step === 1}
              >
                <ArrowLeft className="w-4 h-4" />
                上一步
              </Button>
              <Button variant="oxide" size="md" onClick={onPrimary}>
                {step >= ONBOARDING_TOTAL_STEPS ? '完成' : '下一步'}
                {step < ONBOARDING_TOTAL_STEPS && <ArrowRight className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// —————————————————————————————————————————
// 单步文字
// —————————————————————————————————————————

function StepContent({
  step,
  onCardClick,
}: {
  step: number;
  onCardClick: (href: string) => void;
}) {
  switch (step) {
    case 1:
      return (
        <StepBody
          eyebrow="WELCOME"
          title="欢迎来到 AIForge"
          description="在你开始之前，让我用 60 秒解释 AIForge 是什么、能给你什么。它不是另一个 prompt 商店，而是你本地 agent 工具箱的统一控制面板。"
        />
      );
    case 2:
      return (
        <StepBody
          eyebrow="CONCEPT · 01"
          title="三种 artifact，一张表"
          description="AIForge 把 skill / MCP server / Claude Code plugin 统一管理 —— 同一张表，同一套 API，同一个 UI 入口。你不用为每种类型记三个工具。"
        />
      );
    case 3:
      return (
        <StepBody
          eyebrow="CONCEPT · 02"
          title="GitHub URL 就够了"
          description="粘贴一个仓库 URL，AIForge 自动识别里面有什么、向量化、写入。小模型会从 20 个预置 tag 里给每个 artifact 自动归类。"
        />
      );
    case 4:
      return (
        <StepBody
          eyebrow="CONCEPT · 03"
          title="按需注入，不浪费 token"
          description="每次你对 Claude Code 说话，UserPromptSubmit hook 会从你的库里挑出最相关的 3 个 artifact 注入到上下文。其它的永远不进来。"
        />
      );
    case 5:
      return (
        <div>
          <span className="label">NEXT · 选一个开始</span>
          <h2 className="mt-2 display text-3xl text-ink-800 font-normal tracking-tight leading-tight">
            现在你可以...
          </h2>
          <p className="mt-2 text-sm text-ink-500 leading-relaxed">
            选一个开始的方式，或者跳过自己探索。
          </p>
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <CtaCard
              icon={<Github className="w-4 h-4" />}
              title="种子入库 10 个流行 skill 库"
              hint="/ingest · 已预填示例"
              onClick={() => onCardClick('/ingest')}
            />
            <CtaCard
              icon={<Sparkles className="w-4 h-4" />}
              title="试一次推荐"
              hint="/playground · 输入 prompt 查看 top-K"
              onClick={() => onCardClick('/playground')}
            />
            <CtaCard
              icon={<Zap className="w-4 h-4" />}
              title="看 Dashboard"
              hint="/  · 整体面板"
              onClick={() => onCardClick('/')}
            />
            <CtaCard
              icon={<Compass className="w-4 h-4" />}
              title="读架构文档"
              hint="GitHub · ARCHITECTURE.md"
              onClick={() => onCardClick('https://github.com/anthropics/claude-code')}
            />
          </div>
        </div>
      );
    default:
      return null;
  }
}

function StepBody({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <span className="label">{eyebrow}</span>
      <h2 className="mt-2 display text-3xl text-ink-800 font-normal tracking-tight leading-tight">
        {title}
      </h2>
      <p className="mt-3 text-sm text-ink-500 leading-relaxed max-w-[42ch]">
        {description}
      </p>
    </div>
  );
}

function CtaCard({
  icon,
  title,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group text-left p-3 rounded-md border border-ink-100/80 bg-card',
        'hover:border-oxide-300 hover:bg-parchment-50 transition',
        'focus-ring'
      )}
    >
      <div className="flex items-center gap-2.5">
        <span className="shrink-0 w-8 h-8 rounded bg-ink-800 text-parchment-50 inline-flex items-center justify-center group-hover:bg-oxide-500 transition">
          {icon}
        </span>
        <div className="min-w-0">
          <div className="text-sm font-medium text-ink-800 truncate">{title}</div>
          <div className="text-2xs text-ink-400 mt-0.5 font-mono truncate">{hint}</div>
        </div>
      </div>
    </button>
  );
}

function StepVisual({ step }: { step: number }) {
  switch (step) {
    case 1:
      return <VisualWelcome />;
    case 2:
      return <VisualThreeCards />;
    case 3:
      return <VisualPipeline />;
    case 4:
      return <VisualInjection />;
    case 5:
      return <VisualOutro />;
    default:
      return null;
  }
}
