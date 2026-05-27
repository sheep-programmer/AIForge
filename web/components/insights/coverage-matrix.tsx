'use client';

// artifact_type × tag 覆盖矩阵：行 = skill/mcp/plugin，列 = tag。
// 单元格背景按 oxide-intensity，数字标在单元格中。
// 首列 sticky，长 tag 列名旋转 45°。

import type { ArtifactType } from '@/lib/api-types';

interface Props {
  rowTypes: ArtifactType[];
  tags: string[];
  matrix: number[][]; // [rowIndex][colIndex]
}

const TYPE_META: Record<ArtifactType, { label: string; dotClass: string }> = {
  skill: { label: 'SKILL', dotClass: 'bg-oxide-500' },
  mcp: { label: 'MCP', dotClass: 'bg-navy-500' },
  plugin: { label: 'PLUGIN', dotClass: 'bg-amber-500' },
};

function cellColor(v: number, max: number): { bg: string; text: string } {
  if (max <= 0 || v === 0) return { bg: 'transparent', text: 'rgba(14,17,22,0.25)' };
  const r = v / max;
  if (r < 0.2) return { bg: 'rgba(14,92,74,0.10)', text: 'rgba(14,17,22,0.7)' };
  if (r < 0.4) return { bg: 'rgba(14,92,74,0.22)', text: 'rgba(14,17,22,0.85)' };
  if (r < 0.65) return { bg: 'rgba(14,92,74,0.42)', text: '#FCFBF8' };
  if (r < 0.85) return { bg: 'rgba(14,92,74,0.68)', text: '#FCFBF8' };
  return { bg: 'rgba(14,92,74,0.92)', text: '#FCFBF8' };
}

export function CoverageMatrix({ rowTypes, tags, matrix }: Props) {
  const max = Math.max(0, ...matrix.flat());
  const colTotals = tags.map((_, c) => matrix.reduce((s, row) => s + (row[c] ?? 0), 0));
  const rowTotals = matrix.map((row) => row.reduce((s, v) => s + v, 0));

  return (
    <div className="relative">
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-[2px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-card pr-3 text-left">
                <span className="label !text-[0.55rem]">类型 \ 标签</span>
              </th>
              {tags.map((t) => (
                <th key={t} className="px-0.5 align-bottom h-20 min-w-[24px]">
                  <div className="origin-bottom-left rotate-[-45deg] translate-y-1 translate-x-3 whitespace-nowrap text-2xs text-ink-500 font-mono">
                    {t}
                  </div>
                </th>
              ))}
              <th className="pl-3 pr-1 text-2xs text-ink-300 font-mono uppercase tracking-wider align-bottom pb-2">
                合计
              </th>
            </tr>
          </thead>
          <tbody>
            {rowTypes.map((type, r) => (
              <tr key={type}>
                <td className="sticky left-0 z-10 bg-card pr-3 py-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${TYPE_META[type].dotClass}`} />
                    <span className="font-mono text-2xs uppercase tracking-wider text-ink-700">
                      {TYPE_META[type].label}
                    </span>
                  </div>
                </td>
                {tags.map((_, c) => {
                  const v = matrix[r]?.[c] ?? 0;
                  const { bg, text } = cellColor(v, max);
                  return (
                    <td
                      key={c}
                      className="text-center align-middle border border-ink-100/40 rounded-[2px] font-mono text-2xs tabular-nums h-7 min-w-[24px]"
                      style={{ background: bg, color: text }}
                      title={`${type} · ${tags[c]} = ${v}`}
                    >
                      {v || ''}
                    </td>
                  );
                })}
                <td className="pl-3 pr-1 text-right font-mono text-2xs text-ink-700 tabular-nums">
                  {rowTotals[r]}
                </td>
              </tr>
            ))}
            <tr>
              <td className="sticky left-0 z-10 bg-card pr-3 pt-2">
                <span className="text-2xs text-ink-300 font-mono uppercase tracking-wider">
                  合计
                </span>
              </td>
              {colTotals.map((v, c) => (
                <td
                  key={c}
                  className="text-center font-mono text-2xs text-ink-400 tabular-nums pt-2"
                >
                  {v}
                </td>
              ))}
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-1.5 mt-3 text-2xs text-ink-400 font-mono uppercase tracking-wider">
        <span>稀疏</span>
        {[0.1, 0.22, 0.42, 0.68, 0.92].map((a) => (
          <span
            key={a}
            className="inline-block w-4 h-3 rounded-[2px] border border-ink-100/50"
            style={{ background: `rgba(14,92,74,${a})` }}
          />
        ))}
        <span>密集</span>
      </div>
    </div>
  );
}
