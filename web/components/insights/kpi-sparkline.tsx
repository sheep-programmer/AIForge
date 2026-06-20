'use client';

// p95 趋势 sparkline。独立成文件以便 next/dynamic 懒加载 recharts，
// 让 /insights 路由的首屏 JS 不必预先打入图表库。

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface KpiSparklineProps {
  data: { t: string; p95: number }[];
}

export function KpiSparkline({ data }: KpiSparklineProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 6, right: 12, left: 12, bottom: 0 }}>
        <defs>
          <linearGradient id="kpi-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0E5C4A" stopOpacity={0.28} />
            <stop offset="100%" stopColor="#0E5C4A" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="t" hide />
        <YAxis hide domain={['dataMin - 10', 'dataMax + 20']} />
        <Tooltip
          cursor={{ stroke: 'rgba(14,17,22,0.18)', strokeWidth: 1 }}
          contentStyle={{
            background: '#FFFFFF',
            border: '1px solid rgba(14,17,22,0.1)',
            borderRadius: 6,
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            padding: 8,
          }}
          formatter={(v: number) => [`${v} ms`, 'p95']}
        />
        <Area
          type="monotone"
          dataKey="p95"
          stroke="#0E5C4A"
          strokeWidth={1.2}
          fill="url(#kpi-grad)"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
