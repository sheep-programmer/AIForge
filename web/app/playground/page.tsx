'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Check, Copy, Sparkles } from 'lucide-react';
import { ApiError, api } from '@/lib/api-client';
import type { RecommendResponse } from '@/lib/api-types';
import { MOCK_RECOMMENDATION } from '@/lib/mock-data';
import { PageHeader } from '@/components/ui/page-header';
import { Surface } from '@/components/ui/surface';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Divider } from '@/components/ui/divider';
import { PromptEditor } from '@/components/playground/prompt-editor';
import { SamplePrompts } from '@/components/playground/sample-prompts';
import { RecommendationCard } from '@/components/playground/recommendation-card';
import { fmtNumber, cn } from '@/lib/utils';

type ResultState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; data: RecommendResponse; demo: boolean }
  | { kind: 'error'; message: string };

export default function PlaygroundPage() {
  const [prompt, setPrompt] = React.useState('');
  const [topK, setTopK] = React.useState(3);
  const [maxTokens, setMaxTokens] = React.useState(4000);
  const [result, setResult] = React.useState<ResultState>({ kind: 'idle' });
  const [copied, setCopied] = React.useState(false);

  const submit = React.useCallback(async () => {
    const p = prompt.trim();
    if (!p) return;
    setResult({ kind: 'loading' });
    try {
      const data = await api.recommend(p, topK, maxTokens);
      setResult({ kind: 'ok', data, demo: false });
      toast.success(`推荐完成 · ${data.recommendations.length} 个候选`, {
        description: `${data.elapsed_ms}ms · request_id ${data.request_id.slice(0, 12)}…`,
      });
    } catch (err) {
      // 后端不可达：回退到 demo 数据，但提示用户
      if (err instanceof ApiError && err.status === 0) {
        const demo: RecommendResponse = {
          ...MOCK_RECOMMENDATION,
          request_id: `req_demo_${Date.now().toString(36)}`,
        };
        setResult({ kind: 'ok', data: demo, demo: true });
        return;
      }
      const message =
        err instanceof Error ? err.message : '推荐失败，请检查 aiforge 服务端';
      // 网络错误也回退 demo
      const demo: RecommendResponse = {
        ...MOCK_RECOMMENDATION,
        request_id: `req_demo_${Date.now().toString(36)}`,
      };
      setResult({ kind: 'ok', data: demo, demo: true });
      toast.error('推荐请求失败 · 显示离线示例', { description: message });
    }
  }, [prompt, topK, maxTokens]);

  const copyRequestId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      toast.success('已复制', { description: id });
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      toast.error('剪贴板不可用');
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="ROUTER · INTERACTIVE"
        title={'推荐 Playground'}
        description="像 agent 一样发送一次 prompt，看 aiforge 会注入哪几个 skill / MCP / plugin。所有调用都进推荐日志，可用于回归测试。"
      />

      <div className="grid grid-cols-12 gap-6">
        {/* LEFT: editor + samples, sticky */}
        <div className="col-span-12 xl:col-span-7 space-y-6">
          <div className="xl:sticky xl:top-6 space-y-6">
            <PromptEditor
              prompt={prompt}
              topK={topK}
              maxTokens={maxTokens}
              loading={result.kind === 'loading'}
              onPromptChange={setPrompt}
              onTopKChange={setTopK}
              onMaxTokensChange={setMaxTokens}
              onSubmit={submit}
            />
            <SamplePrompts onPick={setPrompt} activePrompt={prompt} />
          </div>
        </div>

        {/* RIGHT: result */}
        <div className="col-span-12 xl:col-span-5">
          <Surface
            eyebrow="推荐结果"
            actions={
              result.kind === 'ok' && result.demo ? (
                <Badge tone="amber">DEMO</Badge>
              ) : result.kind === 'ok' ? (
                <Badge tone="live">LIVE</Badge>
              ) : null
            }
          >
            {result.kind === 'idle' && <IdlePlaceholder />}
            {result.kind === 'loading' && <LoadingShimmer />}
            {result.kind === 'ok' && (
              <ResultBlock
                data={result.data}
                onCopy={copyRequestId}
                copied={copied}
              />
            )}
          </Surface>
        </div>
      </div>
    </div>
  );
}

function IdlePlaceholder() {
  return (
    <EmptyState
      icon={<Sparkles className="w-4 h-4" />}
      title="等待第一次推荐"
      description="输入 prompt 后点击「发送推荐」，这里会显示注入到 agent 的 skill / MCP / plugin 列表、各自的得分与完整 body。"
    />
  );
}

function LoadingShimmer() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-12 rounded-md bg-parchment-200/70 animate-pulse"
          />
        ))}
      </div>
      <Divider />
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={cn(
            'h-28 rounded-md bg-parchment-200/70 animate-pulse',
            'border-l-2 border-l-oxide-200'
          )}
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </div>
  );
}

function ResultBlock({
  data,
  onCopy,
  copied,
}: {
  data: RecommendResponse;
  onCopy: (id: string) => void;
  copied: boolean;
}) {
  const elapsed = data.elapsed_ms;
  const elapsedTone =
    elapsed < 200 ? 'text-oxide-600' : elapsed < 500 ? 'text-amber-500' : 'text-ember-500';

  return (
    <div className="space-y-4">
      {/* top strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile label="request_id">
          <button
            type="button"
            onClick={() => onCopy(data.request_id)}
            className="group inline-flex items-center gap-1.5 font-mono text-2xs text-ink-700 hover:text-ink-800 transition"
            title="复制 request_id"
          >
            <span className="truncate max-w-[120px]">{data.request_id}</span>
            {copied ? (
              <Check className="w-3 h-3 text-oxide-500 shrink-0" />
            ) : (
              <Copy className="w-3 h-3 text-ink-300 group-hover:text-ink-700 shrink-0" />
            )}
          </button>
        </Tile>
        <Tile label="elapsed">
          <span className={cn('num text-sm', elapsedTone)}>{elapsed}</span>
          <span className="ml-1 text-2xs text-ink-300 font-mono">ms</span>
        </Tile>
        <Tile label="候选数">
          <span className="num text-sm text-ink-800">
            {fmtNumber(data.candidates_considered)}
          </span>
        </Tile>
        <Tile label="fallback">
          {data.fallback_used ? (
            <Badge tone="amber">已触发</Badge>
          ) : (
            <Badge tone="oxide">未触发</Badge>
          )}
        </Tile>
      </div>

      <Divider />

      {data.recommendations.length === 0 ? (
        <EmptyState
          title="没有命中任何 artifact"
          description="试着换一个更具体的 prompt，或检查 artifact 是否已入库。"
          variant="inline"
        />
      ) : (
        <div className="space-y-3">
          {data.recommendations.map((rec, i) => (
            <RecommendationCard
              key={rec.skill_id + i}
              rank={i + 1}
              rec={rec}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Tile({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-ink-100 bg-parchment-50 px-2.5 py-1.5 min-w-0">
      <div className="label !mb-0.5 text-[0.6rem]">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
