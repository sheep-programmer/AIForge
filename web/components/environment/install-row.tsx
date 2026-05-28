'use client';

// 单条已装记录：mcp / plugin / skill 通用行。
// 左侧类型徽章 + 名称，右侧按类型展示不同的细节（transport / marketplace / path）。

import * as React from 'react';
import { Lock } from 'lucide-react';
import type {
  ArtifactType,
  InstalledMcp,
  InstalledPlugin,
  InstalledSkill,
} from '@/lib/api-types';
import { ArtifactTypeBadge } from '@/components/ui/badge';
import { HelpTip } from '@/components/ui/help-tip';

type InstallRowProps =
  | { type: 'mcp'; item: InstalledMcp }
  | { type: 'plugin'; item: InstalledPlugin }
  | { type: 'skill'; item: InstalledSkill };

export function InstallRow(props: InstallRowProps) {
  const artifactType: ArtifactType = props.type;
  return (
    <li className="cell-row last:border-b-0">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <ArtifactTypeBadge type={artifactType} withLabel={false} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm text-ink-800 font-medium truncate">
              {props.item.name}
            </span>
            {props.type === 'mcp' && props.item.env_keys.length > 0 && (
              <span className="inline-flex items-center gap-1 text-2xs text-amber-500 font-mono shrink-0">
                <Lock className="w-3 h-3" />
                {props.item.env_keys.length} 个密钥
                <HelpTip inline>
                  env 值已脱敏，只显示 key 名：
                  <span className="font-mono">
                    {' '}
                    {props.item.env_keys.join(', ')}
                  </span>
                </HelpTip>
              </span>
            )}
          </div>
          <Detail {...props} />
        </div>
      </div>
    </li>
  );
}

function Detail(props: InstallRowProps) {
  if (props.type === 'mcp') {
    const { transport, command, args, url } = props.item;
    const invocation =
      url ?? [command, ...args].filter(Boolean).join(' ') ?? '';
    return (
      <div className="mt-0.5 flex items-center gap-2 text-2xs text-ink-400 font-mono min-w-0">
        <span className="uppercase tracking-wider text-navy-500 shrink-0">
          {transport}
        </span>
        <span className="text-ink-200">·</span>
        <span className="truncate">{invocation || '—'}</span>
      </div>
    );
  }
  if (props.type === 'plugin') {
    const { marketplace, version, scope } = props.item;
    return (
      <div className="mt-0.5 flex items-center gap-2 text-2xs text-ink-400 font-mono min-w-0">
        <span className="truncate text-amber-500">{marketplace ?? '本地'}</span>
        {version && (
          <>
            <span className="text-ink-200">·</span>
            <span className="num">v{version}</span>
          </>
        )}
        {scope && (
          <>
            <span className="text-ink-200">·</span>
            <span className="uppercase tracking-wider">{scope}</span>
          </>
        )}
      </div>
    );
  }
  return (
    <div className="mt-0.5 text-2xs text-ink-400 font-mono truncate">
      {props.item.path}
    </div>
  );
}
