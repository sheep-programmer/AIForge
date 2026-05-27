// 标签编辑器：当前 chip 列表 + 添加输入框 + 建议补全。
// 改动通过 api.setArtifactTags 推到后端。

'use client';

import { useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { Check, Plus } from 'lucide-react';
import { api, fetcher } from '@/lib/api-client';
import type { TagListResponse } from '@/lib/api-types';
import { MOCK_TAGS } from '@/lib/mock-data';
import { TagChip } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface TagEditorProps {
  artifactId: string;
  initialTags: string[];
  /** 通知父级 tag 改变（用于乐观更新） */
  onTagsChange?: (tags: string[]) => void;
}

export function TagEditor({ artifactId, initialTags, onTagsChange }: TagEditorProps) {
  const [tags, setTags] = useState<string[]>(initialTags);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: tagListResp } = useSWR<TagListResponse>('/v1/tags', fetcher, {
    onError: () => {},
  });
  const allTags = tagListResp?.items ?? MOCK_TAGS;

  const suggestions = useMemo(() => {
    const needle = input.trim().toLowerCase();
    return allTags
      .filter((t) => !tags.includes(t.name))
      .filter((t) => (needle ? t.name.toLowerCase().includes(needle) : true))
      .slice(0, 6);
  }, [allTags, tags, input]);

  const updateTags = (next: string[]) => {
    setTags(next);
    setDirty(true);
    onTagsChange?.(next);
  };

  const addTag = (name: string) => {
    const clean = name.trim().toLowerCase();
    if (!clean) return;
    if (tags.includes(clean)) return;
    updateTags([...tags, clean]);
    setInput('');
    inputRef.current?.focus();
  };

  const removeTag = (name: string) => {
    updateTags(tags.filter((t) => t !== name));
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.setArtifactTags(artifactId, tags);
      toast.success(`已更新标签 · ${tags.length} 个`);
      setDirty(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      toast.error(`保存失败：${msg}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* 当前标签 */}
      <div className="flex flex-wrap items-center gap-1.5 min-h-[28px]">
        {tags.length === 0 ? (
          <span className="text-2xs text-ink-300 italic">尚未打标，输入或选择一个标签</span>
        ) : (
          tags.map((t) => (
            <TagChip key={t} name={t} onRemove={() => removeTag(t)} size="md" />
          ))
        )}
      </div>

      {/* 输入新标签 */}
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTag(input);
              } else if (e.key === 'Backspace' && !input && tags.length > 0) {
                removeTag(tags[tags.length - 1]);
              }
            }}
            placeholder="输入新标签后回车"
            className="w-full h-8 px-2.5 rounded border border-ink-100 bg-card text-xs font-mono placeholder:text-ink-300 focus-ring focus:border-oxide-400/50 transition"
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => addTag(input)}
          disabled={!input.trim()}
        >
          <Plus className="w-3 h-3" />
          添加
        </Button>
      </div>

      {/* 建议 */}
      {suggestions.length > 0 && (
        <div className="space-y-1.5">
          <div className="label !mb-0">建议</div>
          <div className="flex flex-wrap gap-1">
            {suggestions.map((s) => (
              <button
                key={s.name}
                onClick={() => addTag(s.name)}
                className="inline-flex items-center gap-1 h-6 px-2 rounded border border-ink-100 bg-parchment-50 text-2xs font-mono text-ink-600 hover:bg-parchment-200 hover:border-ink-200 transition-colors duration-150"
              >
                <Plus className="w-2.5 h-2.5 text-ink-300" />
                {s.name}
                <span className="text-ink-300 num">{s.artifact_count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 保存按钮 */}
      <div className="flex items-center justify-between pt-1">
        <span className="text-2xs text-ink-300">
          {dirty ? '有未保存的改动' : '已与服务器同步'}
        </span>
        <Button
          variant={dirty ? 'oxide' : 'secondary'}
          size="sm"
          onClick={save}
          disabled={!dirty || saving}
        >
          <Check className="w-3 h-3" />
          {saving ? '保存中…' : '保存'}
        </Button>
      </div>
    </div>
  );
}
