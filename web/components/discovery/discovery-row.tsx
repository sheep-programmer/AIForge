'use client';

import * as React from 'react';
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Github,
  GitPullRequestArrow,
  Star,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import { Badge, StatusDot, TagChip } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { fmtNumber, fmtRelativeTime, cn } from '@/lib/utils';
import type { PendingDiscovery } from '@/lib/api-types';

interface DiscoveryRowProps {
  item: PendingDiscovery;
  busy?: boolean;
  /** 标识为本会话内已决策的乐观更新 */
  localDecision?: 'approved' | 'rejected' | null;
  onApprove: (item: PendingDiscovery) => void;
  onReject: (item: PendingDiscovery) => void;
}

const SOURCE_LABEL: Record<string, string> = {
  'github-search': 'github · 搜索',
  trending: 'github · trending',
  'user-suggest': '用户推荐',
};

export function DiscoveryRow({
  item,
  busy,
  localDecision,
  onApprove,
  onReject,
}: DiscoveryRowProps) {
  const [expanded, setExpanded] = React.useState(false);

  const decided = localDecision ?? (item.decision !== 'pending' ? item.decision : null);
  const isPending = !decided;
  const hasMore = item.skill_count > item.sample_skill_names.length;

  return (
    <li
      className={cn(
        'cell-row transition',
        decided === 'approved' && 'bg-oxide-100/30',
        decided === 'rejected' && 'bg-ember-100/30 opacity-80'
      )}
    >
      <div className="px-5 py-4 grid grid-cols-12 gap-4 items-start">
        {/* main info */}
        <div className="col-span-12 lg:col-span-7 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={item.source_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 font-mono text-sm text-ink-800 hover:text-oxide-600 transition group min-w-0"
            >
              <Github className="w-3.5 h-3.5 text-ink-400 shrink-0" />
              <span className="truncate">{item.source_repo}</span>
              <ExternalLink className="w-3 h-3 text-ink-300 group-hover:text-ink-700 shrink-0" />
            </a>
            <span className="inline-flex items-center gap-1 text-2xs text-ink-400">
              <Star className="w-3 h-3 text-amber-500 fill-amber-500/30" />
              <span className="num text-ink-700">{fmtNumber(item.source_stars)}</span>
            </span>
            <Badge tone="neutral">{SOURCE_LABEL[item.found_via] ?? item.found_via}</Badge>
            {decided === 'approved' && (
              <Badge tone="oxide">
                <StatusDot state="active" /> 已批准
              </Badge>
            )}
            {decided === 'rejected' && (
              <Badge tone="ember">
                <StatusDot state="error" /> 已拒绝
              </Badge>
            )}
          </div>

          <div className="mt-2 flex items-center gap-2 flex-wrap min-w-0">
            <span className="text-2xs text-ink-400">
              共 <span className="num text-ink-700">{fmtNumber(item.skill_count)}</span> 个 skill
            </span>
            <span className="text-ink-200">·</span>
            <div className="flex items-center gap-1 flex-wrap min-w-0">
              {item.sample_skill_names.slice(0, 3).map((s) => (
                <TagChip key={s} name={s} />
              ))}
              {hasMore && !expanded && (
                <span className="text-2xs text-ink-400">
                  +{item.skill_count - 3} 更多
                </span>
              )}
            </div>
          </div>

          {expanded && hasMore && (
            <div className="mt-2 animate-fade-up">
              <div className="label !mb-1.5">SAMPLE · 全部命中</div>
              <div className="flex items-center gap-1 flex-wrap">
                {item.sample_skill_names.map((s) => (
                  <TagChip key={s} name={s} />
                ))}
                {item.skill_count > item.sample_skill_names.length && (
                  <span className="text-2xs text-ink-300">
                    +{item.skill_count - item.sample_skill_names.length} 入库后可见
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="mt-2 font-mono text-2xs text-ink-400 inline-flex items-center gap-1">
            <GitPullRequestArrow className="w-3 h-3" />
            发现于 {fmtRelativeTime(item.found_at)}
          </div>
        </div>

        {/* actions */}
        <div className="col-span-12 lg:col-span-5 flex items-center justify-start lg:justify-end gap-2 flex-wrap">
          {isPending ? (
            <>
              <Button
                variant="oxide"
                size="sm"
                onClick={() => onApprove(item)}
                disabled={busy}
              >
                <ThumbsUp className="w-3 h-3" />
                批准 · 入库
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onReject(item)}
                disabled={busy}
              >
                <ThumbsDown className="w-3 h-3" />
                拒绝
              </Button>
            </>
          ) : (
            <span className="text-2xs text-ink-400 font-mono">
              {decided === 'approved' ? '已加入入库队列' : '已加入永不推荐名单'}
            </span>
          )}

          <a
            href={item.source_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-2xs text-ink-400 hover:text-ink-800 transition px-2 h-7 rounded"
          >
            <Github className="w-3 h-3" /> 在 GitHub 查看
          </a>

          {hasMore && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex items-center gap-1 text-2xs text-ink-400 hover:text-ink-800 transition px-2 h-7 rounded"
            >
              {expanded ? (
                <>
                  收起 <ChevronUp className="w-3 h-3" />
                </>
              ) : (
                <>
                  展开 <ChevronDown className="w-3 h-3" />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
