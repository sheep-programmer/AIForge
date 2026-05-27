'use client';

import * as React from 'react';
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { ArtifactTypeBadge, TagChip } from '@/components/ui/badge';
import { ScoreBar } from './score-bar';
import { fmtNumber } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { Recommendation } from '@/lib/api-types';

interface RecommendationCardProps {
  rank: number;
  rec: Recommendation;
}

export function RecommendationCard({ rank, rec }: RecommendationCardProps) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <article
      className={cn(
        'surface p-4 lg:p-5 space-y-3 animate-fade-up',
        'border-l-2 border-l-oxide-400/50'
      )}
    >
      {/* header */}
      <header className="flex items-start gap-3">
        <span className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-sm bg-ink-800 text-parchment-50 font-mono text-2xs">
          #{rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="display text-lg text-ink-800 tracking-tight font-normal truncate">
              {rec.name}
            </h3>
            <ArtifactTypeBadge type={rec.artifact_type} />
          </div>
          {rec.source_url && (
            <a
              href={rec.source_url}
              target="_blank"
              rel="noreferrer"
              className="mt-0.5 font-mono text-2xs text-ink-400 hover:text-ink-800 inline-flex items-center gap-1 transition truncate max-w-full"
            >
              {rec.source_url.replace(/^https?:\/\//, '')}
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
        </div>
        <div className="shrink-0 w-[140px]">
          <ScoreBar score={rec.score} />
        </div>
      </header>

      {/* body */}
      <p className="text-sm text-ink-700 leading-relaxed">{rec.description}</p>

      {rec.rerank_reason && (
        <p className="text-2xs text-ink-400 italic border-l border-ink-200 pl-2.5 leading-relaxed">
          “{rec.rerank_reason}”
        </p>
      )}

      {/* footer */}
      <footer className="flex items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-1 flex-wrap min-w-0">
          {rec.tags.slice(0, 5).map((t) => (
            <TagChip key={t} name={t} />
          ))}
          {rec.tags.length > 5 && (
            <span className="text-2xs text-ink-300">+{rec.tags.length - 5}</span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="font-mono text-2xs text-ink-400">
            <span className="num text-ink-700">{fmtNumber(rec.tokens)}</span>
            <span className="ml-1 text-ink-300">tok</span>
          </span>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className={cn(
              'inline-flex items-center gap-1 text-2xs',
              'text-ink-500 hover:text-ink-800 transition focus-ring rounded px-1 py-0.5'
            )}
          >
            {expanded ? (
              <>
                收起 body <ChevronUp className="w-3 h-3" />
              </>
            ) : (
              <>
                查看完整 body <ChevronDown className="w-3 h-3" />
              </>
            )}
          </button>
        </div>
      </footer>

      {expanded && (
        <div className="pt-2 animate-fade-up">
          <div className="label !mb-1.5">注入 body · {fmtNumber(rec.tokens)} tokens</div>
          <pre
            className={cn(
              'font-mono text-2xs leading-relaxed text-ink-700',
              'rounded-sm bg-parchment-200/60 border border-ink-100',
              'p-3 max-h-[280px] overflow-auto whitespace-pre-wrap break-words'
            )}
          >
            {rec.body || '(空)'}
          </pre>
        </div>
      )}
    </article>
  );
}
