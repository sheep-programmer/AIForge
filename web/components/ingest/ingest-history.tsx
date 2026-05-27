// 最近入库记录：聚合 listArtifacts(limit=20) 按 source_repo 分组，
// 用 updated_at 估算每个仓库最近一次入库时间。
// 没有专门的 /v1/ingest/history 接口，所以这里用 artifact 数据反推。

'use client';

import * as React from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ArrowUpRight, GitBranch, Star } from 'lucide-react';
import { Surface } from '@/components/ui/surface';
import { ArtifactTypeBadge, Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { fetcher } from '@/lib/api-client';
import type {
  ArtifactBrief,
  ArtifactListResponse,
  ArtifactType,
} from '@/lib/api-types';
import { MOCK_ARTIFACTS } from '@/lib/mock-data';
import { fmtNumber, fmtRelativeTime } from '@/lib/utils';

interface RepoEntry {
  repo: string;
  artifactCount: number;
  updatedAt: string;
  types: Record<ArtifactType, number>;
  stars: number;
  sourceUrl: string;
  sampleNames: string[];
}

function groupByRepo(items: ArtifactBrief[]): RepoEntry[] {
  const map = new Map<string, RepoEntry>();
  for (const a of items) {
    const key = a.source_repo || a.source_url;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        repo: a.source_repo || a.source_url,
        artifactCount: 1,
        updatedAt: a.updated_at,
        types: {
          skill: a.artifact_type === 'skill' ? 1 : 0,
          mcp: a.artifact_type === 'mcp' ? 1 : 0,
          plugin: a.artifact_type === 'plugin' ? 1 : 0,
        },
        stars: a.source_stars,
        sourceUrl: a.source_url,
        sampleNames: [a.name],
      });
    } else {
      existing.artifactCount += 1;
      existing.types[a.artifact_type] += 1;
      if (a.updated_at > existing.updatedAt) existing.updatedAt = a.updated_at;
      if (a.source_stars > existing.stars) existing.stars = a.source_stars;
      if (existing.sampleNames.length < 3) existing.sampleNames.push(a.name);
    }
  }
  return [...map.values()].sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : 1));
}

export function IngestHistory() {
  const { data, error } = useSWR<ArtifactListResponse>(
    '/v1/artifacts?limit=20&offset=0',
    fetcher,
    { onError: () => {} },
  );
  const items = data?.items ?? (error ? MOCK_ARTIFACTS : MOCK_ARTIFACTS);
  const entries = groupByRepo(items).slice(0, 8);

  return (
    <Surface
      eyebrow="最近入库"
      padding="none"
      actions={
        <Link
          href="/artifacts"
          className="text-2xs text-ink-400 hover:text-ink-800 inline-flex items-center gap-1 transition mr-5"
        >
          浏览全部 <ArrowUpRight className="w-3 h-3" />
        </Link>
      }
    >
      {entries.length === 0 ? (
        <div className="p-6">
          <EmptyState
            variant="inline"
            title="还没有任何入库记录"
            description="在上方粘贴一个 GitHub 仓库 URL 试试看。"
          />
        </div>
      ) : (
        <ul>
          {/* 表头 */}
          <li className="hidden md:grid grid-cols-12 gap-3 px-5 py-2.5 border-b border-ink-100/60 label !mb-0">
            <span className="col-span-5">仓库</span>
            <span className="col-span-2">类型分布</span>
            <span className="col-span-2">artifact</span>
            <span className="col-span-1">stars</span>
            <span className="col-span-2 text-right">最近更新</span>
          </li>
          {entries.map((e) => (
            <li key={e.repo} className="cell-row">
              <Link
                href={`/artifacts?source_repo=${encodeURIComponent(e.repo)}`}
                className="grid grid-cols-12 items-center gap-3 px-5 py-3.5"
              >
                <div className="col-span-12 md:col-span-5 min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium text-ink-800 truncate">
                    <GitBranch className="w-3.5 h-3.5 text-ink-300 shrink-0" />
                    <span className="font-mono truncate">{e.repo}</span>
                  </div>
                  <div className="mt-0.5 text-2xs text-ink-400 truncate font-mono">
                    {e.sampleNames.slice(0, 3).join(' · ')}
                    {e.artifactCount > 3 && ` · +${e.artifactCount - 3}`}
                  </div>
                </div>
                <div className="hidden md:flex col-span-2 items-center gap-1 flex-wrap">
                  {(Object.entries(e.types) as [ArtifactType, number][])
                    .filter(([, n]) => n > 0)
                    .map(([t, n]) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1"
                        title={`${t} × ${n}`}
                      >
                        <ArtifactTypeBadge type={t} withLabel={false} />
                        <span className="text-2xs num text-ink-500">{n}</span>
                      </span>
                    ))}
                </div>
                <div className="hidden md:flex col-span-2 items-center">
                  <Badge tone="oxide">
                    <span className="num">{e.artifactCount}</span>
                    <span className="opacity-60">条</span>
                  </Badge>
                </div>
                <div className="hidden md:flex col-span-1 items-center gap-1 text-2xs text-ink-400">
                  <Star className="w-3 h-3 text-ink-300" />
                  <span className="num">{fmtNumber(e.stars)}</span>
                </div>
                <div className="hidden md:block col-span-2 text-right text-2xs text-ink-400 font-mono">
                  {fmtRelativeTime(e.updatedAt)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Surface>
  );
}
