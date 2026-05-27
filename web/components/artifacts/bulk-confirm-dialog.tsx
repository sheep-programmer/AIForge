// 通用的二次确认弹窗：用于删除等高破坏性 bulk 操作。
// 调用方传入 requireText 时，用户必须原样输入才能提交。

'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface BulkConfirmDialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  title: string;
  description: React.ReactNode;
  /** 红色危险提示文案，例如「该操作不可撤销」。 */
  dangerText?: string;
  /** 用户必须原样输入这串字符才能提交（用于高破坏性操作）。 */
  requireText?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 提交回调，应当返回 Promise；执行期间按钮禁用。 */
  onConfirm: () => void | Promise<void>;
}

export function BulkConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  dangerText,
  requireText,
  confirmLabel = '确认',
  cancelLabel = '取消',
  onConfirm,
}: BulkConfirmDialogProps) {
  const [typed, setTyped] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 每次开关重置输入
  useEffect(() => {
    if (!open) {
      setTyped('');
      setSubmitting(false);
    }
  }, [open]);

  const canSubmit = requireText ? typed === requireText : true;

  const handleConfirm = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[480px]">
        <DialogHeader>
          <DialogTitle className="inline-flex items-center gap-2">
            <span className="w-7 h-7 rounded inline-flex items-center justify-center bg-ember-100 text-ember-500">
              <AlertTriangle className="w-3.5 h-3.5" />
            </span>
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-5 space-y-4">
          {dangerText && (
            <div className="px-3 py-2 rounded border border-ember-100 bg-ember-100/40 text-2xs text-ember-500 font-mono uppercase tracking-wider">
              {dangerText}
            </div>
          )}

          {requireText && (
            <div className="space-y-1.5">
              <label className="label !mb-0">
                输入 <span className="font-mono text-ink-700">{requireText}</span> 以解锁
              </label>
              <Input
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={requireText}
                className="font-mono"
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              variant="secondary"
              size="md"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              {cancelLabel}
            </Button>
            <Button
              variant="danger"
              size="md"
              onClick={handleConfirm}
              disabled={!canSubmit || submitting}
            >
              {submitting ? '执行中…' : confirmLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
