// 一个极简的 stacked bar，显示 skill / mcp / plugin 的比例。
// 数据极少时 (< 5)，给最小宽度避免空 bar 看上去坏。

interface Counts {
  skill: number;
  mcp: number;
  plugin: number;
}

export function TypeMix({ counts }: { counts: Counts }) {
  const total = counts.skill + counts.mcp + counts.plugin || 1;
  const pct = (n: number) => Math.max(2, Math.round((n / total) * 100));

  return (
    <div className="mt-3">
      <div className="h-1.5 flex rounded-full overflow-hidden bg-ink-100/60">
        <div
          className="bg-oxide-500"
          style={{ width: `${pct(counts.skill)}%` }}
          aria-label={`skill ${counts.skill}`}
        />
        <div
          className="bg-navy-500"
          style={{ width: `${pct(counts.mcp)}%` }}
          aria-label={`mcp ${counts.mcp}`}
        />
        <div
          className="bg-amber-500"
          style={{ width: `${pct(counts.plugin)}%` }}
          aria-label={`plugin ${counts.plugin}`}
        />
      </div>
      <div className="flex items-center gap-3 mt-2.5">
        <Legend label="skill" count={counts.skill} dot="bg-oxide-500" />
        <Legend label="mcp" count={counts.mcp} dot="bg-navy-500" />
        <Legend label="plugin" count={counts.plugin} dot="bg-amber-500" />
      </div>
    </div>
  );
}

function Legend({ label, count, dot }: { label: string; count: number; dot: string }) {
  return (
    <div className="flex items-center gap-1.5 text-2xs">
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      <span className="text-ink-400 uppercase tracking-wider font-mono">{label}</span>
      <span className="text-ink-700 num">{count}</span>
    </div>
  );
}
