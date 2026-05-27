'use client';

// 当期 Top artifacts 列表：排名 · 类型 · 名字 · tag chips · 7 天 sparkline · recommend_count

import Link from 'next/link';
import { Line, LineChart, ResponsiveContainer } from 'recharts';
import { ArtifactTypeBadge, TagChip } from '@/components/ui/badge';
import { fmtNumber } from '@/lib/utils';
import type { ArtifactType } from '@/lib/api-types';

interface TopArtifact {
  id: string;
  name: string;
  artifact_type: ArtifactType;
  tags: string[];
  recommend_count: number;
  daily_calls: number[];
}

export function TopArtifactsList({ items }: { items: TopArtifact[] }) {
  const max = items.reduce((m, it) => (it.recommend_count > m ? it.recommend_count : m), 0);

  return (
    <ul>
      {items.map((a, i) => {
        const sparkData = a.daily_calls.map((v, idx) => ({ idx, v }));
        const trend = a.daily_calls[a.daily_calls.length - 1] - a.daily_calls[0];
        const pctOfMax = max ? (a.recommend_count / max) * 100 : 0;

        return (
          <li key={a.id} className="cell-row last:border-b-0">
            <Link
              href={`/artifacts/${a.id}`}
              className="grid grid-cols-12 items-center gap-3 px-5 py-3"
            >
              {/* rank */}
              <div className="col-span-1 flex items-center gap-1.5">
                <span className="font-mono text-2xs text-ink-300 tabular-nums w-4 text-right">
                  {String(i + 1).padStart(2, '0')}
                </span>
              </div>

              {/* type + name */}
              <div className="col-span-4 flex items-center gap-2 min-w-0">
                <ArtifactTypeBadge type={a.artifact_type} withLabel={false} />
                <span className="truncate text-sm font-medium text-ink-800">{a.name}</span>
              </div>

              {/* tags */}
              <div className="col-span-3 hidden md:flex items-center gap-1 flex-wrap">
                {a.tags.slice(0, 2).map((t) => (
                  <TagChip key={t} name={t} />
                ))}
                {a.tags.length > 2 && (
                  <span className="text-2xs text-ink-300 num">+{a.tags.length - 2}</span>
                )}
              </div>

              {/* sparkline */}
              <div className="col-span-2 h-7">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sparkData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                    <Line
                      type="monotone"
                      dataKey="v"
                      stroke={trend >= 0 ? '#0E5C4A' : '#9B2B22'}
                      strokeWidth={1.4}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* count + bar */}
              <div className="col-span-2 flex flex-col items-end">
                <div className="font-mono text-sm text-ink-800 tabular-nums">
                  {fmtNumber(a.recommend_count)}
                </div>
                <div className="w-full h-1 mt-1 bg-ink-100/60 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-oxide-500"
                    style={{ width: `${pctOfMax}%` }}
                  />
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
