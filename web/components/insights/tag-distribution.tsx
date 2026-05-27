'use client';

// 横向 stacked bar：每行一个 tag，按 skill / mcp / plugin 拆分。
// 按总量降序排列。

interface TagRow {
  tag: string;
  skill: number;
  mcp: number;
  plugin: number;
}

export function TagDistribution({ rows }: { rows: TagRow[] }) {
  const enriched = rows
    .map((r) => ({ ...r, total: r.skill + r.mcp + r.plugin }))
    .sort((a, b) => b.total - a.total);
  const max = enriched[0]?.total ?? 1;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-12 gap-2 text-2xs text-ink-300 font-mono uppercase tracking-wider px-1 mb-1">
        <span className="col-span-4">tag</span>
        <span className="col-span-7">分布</span>
        <span className="col-span-1 text-right">合计</span>
      </div>

      {enriched.map((r) => {
        const sw = (n: number) => (r.total ? (n / max) * 100 : 0);
        return (
          <div key={r.tag} className="grid grid-cols-12 gap-2 items-center group">
            <div className="col-span-4 flex items-center gap-1.5 min-w-0">
              <span className="w-1 h-1 rounded-full bg-ink-300 group-hover:bg-oxide-500" />
              <span className="text-2xs font-mono text-ink-700 truncate">{r.tag}</span>
            </div>
            <div className="col-span-7 h-3 flex rounded-sm overflow-hidden bg-parchment-200/70 border border-ink-100/40">
              <div
                className="bg-oxide-500"
                style={{ width: `${sw(r.skill)}%` }}
                aria-label={`skill ${r.skill}`}
                title={`skill ${r.skill}`}
              />
              <div
                className="bg-navy-500"
                style={{ width: `${sw(r.mcp)}%` }}
                aria-label={`mcp ${r.mcp}`}
                title={`mcp ${r.mcp}`}
              />
              <div
                className="bg-amber-500"
                style={{ width: `${sw(r.plugin)}%` }}
                aria-label={`plugin ${r.plugin}`}
                title={`plugin ${r.plugin}`}
              />
            </div>
            <div className="col-span-1 text-right font-mono text-2xs text-ink-700 tabular-nums">
              {r.total}
            </div>
          </div>
        );
      })}

      <div className="flex items-center gap-4 pt-3 mt-2 border-t border-ink-100/60">
        <Legend label="skill" dot="bg-oxide-500" />
        <Legend label="mcp" dot="bg-navy-500" />
        <Legend label="plugin" dot="bg-amber-500" />
      </div>
    </div>
  );
}

function Legend({ label, dot }: { label: string; dot: string }) {
  return (
    <div className="flex items-center gap-1.5 text-2xs">
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      <span className="text-ink-400 uppercase tracking-wider font-mono">{label}</span>
    </div>
  );
}
