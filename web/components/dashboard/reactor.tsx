// "Reactor" — AIForge dashboard 的标志性视觉。
// 一个旋转的同心圆 SVG，象征推理管线在运转。
// 仅装饰用，但是它给 dashboard 一个"它在动"的物理感。

import { cn } from '@/lib/utils';

export function Reactor({
  active = true,
  className,
}: {
  active?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('relative', className)} aria-hidden>
      <svg viewBox="0 0 128 128" className="absolute inset-0 w-full h-full">
        {/* 外环刻度 */}
        <g className={active ? 'animate-reactor-spin origin-center' : ''}>
          {Array.from({ length: 60 }).map((_, i) => (
            <line
              key={i}
              x1="64"
              y1="6"
              x2="64"
              y2={i % 5 === 0 ? 12 : 10}
              stroke="#0E1116"
              strokeOpacity={i % 5 === 0 ? 0.5 : 0.18}
              strokeWidth={i % 5 === 0 ? 1.2 : 0.6}
              transform={`rotate(${(i * 360) / 60} 64 64)`}
            />
          ))}
        </g>

        {/* 中环 (反向旋转) */}
        <g
          style={{ animationDirection: 'reverse', animationDuration: '24s' }}
          className={active ? 'animate-reactor-spin origin-center' : ''}
        >
          <circle
            cx="64"
            cy="64"
            r="38"
            fill="none"
            stroke="#0E5C4A"
            strokeOpacity="0.4"
            strokeWidth="0.6"
            strokeDasharray="2 3"
          />
          <circle cx="64" cy="26" r="2" fill="#0E5C4A" />
          <circle cx="64" cy="102" r="1.4" fill="#1F7E64" />
        </g>

        {/* 内圆 */}
        <circle cx="64" cy="64" r="20" fill="none" stroke="#0E1116" strokeOpacity="0.12" />
        <circle
          cx="64"
          cy="64"
          r="20"
          fill="none"
          stroke="#3FC79A"
          strokeWidth="2"
          strokeDasharray="5 95"
          strokeLinecap="round"
          className={active ? 'animate-reactor-spin origin-center' : ''}
          style={{ animationDuration: '4s' }}
        />

        {/* 中心点 */}
        <circle cx="64" cy="64" r="3" fill="#0E5C4A" />
        <circle cx="64" cy="64" r="6" fill="none" stroke="#3FC79A" strokeOpacity="0.4" strokeWidth="0.8" />
      </svg>
    </div>
  );
}
