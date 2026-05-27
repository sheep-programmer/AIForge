'use client';

// 新建 tag 的 modal：name 必填，受服务器正则约束；description 可选。
// 提交成功后 toast + 关闭 + 调用 onCreated 让父组件 mutate SWR cache.

import * as React from 'react';
import { AlertTriangle, Check, Plus, TagsIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api-client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface CreateTagDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
  /** 已经存在的 tag 名，做客户端重名校验 */
  existingNames?: string[];
}

// 与服务端 schemas.py 中 TagCreate 的正则保持一致
const TAG_NAME_REGEX = /^[a-z0-9][a-z0-9-]*$/;

export function CreateTagDialog({
  open,
  onOpenChange,
  onCreated,
  existingNames = [],
}: CreateTagDialogProps) {
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  // 关闭时清空
  React.useEffect(() => {
    if (!open) {
      setName('');
      setDescription('');
      setSubmitting(false);
    }
  }, [open]);

  const trimmed = name.trim();
  const regexOk = TAG_NAME_REGEX.test(trimmed);
  const lengthOk = trimmed.length >= 2 && trimmed.length <= 40;
  const duplicate = existingNames.includes(trimmed);
  const valid = trimmed && regexOk && lengthOk && !duplicate;

  let validationMsg: string | null = null;
  if (trimmed && !regexOk) validationMsg = '只能用小写字母、数字与连字符；必须以字母或数字开头。';
  else if (trimmed && !lengthOk) validationMsg = '长度需在 2–40 字符之间。';
  else if (duplicate) validationMsg = '已存在同名标签。';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    try {
      await api.createTag(trimmed, description.trim() || undefined);
      toast.success(`已创建标签 ${trimmed}`, {
        description: '自动打标流水线将会立刻识别它。',
      });
      onCreated?.();
      onOpenChange(false);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : '未知错误';
      toast.error('创建失败', { description: message });
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!w-[560px]">
        <DialogHeader>
          <div className="flex items-center gap-2 label !mb-1">
            <TagsIcon className="w-3 h-3" />
            <span>REGISTRY · NEW TAG</span>
          </div>
          <DialogTitle>新建标签</DialogTitle>
          <DialogDescription>
            标签用于浏览/过滤/审计自动打标，不影响 reranker 的语义打分。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-5">
          <div className="space-y-2">
            <label htmlFor="tag-name" className="label !mb-0 flex items-center gap-2">
              <span>标签名</span>
              <span className="text-ember-500 lowercase tracking-normal">必填</span>
            </label>
            <Input
              id="tag-name"
              placeholder="例：browser-automation"
              autoComplete="off"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase())}
              className="font-mono"
            />
            <div className="flex items-start gap-2 min-h-[1.25rem]">
              {validationMsg ? (
                <span className="inline-flex items-center gap-1.5 text-2xs text-ember-500">
                  <AlertTriangle className="w-3 h-3" />
                  {validationMsg}
                </span>
              ) : trimmed && valid ? (
                <span className="inline-flex items-center gap-1.5 text-2xs text-oxide-600">
                  <Check className="w-3 h-3" />
                  格式正确
                </span>
              ) : (
                <span className="text-2xs text-ink-400 font-mono">^[a-z0-9][a-z0-9-]*$</span>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="tag-desc" className="label !mb-0">
              说明（可选）
            </label>
            <Textarea
              id="tag-desc"
              placeholder="一句话说明这个标签覆盖什么场景，自动打标会读到。"
              rows={3}
              maxLength={200}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <div className="text-2xs text-ink-300 text-right font-mono">
              {description.length}/200
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t hairline border-t-ink-100/60">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              取消
            </Button>
            <Button
              type="submit"
              variant="oxide"
              disabled={!valid || submitting}
              className={cn(submitting && 'opacity-70')}
            >
              <Plus className="w-4 h-4" />
              {submitting ? '正在创建…' : '创建标签'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
