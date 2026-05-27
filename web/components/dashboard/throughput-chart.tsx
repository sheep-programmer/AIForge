'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Line,
} from 'recharts';

interface DataPoint {
  hour: string;
  calls: number;
  latency: number;
}

export function ThroughputChart({ data }: { data: DataPoint[] }) {
  return (
    <div className="h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id="calls-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0E5C4A" stopOpacity={0.32} />
              <stop offset="100%" stopColor="#0E5C4A" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(14,17,22,0.06)" strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="hour"
            stroke="rgba(14,17,22,0.4)"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            tick={{ fontFamily: 'var(--font-mono)' }}
            interval={3}
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
            cursor={{ stroke: 'rgba(14,17,22,0.2)', strokeWidth: 1 }}
            contentStyle={{
              background: '#FFFFFF',
              border: '1px solid rgba(14,17,22,0.1)',
              borderRadius: 6,
              boxShadow: '0 12px 32px -16px rgba(14,17,22,.18)',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              padding: 10,
            }}
            labelStyle={{ color: '#7E828B', marginBottom: 4, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em' }}
            formatter={(v: number, name: string) => [v, name === 'calls' ? '推荐次数' : 'p95 延迟 ms']}
          />
          <Area
            type="monotone"
            dataKey="calls"
            stroke="#0E5C4A"
            strokeWidth={1.5}
            fill="url(#calls-grad)"
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0, fill: '#0E5C4A' }}
          />
          <Line
            type="monotone"
            dataKey="latency"
            stroke="#A26F1E"
            strokeWidth={1}
            strokeDasharray="3 3"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>

      <div className="flex items-center gap-5 mt-3 ml-6">
        <Legend dotClassName="bg-oxide-500" label="推荐次数 · area" />
        <Legend dotClassName="bg-amber-500" stroke label="p95 延迟 ms · dashed" />
      </div>
    </div>
  );
}

function Legend({ dotClassName, label, stroke }: { dotClassName: string; label: string; stroke?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-2xs text-ink-400">
      <span
        className={`inline-block ${stroke ? 'w-3 h-px' : 'w-2 h-2 rounded-full'} ${dotClassName}`}
      />
      <span className="font-mono uppercase tracking-wider">{label}</span>
    </div>
  );
}
