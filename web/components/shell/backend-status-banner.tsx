'use client';

// 全局后端可达性横幅。各页都有 mock 兜底，后端真挂掉时界面与 demo 模式无异、
// 用户无从察觉——这里用一个 /v1/health 探针（与 dashboard 同 key，SWR 自动去重，
// 不产生额外请求）在确认不可达时挂条提示，把「演示数据」这件事显式告诉用户。

import { useState } from 'react';
import useSWR from 'swr';
import { AlertTriangle, X } from 'lucide-react';
import { fetcher } from '@/lib/api-client';
import type { HealthResponse } from '@/lib/api-types';

export function BackendStatusBanner() {
  const { error, isLoading } = useSWR<HealthResponse>('/v1/health', fetcher, {
    refreshInterval: 15_000,
    revalidateOnFocus: false,
    onError: () => {},
  });
  const [dismissed, setDismissed] = useState(false);

  // 仅在确认失败后提示；首屏加载中或已恢复都不显示。
  const unreachable = !!error && !isLoading;
  if (!unreachable || dismissed) return null;

  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-amber-300/60 bg-amber-50 px-6 py-1.5 text-2xs text-amber-800 lg:px-10"
    >
      <AlertTriangle className="h-3 w-3 shrink-0" />
      <span className="font-mono">
        后端不可达 · 当前展示演示数据，操作不会写入真实数据库
      </span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="ml-auto inline-flex items-center text-amber-700/70 transition-colors hover:text-amber-900"
        aria-label="关闭提示"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
