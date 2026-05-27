'use client';

import * as React from 'react';
import { Loader2, Send } from 'lucide-react';
import { Surface } from '@/components/ui/surface';
import { Textarea, Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { HelpTip } from '@/components/ui/help-tip';
import { cn } from '@/lib/utils';

interface PromptEditorProps {
  prompt: string;
  topK: number;
  maxTokens: number;
  loading: boolean;
  onPromptChange: (v: string) => void;
  onTopKChange: (v: number) => void;
  onMaxTokensChange: (v: number) => void;
  onSubmit: () => void;
}

export function PromptEditor({
  prompt,
  topK,
  maxTokens,
  loading,
  onPromptChange,
  onTopKChange,
  onMaxTokensChange,
  onSubmit,
}: PromptEditorProps) {
  const empty = prompt.trim().length === 0;
  const disabled = empty || loading;

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!disabled) onSubmit();
    }
  };

  return (
    <Surface eyebrow="输入提示">
      <div className="space-y-3">
        <div className="relative">
          <Textarea
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            onKeyDown={onKeyDown}
            rows={8}
            placeholder="我刚改了一段 React 代码，想让 agent 帮我审一下安全漏洞……"
            className="min-h-[200px] resize-y font-mono text-[0.85rem] leading-relaxed"
          />
          <div className="absolute bottom-2 right-3 pointer-events-none flex items-center gap-1 text-2xs text-ink-300">
            <kbd className="font-mono px-1 rounded border border-ink-100 bg-parchment-100">
              ⌘
            </kbd>
            <span>+</span>
            <kbd className="font-mono px-1 rounded border border-ink-100 bg-parchment-100">
              Enter
            </kbd>
            <span className="ml-1">发送</span>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-4 pt-1">
          {/* top_k slider */}
          <div className="flex-1 min-w-[180px]">
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="topk"
                className="label !mb-0 inline-flex items-center gap-1.5"
              >
                top_k
                <HelpTip>
                  从向量检索中返回多少候选，越大覆盖越广，但注入的 token 也越多。
                </HelpTip>
              </label>
              <span className="num text-2xs text-ink-700">{topK}</span>
            </div>
            <input
              id="topk"
              type="range"
              min={1}
              max={10}
              step={1}
              value={topK}
              onChange={(e) => onTopKChange(Number(e.target.value))}
              className={cn(
                'w-full h-1.5 rounded-full appearance-none bg-ink-100',
                'accent-oxide-500 cursor-pointer',
                '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5',
                '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-oxide-500',
                '[&::-webkit-slider-thumb]:shadow-elevate'
              )}
            />
          </div>

          {/* max_tokens input */}
          <div className="w-[148px]">
            <label
              htmlFor="maxtok"
              className="label !mb-0 inline-flex items-center gap-1.5 mb-1.5"
            >
              max_tokens
              <HelpTip>
                推荐返回的总 body token 上限。aiforge 会按分数顺序填，超出就截断。
              </HelpTip>
            </label>
            <Input
              id="maxtok"
              type="number"
              min={200}
              max={50000}
              step={100}
              value={maxTokens}
              onChange={(e) => onMaxTokensChange(Number(e.target.value) || 0)}
              className="font-mono"
            />
          </div>

          {/* submit */}
          <div className="ml-auto flex items-center gap-2">
            <HelpTip>
              推荐返回 top-K，token 预算控制注入到 agent 的总 body 大小。
            </HelpTip>
            <Button
              type="button"
              variant="oxide"
              size="lg"
              onClick={onSubmit}
              disabled={disabled}
              className="min-w-[148px]"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  推荐中…
                </>
              ) : (
                <>
                  发送推荐
                  <Send className="w-3.5 h-3.5" />
                </>
              )}
            </Button>
          </div>
        </div>

        {empty && (
          <div className="text-2xs text-ink-400 -mt-1">
            请先输入 prompt 再发送 · 或点击下方示例。
          </div>
        )}
      </div>
    </Surface>
  );
}
