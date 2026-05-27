import * as React from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  /** 小标签，置于标题上方，大写 uppercase */
  eyebrow?: string;
  /** 主标题 */
  title: string;
  /** 副标题：对小白友好的一句话解释这是什么 */
  description?: string;
  /** 右侧操作区（按钮组等） */
  actions?: React.ReactNode;
  /** 标题下方的额外内容（如 KPI 行） */
  children?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn('animate-fade-up', className)}>
      <div className="flex items-start justify-between gap-6 mb-6">
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <div className="label !mb-2 inline-flex items-center gap-2">
              <span className="dot dot-live" />
              {eyebrow}
            </div>
          )}
          <h1 className="display text-[2.6rem] lg:text-[3.2rem] leading-[1.04] font-light tracking-tight text-ink-800">
            {title}
          </h1>
          {description && (
            <p className="mt-3 text-ink-500 text-[0.95rem] max-w-2xl leading-relaxed">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}
