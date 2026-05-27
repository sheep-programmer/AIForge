// 表面卡片：极细 hairline 边框，可选 eyebrow 标题。
// 所有 panel 的统一容器。

import * as React from 'react';
import { cn } from '@/lib/utils';

interface SurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  strong?: boolean;
  /** 大写小标签 + 自动渐变分隔线 */
  eyebrow?: string;
  /** 右上角辅助内容（按钮 / 链接） */
  actions?: React.ReactNode;
  /** 内边距：默认 p-5 lg:p-6；可改 'tight' 或 'none' */
  padding?: 'default' | 'tight' | 'none';
}

export function Surface({
  strong,
  eyebrow,
  actions,
  padding = 'default',
  className,
  children,
  ...rest
}: SurfaceProps) {
  return (
    <section
      {...rest}
      className={cn(
        strong ? 'surface-strong' : 'surface',
        padding === 'default' && 'p-5 lg:p-6',
        padding === 'tight' && 'p-4',
        className
      )}
    >
      {(eyebrow || actions) && (
        <div className="flex items-center justify-between mb-4">
          {eyebrow ? <div className="eyebrow !mb-0 flex-1">{eyebrow}</div> : <span />}
          {actions && <div className="shrink-0 -my-1">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
