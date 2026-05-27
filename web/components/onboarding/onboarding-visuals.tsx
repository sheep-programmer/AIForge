// Onboarding 右侧 5 个 inline-SVG 可视化。
// 与 illustrations 区分：这些只服务于 wizard，不复用在 empty state。

import * as React from 'react';

// —— 1. 欢迎：放大的 logo + 脉动环 ——
export function VisualWelcome() {
  return (
    <svg width="320" height="320" viewBox="0 0 320 320" fill="none" aria-hidden>
      {[0, 1, 2].map((i) => (
        <circle
          key={i}
          cx="160"
          cy="160"
          r={70 + i * 28}
          stroke="#0E5C4A"
          strokeWidth="1"
          fill="none"
          opacity={0.18 - i * 0.05}
        >
          <animate
            attributeName="r"
            values={`${70 + i * 28};${78 + i * 28};${70 + i * 28}`}
            dur={`${3.4 + i * 0.4}s`}
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values={`${0.18 - i * 0.05};${0.32 - i * 0.05};${0.18 - i * 0.05}`}
            dur={`${3.4 + i * 0.4}s`}
            repeatCount="indefinite"
          />
        </circle>
      ))}
      <g transform="translate(102 102)">
        <rect x="2" y="2" width="116" height="116" rx="20" stroke="#0E5C4A" strokeWidth="2" fill="#FAFAF7" />
        <circle cx="34" cy="42" r="11" fill="#0E5C4A" />
        <circle cx="34" cy="42" r="3" fill="#FCFBF8" />
        <rect x="74" y="31" width="22" height="22" rx="3" transform="rotate(45 85 42)" fill="#1F3F6F" />
        <rect x="30" y="72" width="60" height="18" rx="9" fill="none" stroke="#A26F1E" strokeWidth="2" />
        <line x1="40" y1="81" x2="80" y2="81" stroke="#A26F1E" strokeWidth="1" strokeDasharray="2 2" />
      </g>
      <circle cx="234" cy="92" r="4" fill="#3FC79A">
        <animate attributeName="opacity" values="0.6;1;0.6" dur="1.6s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

// —— 2. 三种 artifact 漂浮到一个 registry ——
export function VisualThreeCards() {
  return (
    <svg width="320" height="320" viewBox="0 0 320 320" fill="none" aria-hidden>
      <g transform="translate(120 200)">
        <rect width="80" height="68" rx="6" stroke="#0E1116" strokeWidth="1.5" fill="#FFFFFF" />
        <line x1="0" y1="18" x2="80" y2="18" stroke="#0E1116" strokeWidth="1" />
        <text x="40" y="13" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="8" letterSpacing="2" fill="#0E1116">REGISTRY</text>
        {[0, 1, 2].map((i) => (
          <line key={i} x1="8" y1={30 + i * 11} x2="72" y2={30 + i * 11} stroke="#B7BAC0" strokeWidth="0.75" strokeDasharray="2 3" />
        ))}
      </g>
      <g style={{ animation: 'aiforge-float 4s ease-in-out infinite' }}>
        <rect x="42" y="72" width="68" height="46" rx="5" fill="#FFFFFF" stroke="#0E5C4A" strokeWidth="1.25" />
        <circle cx="56" cy="95" r="7" fill="#0E5C4A" />
        <text x="68" y="92" fontFamily="JetBrains Mono, monospace" fontSize="7" fill="#0E1116">SKILL</text>
        <line x1="68" y1="98" x2="100" y2="98" stroke="#B7BAC0" strokeWidth="0.5" />
        <line x1="68" y1="104" x2="92" y2="104" stroke="#B7BAC0" strokeWidth="0.5" />
      </g>
      <g style={{ animation: 'aiforge-float 4s ease-in-out 1.3s infinite' }}>
        <rect x="126" y="50" width="68" height="46" rx="5" fill="#FFFFFF" stroke="#1F3F6F" strokeWidth="1.25" />
        <rect x="134" y="64" width="18" height="18" rx="2" transform="rotate(45 143 73)" fill="#1F3F6F" />
        <text x="156" y="70" fontFamily="JetBrains Mono, monospace" fontSize="7" fill="#0E1116">MCP</text>
        <line x1="156" y1="76" x2="186" y2="76" stroke="#B7BAC0" strokeWidth="0.5" />
        <line x1="156" y1="82" x2="178" y2="82" stroke="#B7BAC0" strokeWidth="0.5" />
      </g>
      <g style={{ animation: 'aiforge-float 4s ease-in-out 2.6s infinite' }}>
        <rect x="210" y="72" width="68" height="46" rx="5" fill="#FFFFFF" stroke="#A26F1E" strokeWidth="1.25" />
        <rect x="220" y="88" width="22" height="12" rx="6" stroke="#A26F1E" strokeWidth="1.25" fill="none" />
        <text x="248" y="92" fontFamily="JetBrains Mono, monospace" fontSize="7" fill="#0E1116">PLUGIN</text>
        <line x1="220" y1="106" x2="270" y2="106" stroke="#B7BAC0" strokeWidth="0.5" />
      </g>
      <path d="M76 118 Q120 160 152 200" stroke="#0E5C4A" strokeWidth="0.75" fill="none" strokeDasharray="3 3" opacity="0.5" />
      <path d="M160 96 Q160 148 160 200" stroke="#0E5C4A" strokeWidth="0.75" fill="none" strokeDasharray="3 3" opacity="0.5" />
      <path d="M244 118 Q200 160 168 200" stroke="#0E5C4A" strokeWidth="0.75" fill="none" strokeDasharray="3 3" opacity="0.5" />
    </svg>
  );
}

// —— 3. 入库 4 步流水线 ——
export function VisualPipeline() {
  const stages = ['FETCH', 'PARSE', 'EMBED', 'WRITE'];
  return (
    <svg width="320" height="320" viewBox="0 0 320 320" fill="none" aria-hidden>
      <rect x="28" y="44" width="264" height="80" rx="6" fill="#0E1116" />
      <g fill="#3FC79A">
        <circle cx="42" cy="58" r="2.5" />
        <circle cx="50" cy="58" r="2.5" opacity="0.6" />
        <circle cx="58" cy="58" r="2.5" opacity="0.3" />
      </g>
      <text x="42" y="92" fontFamily="JetBrains Mono, monospace" fontSize="11" fill="#FCFBF8">
        <tspan fill="#3FC79A">$</tspan> aiforge ingest \
      </text>
      <text x="42" y="110" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#9DC8BB">
        https://github.com/obra/superpowers-skills
        <animate attributeName="opacity" values="0.6;1;0.6" dur="1.4s" repeatCount="indefinite" />
      </text>
      <path d="M160 130 L160 156" stroke="#0E1116" strokeWidth="1" />
      <path d="M156 152 L160 158 L164 152" stroke="#0E1116" strokeWidth="1" fill="none" />
      <g transform="translate(28 174)">
        {stages.map((s, i) => (
          <g key={s} transform={`translate(${i * 66} 0)`}>
            <rect width="58" height="36" rx="4" stroke="#0E1116" strokeWidth="1.25" fill="#FFFFFF" />
            <text x="29" y="14" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="7" letterSpacing="1" fill="#0E1116">{s}</text>
            <circle cx="29" cy="24" r="3" fill="#0E5C4A">
              <animate attributeName="opacity" values="0;1;0" dur="2.4s" begin={`${i * 0.6}s`} repeatCount="indefinite" />
            </circle>
            {i < stages.length - 1 && (
              <line x1="58" y1="18" x2="66" y2="18" stroke="#0E1116" strokeWidth="1" markerEnd="url(#arr)" />
            )}
          </g>
        ))}
        <defs>
          <marker id="arr" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="4" markerHeight="4">
            <path d="M0 0 L8 4 L0 8 Z" fill="#0E1116" />
          </marker>
        </defs>
      </g>
      <g transform="translate(120 234)">
        <rect width="80" height="22" rx="11" fill="#0E5C4A" />
        <text x="40" y="15" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="9" letterSpacing="1.5" fill="#FCFBF8">DONE · 1.2s</text>
      </g>
    </svg>
  );
}

// —— 4. 100+ 点 → hook → top-3 注入 ——
export function VisualInjection() {
  const dots = [] as { x: number; y: number; key: string }[];
  const cols = 14;
  const rows = 8;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      dots.push({ x: 28 + c * 8, y: 86 + r * 10, key: `${r}-${c}` });
    }
  }
  const highlighted = new Set(['3-2', '5-7', '2-11']);
  return (
    <svg width="320" height="320" viewBox="0 0 320 320" fill="none" aria-hidden>
      <text x="76" y="68" fontFamily="JetBrains Mono, monospace" fontSize="9" letterSpacing="2" fill="#5F6470">
        所有 artifact (112 个)
      </text>
      {dots.map((d) => {
        const hi = highlighted.has(d.key);
        return (
          <circle key={d.key} cx={d.x} cy={d.y} r={hi ? 3 : 1.4} fill={hi ? '#0E5C4A' : '#B7BAC0'}>
            {hi && <animate attributeName="r" values="3;4;3" dur="1.8s" repeatCount="indefinite" />}
          </circle>
        );
      })}
      <g transform="translate(0 184)">
        <line x1="80" y1="0" x2="240" y2="0" stroke="#0E5C4A" strokeWidth="1.25" markerEnd="url(#arr2)" strokeDasharray="4 3" />
        <defs>
          <marker id="arr2" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="5" markerHeight="5">
            <path d="M0 0 L8 4 L0 8 Z" fill="#0E5C4A" />
          </marker>
        </defs>
        <rect x="116" y="-12" width="88" height="24" rx="4" fill="#FFFFFF" stroke="#0E5C4A" strokeWidth="1" />
        <text x="160" y="3" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="8" letterSpacing="1" fill="#0E5C4A">
          UserPromptSubmit
        </text>
      </g>
      <g transform="translate(80 216)">
        <text x="0" y="0" fontFamily="JetBrains Mono, monospace" fontSize="9" letterSpacing="2" fill="#5F6470">
          注入 top-3 到上下文
        </text>
        {[0, 1, 2].map((i) => (
          <g key={i} transform={`translate(${i * 56} 14)`}>
            <rect width="48" height="28" rx="4" fill="#FFFFFF" stroke="#0E5C4A" strokeWidth="1.25" />
            <circle cx="10" cy="14" r="3" fill="#0E5C4A" />
            <line x1="18" y1="11" x2="40" y2="11" stroke="#B7BAC0" strokeWidth="0.5" />
            <line x1="18" y1="17" x2="36" y2="17" stroke="#B7BAC0" strokeWidth="0.5" />
            <animate attributeName="opacity" values="0;1;1" dur="0.6s" begin={`${0.4 + i * 0.2}s`} fill="freeze" />
          </g>
        ))}
      </g>
    </svg>
  );
}

// —— 5. 分岔路口：4 个去向 ——
export function VisualOutro() {
  return (
    <svg width="320" height="320" viewBox="0 0 320 320" fill="none" aria-hidden>
      <circle cx="160" cy="160" r="14" fill="#0E5C4A" />
      <circle cx="160" cy="160" r="22" stroke="#0E5C4A" strokeWidth="1" fill="none" opacity="0.4">
        <animate attributeName="r" values="22;30;22" dur="3s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.5;0.1;0.5" dur="3s" repeatCount="indefinite" />
      </circle>
      <text x="160" y="164" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="8" fill="#FCFBF8">YOU</text>
      {[
        { x: 60, y: 60, label: 'INGEST' },
        { x: 260, y: 60, label: 'PLAY' },
        { x: 60, y: 260, label: 'HOME' },
        { x: 260, y: 260, label: 'DOCS' },
      ].map((p, i) => (
        <g key={p.label}>
          <line x1="160" y1="160" x2={p.x} y2={p.y} stroke="#0E1116" strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />
          <circle cx={p.x} cy={p.y} r="22" fill="#FFFFFF" stroke="#0E5C4A" strokeWidth="1.25">
            <animate attributeName="r" values="22;24;22" dur={`${2.4 + i * 0.3}s`} begin={`${i * 0.4}s`} repeatCount="indefinite" />
          </circle>
          <text x={p.x} y={p.y + 3} textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="8" letterSpacing="1.5" fill="#0E5C4A">
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
