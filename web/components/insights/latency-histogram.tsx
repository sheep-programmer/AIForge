'use client';

// 0-500ms 分桶直方图，标 p50/p95/p99 markers。
// Recharts BarChart：x = bucket 起始 ms，y = count。

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface Bucket {
  bucket: string;
  bucketStart: number;
  count: number;
}

interface Props {
  buckets: Bucket[];
  p50: number;
  p95: number;
  p99: number;
}

export function LatencyHistogram({ buckets, p50, p95, p99 }: Props) {
  return (
    <div>
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={buckets} margin={{ top: 8, right: 16, left: -8, bottom: 4 }}>
            <CartesianGrid stroke="rgba(14,17,22,0.06)" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="bucketStart"
              stroke="rgba(14,17,22,0.4)"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              tick={{ fontFamily: 'var(--font-mono)' }}
              tickFormatter={(v: number) => `${v}`}
              interval={4}
            />
            <YAxis
              stroke="rgba(14,17,22,0.4)"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              width={36}
              tick={{ fontFamily: 'var(--font-mono)' }}
            />
            <Tooltip
              cursor={{ fill: 'rgba(14,17,22,0.04)' }}
              contentStyle={{
                background: '#FFFFFF',
                border: '1px solid rgba(14,17,22,0.1)',
                borderRadius: 6,
                boxShadow: '0 12px 32px -16px rgba(14,17,22,.18)',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                padding: 10,
              }}
              labelStyle={{
                color: '#7E828B',
                marginBottom: 4,
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
              }}
              labelFormatter={(v: number) => `${v}-${v + 10} ms`}
              formatter={(v: number) => [`${v}`, '请求数']}
            />
            <Bar dataKey="count" radius={[2, 2, 0, 0]}>
              {buckets.map((b, i) => {
                const overP95 = b.bucketStart >= p95;
                const overP50 = b.bucketStart >= p50;
                const color = overP95 ? '#9B2B22' : overP50 ? '#A26F1E' : '#0E5C4A';
                return <Cell key={i} fill={color} />;
              })}
            </Bar>
            <ReferenceLine
              x={p50}
              stroke="#0E5C4A"
              strokeDasharray="2 3"
              label={{
                value: `p50 ${p50}ms`,
                position: 'top',
                fill: '#0E5C4A',
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
              }}
            />
            <ReferenceLine
              x={p95}
              stroke="#A26F1E"
              strokeDasharray="2 3"
              label={{
                value: `p95 ${p95}ms`,
                position: 'top',
                fill: '#A26F1E',
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
              }}
            />
            <ReferenceLine
              x={p99}
              stroke="#9B2B22"
              strokeDasharray="2 3"
              label={{
                value: `p99 ${p99}ms`,
                position: 'top',
                fill: '#9B2B22',
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center gap-5 mt-3 ml-2">
        <Legend dotClassName="bg-oxide-500" label="< p50 · 健康区" />
        <Legend dotClassName="bg-amber-500" label="p50-p95 · 关注" />
        <Legend dotClassName="bg-ember-500" label="> p95 · 长尾" />
      </div>
    </div>
  );
}

function Legend({ dotClassName, label }: { dotClassName: string; label: string }) {
  return (
    <div className="flex items-center gap-2 text-2xs text-ink-400">
      <span className={`inline-block w-2 h-2 rounded-sm ${dotClassName}`} />
      <span className="font-mono uppercase tracking-wider">{label}</span>
    </div>
  );
}
