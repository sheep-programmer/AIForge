// 6 个空状态插画：parchment 底 / ink 描边 / oxide 单点强调。
// 全部 inline SVG，无外部资源；每个 240×180，含轻度 SMIL/CSS 动画。

import * as React from 'react';

// ——— 通用样式 ———
const STROKE = '#0E1116'; // ink-800
const STROKE_FAINT = '#B7BAC0'; // ink-200
const FILL_PARCH = '#FAFAF7'; // parchment-100
const OXIDE = '#0E5C4A'; // oxide-500
const OXIDE_GHOST = '#CDE3DC'; // oxide-100

function Frame({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <svg
      width="240"
      height="180"
      viewBox="0 0 240 180"
      role="img"
      aria-label={label}
      fill="none"
      className="select-none"
    >
      {/* 极淡网格底 */}
      <defs>
        <pattern id="grid-tiny" width="12" height="12" patternUnits="userSpaceOnUse">
          <path d="M12 0H0V12" stroke="#E2E4E8" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="240" height="180" rx="8" fill={FILL_PARCH} />
      <rect width="240" height="180" rx="8" fill="url(#grid-tiny)" opacity="0.35" />
      {children}
    </svg>
  );
}

// ——— 1. 无 artifact：空抽屉，3 个虚位 (skill 圆 / mcp 菱 / plugin 胶囊) ———
export function NoArtifactsIllustration() {
  return (
    <Frame label="尚未入库 artifact">
      {/* 外框抽屉 */}
      <rect
        x="36"
        y="40"
        width="168"
        height="108"
        rx="6"
        stroke={STROKE}
        strokeWidth="1.25"
      />
      <line x1="36" y1="74" x2="204" y2="74" stroke={STROKE_FAINT} strokeWidth="0.75" strokeDasharray="2 2" />
      <line x1="36" y1="108" x2="204" y2="108" stroke={STROKE_FAINT} strokeWidth="0.75" strokeDasharray="2 2" />
      {/* 抽屉把手 */}
      <rect x="108" y="34" width="24" height="3" rx="1.5" fill={STROKE} />
      {/* 三种 ghost artifact */}
      {/* skill = circle */}
      <g style={{ animation: 'aiforge-float 4.2s ease-in-out infinite' }}>
        <circle cx="68" cy="57" r="9" stroke={STROKE_FAINT} strokeWidth="1" strokeDasharray="2 2" fill="none" />
        <text x="68" y="60" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="6" fill={STROKE_FAINT}>SKL</text>
      </g>
      {/* mcp = diamond */}
      <g style={{ animation: 'aiforge-float 4.2s ease-in-out 1.4s infinite' }}>
        <rect x="111" y="48" width="18" height="18" rx="2" transform="rotate(45 120 57)" stroke={STROKE_FAINT} strokeWidth="1" strokeDasharray="2 2" fill="none" />
        <text x="120" y="60" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="6" fill={STROKE_FAINT}>MCP</text>
      </g>
      {/* plugin = pill */}
      <g style={{ animation: 'aiforge-float 4.2s ease-in-out 2.8s infinite' }}>
        <rect x="160" y="49" width="28" height="16" rx="8" stroke={STROKE_FAINT} strokeWidth="1" strokeDasharray="2 2" fill="none" />
        <text x="174" y="60" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="6" fill={STROKE_FAINT}>PLG</text>
      </g>
      {/* 下方两层空格 */}
      <line x1="60" y1="91" x2="180" y2="91" stroke={STROKE_FAINT} strokeWidth="0.5" strokeDasharray="1 3" />
      <line x1="60" y1="125" x2="180" y2="125" stroke={STROKE_FAINT} strokeWidth="0.5" strokeDasharray="1 3" />
      {/* 落地阴影 */}
      <ellipse cx="120" cy="160" rx="68" ry="4" fill={STROKE} opacity="0.06" />
      {/* 角标 oxide 一点缀 */}
      <circle cx="204" cy="40" r="3" fill={OXIDE}>
        <animate attributeName="r" values="3;4;3" dur="2.4s" repeatCount="indefinite" />
      </circle>
    </Frame>
  );
}

// ——— 2. 无 tag：断针脚的标签 + 抽象点阵 ———
export function NoTagsIllustration() {
  return (
    <Frame label="还没有标签">
      {/* 标签主体 */}
      <path
        d="M50 70 L140 70 L172 100 L140 130 L50 130 Z"
        stroke={STROKE}
        strokeWidth="1.25"
        fill="#FFFFFF"
      />
      {/* 穿孔 */}
      <circle cx="62" cy="100" r="4" stroke={STROKE} strokeWidth="1" fill={FILL_PARCH} />
      {/* 断线缝合 */}
      <path d="M78 88 L92 88 M100 88 L112 88 M120 88 L132 88" stroke={STROKE_FAINT} strokeWidth="1" strokeLinecap="round" />
      <path d="M78 100 L86 100 M96 100 L108 100 M118 100 L128 100" stroke={STROKE_FAINT} strokeWidth="1" strokeLinecap="round" />
      <path d="M78 112 L94 112 M104 112 L120 112" stroke={STROKE_FAINT} strokeWidth="1" strokeLinecap="round" />
      {/* 抽象点阵（盲文风） */}
      <g fill={STROKE_FAINT}>
        <circle cx="146" cy="92" r="1.4" />
        <circle cx="152" cy="92" r="1.4" />
        <circle cx="146" cy="100" r="1.4" />
        <circle cx="152" cy="108" r="1.4" />
      </g>
      {/* oxide 缝针 */}
      <g>
        <line x1="46" y1="64" x2="60" y2="78" stroke={OXIDE} strokeWidth="1.25" strokeLinecap="round" />
        <circle cx="46" cy="64" r="2" fill={OXIDE}>
          <animate attributeName="cy" values="64;60;64" dur="3s" repeatCount="indefinite" />
        </circle>
      </g>
      {/* 阴影 */}
      <ellipse cx="120" cy="148" rx="58" ry="3" fill={STROKE} opacity="0.06" />
    </Frame>
  );
}

// ——— 3. 无入库任务：纸质收件托盘 + GitHub 方块 ———
export function NoIngestJobsIllustration() {
  return (
    <Frame label="没有入库任务">
      {/* 托盘 */}
      <path
        d="M40 120 L72 100 L168 100 L200 120 L200 142 L40 142 Z"
        fill="#FFFFFF"
        stroke={STROKE}
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <line x1="40" y1="120" x2="200" y2="120" stroke={STROKE_FAINT} strokeWidth="0.75" />
      {/* 浮动的 git cube */}
      <g style={{ animation: 'aiforge-bob 3.6s ease-in-out infinite' }}>
        <rect x="100" y="44" width="40" height="40" rx="4" stroke={STROKE} strokeWidth="1.25" fill={FILL_PARCH} />
        {/* git 分支图标 */}
        <circle cx="112" cy="56" r="3" stroke={STROKE} strokeWidth="1" fill="#FFFFFF" />
        <circle cx="128" cy="72" r="3" stroke={STROKE} strokeWidth="1" fill="#FFFFFF" />
        <circle cx="128" cy="56" r="3" stroke={OXIDE} strokeWidth="1.25" fill="#FFFFFF" />
        <path d="M112 60 L112 72 L125 72" stroke={STROKE} strokeWidth="1" fill="none" />
        <path d="M128 60 L128 69" stroke={STROKE} strokeWidth="1" fill="none" />
      </g>
      {/* 投影 */}
      <ellipse cx="120" cy="92" rx="22" ry="2.5" fill={STROKE} opacity="0.1">
        <animate attributeName="rx" values="22;18;22" dur="3.6s" repeatCount="indefinite" />
      </ellipse>
      {/* 任务格虚线 */}
      <line x1="60" y1="130" x2="180" y2="130" stroke={STROKE_FAINT} strokeWidth="0.5" strokeDasharray="2 3" />
      <line x1="60" y1="136" x2="180" y2="136" stroke={STROKE_FAINT} strokeWidth="0.5" strokeDasharray="2 3" />
      {/* oxide 状态点 */}
      <circle cx="196" cy="98" r="2" fill={OXIDE}>
        <animate attributeName="opacity" values="0.4;1;0.4" dur="2s" repeatCount="indefinite" />
      </circle>
    </Frame>
  );
}

// ——— 4. 无 playground 结果：平直的频谱条 + ready 提示 ———
export function NoPlaygroundResultsIllustration() {
  const bars = [44, 56, 38, 64, 50, 70, 46, 60, 52, 42];
  return (
    <Frame label="尚无推荐结果">
      {/* 基线 */}
      <line x1="32" y1="130" x2="208" y2="130" stroke={STROKE} strokeWidth="1" />
      {/* 平直频谱（动画在静默呼吸） */}
      <g>
        {bars.map((_, i) => (
          <rect
            key={i}
            x={36 + i * 17}
            y={126}
            width="10"
            height="3"
            rx="1.5"
            fill={STROKE_FAINT}
          >
            <animate
              attributeName="height"
              values={`3;${4 + (i % 3)};3`}
              dur={`${2 + (i % 4) * 0.3}s`}
              repeatCount="indefinite"
            />
            <animate
              attributeName="y"
              values={`126;${125 - (i % 3)};126`}
              dur={`${2 + (i % 4) * 0.3}s`}
              repeatCount="indefinite"
            />
          </rect>
        ))}
      </g>
      {/* 中央提示 ring */}
      <g transform="translate(120 76)">
        <circle r="28" stroke={STROKE_FAINT} strokeWidth="1" strokeDasharray="3 3" fill="none">
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0"
            to="360"
            dur="14s"
            repeatCount="indefinite"
          />
        </circle>
        <circle r="6" fill={OXIDE_GHOST} stroke={OXIDE} strokeWidth="1.25" />
        <circle r="2" fill={OXIDE}>
          <animate attributeName="r" values="2;3;2" dur="1.6s" repeatCount="indefinite" />
        </circle>
      </g>
      {/* READY 标签 */}
      <text
        x="120"
        y="118"
        textAnchor="middle"
        fontFamily="JetBrains Mono, monospace"
        fontSize="7"
        letterSpacing="2"
        fill={STROKE}
      >
        READY · 等待 prompt
      </text>
    </Frame>
  );
}

// ——— 5. 无发现：卫星接收器，无回声 ———
export function NoDiscoveriesIllustration() {
  return (
    <Frame label="尚无发现">
      {/* 支架 */}
      <line x1="120" y1="148" x2="120" y2="118" stroke={STROKE} strokeWidth="1.25" />
      <line x1="106" y1="148" x2="134" y2="148" stroke={STROKE} strokeWidth="1.25" strokeLinecap="round" />
      {/* 接收盘 */}
      <path
        d="M86 96 Q120 60 154 96 Q120 110 86 96 Z"
        fill="#FFFFFF"
        stroke={STROKE}
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      {/* 馈源 */}
      <line x1="120" y1="96" x2="120" y2="80" stroke={STROKE} strokeWidth="1" />
      <circle cx="120" cy="78" r="2.5" fill={OXIDE} />
      {/* 信号扇形（无回声 — 衰减） */}
      {[0, 1, 2].map((i) => (
        <path
          key={i}
          d={`M120 70 m -${20 + i * 14} -${10 + i * 7} a ${20 + i * 14} ${20 + i * 14} 0 0 1 ${
            (20 + i * 14) * 2
          } 0`}
          stroke={OXIDE}
          strokeWidth="1"
          fill="none"
          strokeLinecap="round"
          opacity={0.5 - i * 0.15}
        >
          <animate
            attributeName="opacity"
            values={`0;${0.5 - i * 0.15};0`}
            dur="3.6s"
            begin={`${i * 0.6}s`}
            repeatCount="indefinite"
          />
        </path>
      ))}
      {/* 静默 0 标记 */}
      <text
        x="180"
        y="44"
        fontFamily="JetBrains Mono, monospace"
        fontSize="8"
        letterSpacing="1.5"
        fill={STROKE_FAINT}
      >
        SIGNAL · 0
      </text>
      {/* 阴影 */}
      <ellipse cx="120" cy="158" rx="34" ry="3" fill={STROKE} opacity="0.08" />
    </Frame>
  );
}

// ——— 6. 无通知：静默的铃，置于支架上 ———
export function NoNotificationsIllustration() {
  return (
    <Frame label="没有通知">
      {/* 支架 */}
      <line x1="78" y1="138" x2="162" y2="138" stroke={STROKE} strokeWidth="1.25" strokeLinecap="round" />
      <line x1="120" y1="138" x2="120" y2="58" stroke={STROKE} strokeWidth="0.75" strokeDasharray="2 2" />
      {/* 铃身 */}
      <g style={{ transformOrigin: '120px 58px', animation: 'aiforge-sway 6s ease-in-out infinite' }}>
        <path
          d="M120 60 Q92 64 92 100 L88 116 L152 116 L148 100 Q148 64 120 60 Z"
          fill="#FFFFFF"
          stroke={STROKE}
          strokeWidth="1.25"
          strokeLinejoin="round"
        />
        {/* 铃舌 */}
        <line x1="120" y1="116" x2="120" y2="126" stroke={STROKE} strokeWidth="1" />
        <circle cx="120" cy="128" r="3" fill={STROKE} />
        {/* 顶部环 */}
        <circle cx="120" cy="58" r="3" stroke={STROKE} strokeWidth="1" fill={FILL_PARCH} />
      </g>
      {/* 静音斜杠 */}
      <line x1="156" y1="76" x2="184" y2="100" stroke={OXIDE} strokeWidth="2" strokeLinecap="round">
        <animate attributeName="opacity" values="0.6;1;0.6" dur="3s" repeatCount="indefinite" />
      </line>
      <circle cx="170" cy="88" r="14" stroke={OXIDE} strokeWidth="1.25" fill="none" opacity="0.6" />
      {/* 阴影 */}
      <ellipse cx="120" cy="146" rx="40" ry="2.5" fill={STROKE} opacity="0.08" />
    </Frame>
  );
}

// 注入帧动画的样式（一次性，挂载在 illustration 卡片旁）
const EMPTY_ILLUSTRATION_CSS = `
@keyframes aiforge-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-2px); }
}
@keyframes aiforge-bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}
@keyframes aiforge-sway {
  0%, 100% { transform: rotate(-2deg); }
  50% { transform: rotate(2deg); }
}
`;

export function EmptyIllustrationStyles() {
  return (
    <style
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: EMPTY_ILLUSTRATION_CSS }}
    />
  );
}
