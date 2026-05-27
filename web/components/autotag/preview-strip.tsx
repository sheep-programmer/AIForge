// 抽样预览：从 listArtifacts 里挑出还没被打过 tag 的 5 条，做横向滚动卡片。
// 让用户在按下「开始打标」前先 visually 知道自己将要处理什么。

'use client';

import * as React from 'react';
import useSWR from 'swr';
import { Tag } from 'lucide-react';
import { Surface } from '@/components/ui/surface';
import { ArtifactTypeBadge, TagChip } from '@/components/ui/badge';
import { fetcher } from '@/lib/api-client';
import type { ArtifactBrief, ArtifactListResponse } from '@/lib/api-types';
import { MOCK_ARTIFACTS } from '@/lib/mock-data';
import { truncate } from '@/lib/utils';

interface PreviewStripProps {
  /** 决定挑哪些样本 */
  onlyUntagged: boolean;
}

function pickUntagged(items: ArtifactBrief[]): ArtifactBrief[] {
  return items.filter((a) => a.tags.length === 0).slice(0, 5);
}

function pickWithFew(items: ArtifactBrief[]): ArtifactBrief[] {
  return items
    .slice()
    .sort((a, b) => a.tags.length - b.tags.length)
    .slice(0, 5);
}

export function PreviewStrip({ onlyUntagged }: PreviewStripProps) {
  const { data, error } = useSWR<ArtifactListResponse>(
    '/v1/artifacts?limit=50&offset=0',
    fetcher,
    { onError: () => {} },
  );
  const all = data?.items ?? (error ? MOCK_ARTIFACTS : MOCK_ARTIFACTS);
  const sample = onlyUntagged ? pickUntagged(all) : pickWithFew(all);

  // 当全库都已打标时，退而求其次展示几条 "tags 最少的"
  const finalSample = sample.length > 0 ? sample : pickWithFew(all);
  const empty = onlyUntagged && sample.length === 0;

  return (
    <Surface
      eyebrow="待打标 · 抽样预览"
      actions={
        <span className="text-2xs text-ink-400">
          展示 <span className="num text-ink-700">{finalSample.length}</span> / 共有可处理项{' '}
          <span className="num text-ink-700">{onlyUntagged ? all.filter((a) => a.tags.length === 0).length : all.length}</span>
        </span>
      }
    >
      {empty && (
        <div className="mb-3 text-2xs text-ink-400 italic">
          全库 artifact 都至少有一个 tag。下面这些是当前 tag 最少的，运行 "整库重新打标" 时会被覆盖。
        </div>
      )}
      <div className="-mx-1 overflow-x-auto pb-1">
        <ul className="flex gap-3 px-1 min-w-min">
          {finalSample.map((a) => (
            <li
              key={a.id}
              className={
                'shrink-0 w-[260px] rounded-md border border-ink-100/80 bg-parchment-50/50 p-3 flex flex-col gap-2'
              }
            >
              <div className="flex items-center justify-between gap-2">
                <ArtifactTypeBadge type={a.artifact_type} withLabel={false} />
                <span className="text-2xs text-ink-300 font-mono truncate">
                  {truncate(a.source_repo, 22)}
                </span>
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-ink-800 truncate">{a.name}</div>
                <p className="mt-0.5 text-2xs text-ink-400 line-clamp-2 leading-relaxed">
                  {a.description}
                </p>
              </div>
              <div className="mt-auto pt-2 border-t border-ink-100/60 flex items-center gap-1.5 flex-wrap min-h-[20px]">
                {a.tags.length === 0 ? (
                  <span className="inline-flex items-center gap-1 text-2xs text-ink-300 italic">
                    <Tag className="w-3 h-3" />
                    未打标
                  </span>
                ) : (
                  <>
                    {a.tags.slice(0, 3).map((t) => (
                      <TagChip key={t} name={t} />
                    ))}
                    {a.tags.length > 3 && (
                      <span className="text-2xs text-ink-300">+{a.tags.length - 3}</span>
                    )}
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Surface>
  );
}
