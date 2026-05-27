// Artifact 详情页：header + 启用切换 + 主体面板。

'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ArrowLeft, ExternalLink, Star } from 'lucide-react';
import { fetcher } from '@/lib/api-client';
import type { ArtifactDetail } from '@/lib/api-types';
import { MOCK_ARTIFACT_DETAIL } from '@/lib/mock-data';
import { Button } from '@/components/ui/button';
import { ArtifactTypeBadge, StatusDot } from '@/components/ui/badge';
import { ArtifactDetailPanel } from '@/components/artifacts/artifact-detail-panel';
import { cn, fmtNumber } from '@/lib/utils';

type Params = { id: string };

export default function ArtifactDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  // Next 15: params 是 Promise，在 client component 中用 use() 解包。
  const { id } = use(params);

  const { data, error, isLoading } = useSWR<ArtifactDetail>(
    `/v1/artifacts/${id}`,
    fetcher,
    { onError: () => {} }
  );

  const isDemo = !!error && !data;
  const artifact: ArtifactDetail | undefined = data ?? (isDemo ? MOCK_ARTIFACT_DETAIL : undefined);
  const [localActive, setLocalActive] = useState<boolean | null>(null);
  const isActive = localActive ?? artifact?.is_active ?? true;

  // 后端尚未提供启用/禁用 PATCH，本地切换给用户反馈。
  const onToggleActive = () => setLocalActive(!isActive);

  if (isLoading && !artifact) {
    return <DetailSkeleton />;
  }
  if (!artifact) {
    return (
      <div className="space-y-6">
        <Link
          href="/artifacts"
          className="inline-flex items-center gap-1 text-2xs text-ink-400 hover:text-ink-800 transition-colors duration-150"
        >
          <ArrowLeft className="w-3 h-3" /> 返回 Artifacts
        </Link>
        <div className="surface p-12 text-center">
          <h2 className="display text-2xl text-ink-800 font-normal">未找到 artifact</h2>
          <p className="mt-2 text-sm text-ink-400">ID 不存在或已被删除。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <Link
          href="/artifacts"
          className="inline-flex items-center gap-1 text-2xs text-ink-400 hover:text-ink-800 transition-colors duration-150"
        >
          <ArrowLeft className="w-3 h-3" /> 返回 Artifacts
        </Link>
        {isDemo && (
          <span className="inline-flex items-center gap-1.5 px-2 h-5 rounded-sm font-mono text-2xs uppercase tracking-wider bg-amber-100 text-amber-500">
            <span className="w-1 h-1 rounded-full bg-amber-500" />
            DEMO MODE · 后端未连接
          </span>
        )}
      </div>

      {/* 自定义头部（PageHeader 的 eyebrow 只接 string，这里用更灵活的实现） */}
      <header className="animate-fade-up">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-2 mb-2 flex-wrap">
              <ArtifactTypeBadge type={artifact.artifact_type} />
              <Link
                href={artifact.source_url}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-2xs text-ink-500 hover:text-ink-800 transition-colors duration-150 truncate"
              >
                {artifact.source_repo}
              </Link>
              <span className="inline-flex items-center gap-1 text-2xs text-ink-400">
                <Star className="w-3 h-3 text-ink-300" />
                <span className="num">{fmtNumber(artifact.source_stars)}</span>
              </span>
            </div>
            <h1 className="display text-[2.2rem] lg:text-[2.8rem] leading-[1.04] font-light tracking-tight text-ink-800 break-words">
              {artifact.name}
            </h1>
            {artifact.description && (
              <p className="mt-3 text-ink-500 text-[0.95rem] max-w-2xl leading-relaxed">
                {artifact.description}
              </p>
            )}
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <button
              onClick={onToggleActive}
              className={cn(
                'inline-flex items-center gap-2 h-9 px-3 rounded-md border text-xs font-mono uppercase tracking-wider',
                'transition-colors duration-150',
                isActive
                  ? 'bg-oxide-100 text-oxide-700 border-oxide-200 hover:bg-oxide-100/80'
                  : 'bg-card text-ink-500 border-ink-100/80 hover:bg-parchment-200'
              )}
            >
              <StatusDot state={isActive ? 'active' : 'inactive'} />
              {isActive ? '已启用' : '已禁用'}
            </button>
            <Button asChild variant="secondary" size="md">
              <Link href={artifact.source_url} target="_blank" rel="noreferrer">
                <ExternalLink className="w-4 h-4" />
                在 GitHub 打开
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <ArtifactDetailPanel artifact={{ ...artifact, is_active: isActive }} />
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-8">
      <div className="h-3 w-32 bg-ink-100/40 rounded animate-pulse" />
      <div className="space-y-3">
        <div className="h-3 w-40 bg-ink-100/40 rounded animate-pulse" />
        <div className="h-12 w-2/3 bg-ink-100/40 rounded animate-pulse" />
        <div className="h-4 w-1/2 bg-ink-100/30 rounded animate-pulse" />
      </div>
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-8 h-96 surface animate-pulse" />
        <div className="col-span-4 space-y-4">
          <div className="h-32 surface animate-pulse" />
          <div className="h-32 surface animate-pulse" />
        </div>
      </div>
    </div>
  );
}
