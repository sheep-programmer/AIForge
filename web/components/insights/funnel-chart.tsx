'use client';

// 推荐管线 funnel：每个阶段一行横向 bar，宽度按计数缩放。
// 旁边显示数字与上一阶段的 drop-off 百分比。

interface FunnelStage {
  stage: string;
  label: string;
  count: number;
  hint: string;
}

export function FunnelChart({ stages }: { stages: FunnelStage[] }) {
  // 用第二阶段（向量召回）作为最大基准，第一阶段（embed=1）只是入口标识。
  const baseCount = Math.max(...stages.map((s) => s.count));

  return (
    <div className="space-y-2.5">
      {stages.map((s, i) => {
        const prev = i > 0 ? stages[i - 1].count : null;
        const drop = prev && prev > 0 ? Math.round((1 - s.count / prev) * 100) : null;
        const width = baseCount > 0 ? Math.max(4, (s.count / baseCount) * 100) : 0;

        return (
          <div key={s.stage} className="group">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[0.6rem] text-ink-300 tabular-nums w-4">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="text-2xs text-ink-700 font-medium">{s.label}</span>
              </div>
              <div className="flex items-center gap-2 font-mono text-2xs tabular-nums">
                <span className="text-ink-800">{s.count}</span>
                {drop !== null && (
                  <span
                    className={`text-[0.6rem] px-1 py-px rounded-sm ${
                      drop > 0
                        ? 'bg-ember-100 text-ember-500'
                        : 'bg-ink-100 text-ink-400'
                    }`}
                  >
                    {drop > 0 ? `−${drop}%` : '0%'}
                  </span>
                )}
              </div>
            </div>
            <div className="relative h-6 bg-parchment-200/70 rounded overflow-hidden border border-ink-100/50">
              <div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-oxide-500 to-oxide-400 transition-all"
                style={{ width: `${width}%` }}
              />
              <div className="absolute inset-y-0 left-0 right-0 flex items-center px-2">
                <span className="text-[0.55rem] text-parchment-50 font-mono uppercase tracking-wider mix-blend-luminosity">
                  {s.hint}
                </span>
              </div>
            </div>
          </div>
        );
      })}

      {/* footer ratio */}
      <div className="pt-2 mt-2 border-t border-ink-100/60 flex items-center justify-between text-2xs">
        <span className="text-ink-400 font-mono uppercase tracking-wider">候选→精选</span>
        <span className="font-mono">
          <span className="text-ink-800 num">{stages[1]?.count ?? 0}</span>
          <span className="text-ink-300 mx-1">→</span>
          <span className="text-oxide-600 num">{stages[stages.length - 1]?.count ?? 0}</span>
          <span className="text-ink-400 ml-2">
            ={' '}
            {stages[1]?.count
              ? Math.round((1 - stages[stages.length - 1].count / stages[1].count) * 100)
              : 0}
            % 压缩
          </span>
        </span>
      </div>
    </div>
  );
}
