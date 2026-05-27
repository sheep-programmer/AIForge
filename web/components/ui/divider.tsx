import * as React from 'react';
import { cn } from '@/lib/utils';

/** 极细分隔线，可带文字 */
export function Divider({
  label,
  className,
}: {
  label?: string;
  className?: string;
}) {
  if (!label) {
    return <hr className={cn('hairline border-t', className)} />;
  }
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span className="flex-1 h-px bg-ink-100" />
      <span className="label !mb-0">{label}</span>
      <span className="flex-1 h-px bg-ink-100" />
    </div>
  );
}
