// 用三个几何符号表达 skill / mcp / plugin 三类 artifact 的组合体。
// 这是 AIForge 的标志性视觉元素，避免任何 stock SVG。

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className="relative shrink-0"
    >
      <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
        <defs>
          <linearGradient id="logo-stroke" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0E5C4A" />
            <stop offset="1" stopColor="#3FC79A" />
          </linearGradient>
          <linearGradient id="logo-fill" x1="6" y1="6" x2="30" y2="30">
            <stop stopColor="#FCFBF8" />
            <stop offset="1" stopColor="#F2F0EA" />
          </linearGradient>
        </defs>
        <rect x="1" y="1" width="34" height="34" rx="8" stroke="url(#logo-stroke)" strokeWidth="1.5" fill="url(#logo-fill)" />
        {/* skill: circle */}
        <circle cx="11" cy="13" r="3.2" fill="#0E5C4A" />
        {/* mcp: diamond */}
        <rect x="22.5" y="9.5" width="7" height="7" rx="1.2" transform="rotate(45 26 13)" fill="#1F3F6F" />
        {/* plugin: pill */}
        <rect x="10" y="22" width="16" height="5.5" rx="2.75" fill="none" stroke="#A26F1E" strokeWidth="1.5" />
        {/* connector dots */}
        <circle cx="11" cy="13" r="0.9" fill="#FCFBF8" />
        <circle cx="26" cy="13" r="0.9" fill="#FCFBF8" />
      </svg>
      {/* faint live indicator */}
      <span className="absolute top-0 right-0 w-1.5 h-1.5 rounded-full bg-moss-500 animate-pulse-dot" />
    </span>
  );
}
