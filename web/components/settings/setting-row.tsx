'use client';

// 一行 setting：左 label+hint / 中 control / 右 status
// 多个 SettingRow 堆叠在一个 Surface 内，行间靠 hairline 分隔
// 同时托管这个领域常用的小原子：Segmented / Toggle / ReadonlyPill / KV
// + 公用 useLocalStorage hook，避免设置页过长

import * as React from 'react';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HelpTip } from '@/components/ui/help-tip';

export type SettingStatus = 'idle' | 'saving' | 'saved' | 'error';

interface SettingRowProps {
  /** 左侧标题 */
  label: string;
  /** 标题下方一句话提示 */
  hint?: React.ReactNode;
  /** 鼠标悬停的更长解释（HelpTip 内容） */
  help?: React.ReactNode;
  /** 右侧实际控件 */
  children: React.ReactNode;
  /** 行右侧状态（已保存 / 保存中 / …） */
  status?: SettingStatus;
  /** 是否是这个 Surface 内的最后一行（去掉底部 border） */
  last?: boolean;
  /** 危险样式：左侧 label 红色 */
  destructive?: boolean;
  className?: string;
}

export function SettingRow({
  label,
  hint,
  help,
  children,
  status = 'idle',
  last = false,
  destructive = false,
  className,
}: SettingRowProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-12 gap-4 items-start py-4',
        !last && 'border-b hairline border-b-ink-100/60',
        className
      )}
    >
      {/* label + hint */}
      <div className="col-span-12 md:col-span-4">
        <div className="flex items-center gap-1.5">
          <label
            className={cn(
              'text-sm font-medium',
              destructive ? 'text-ember-500' : 'text-ink-800'
            )}
          >
            {label}
          </label>
          {help && <HelpTip inline>{help}</HelpTip>}
        </div>
        {hint && (
          <p className="text-2xs text-ink-400 leading-relaxed mt-1 max-w-sm">{hint}</p>
        )}
      </div>

      {/* control */}
      <div className="col-span-12 md:col-span-6 min-w-0">{children}</div>

      {/* status */}
      <div className="col-span-12 md:col-span-2 flex md:justify-end items-center pt-1.5">
        <StatusBadge status={status} />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: SettingStatus }) {
  if (status === 'idle') return null;
  if (status === 'saving') {
    return (
      <span className="inline-flex items-center gap-1.5 text-2xs text-ink-400 font-mono">
        <Loader2 className="w-3 h-3 animate-spin" />
        正在保存…
      </span>
    );
  }
  if (status === 'saved') {
    return (
      <span className="inline-flex items-center gap-1.5 text-2xs text-oxide-600 font-mono">
        <Check className="w-3 h-3" />
        已保存
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-2xs text-ember-500 font-mono">
      错误
    </span>
  );
}

/** 三选一分段按钮：[Auto | Light | Dark] 之类 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string; disabled?: boolean; hint?: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      className={cn(
        'inline-flex items-center rounded-md border border-ink-100 bg-parchment-100/60 p-0.5',
        className
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="radio"
            aria-checked={active}
            type="button"
            disabled={opt.disabled}
            title={opt.hint}
            onClick={() => onChange(opt.value)}
            className={cn(
              'inline-flex items-center justify-center h-7 px-3 rounded text-xs transition focus-ring',
              active
                ? 'bg-ink-800 text-parchment-50 shadow-elevate'
                : 'text-ink-500 hover:text-ink-800 hover:bg-card',
              opt.disabled && 'opacity-40 cursor-not-allowed'
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** 极简 switch（不依赖 radix-switch，避免新依赖） */
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-ring',
        checked ? 'bg-oxide-500' : 'bg-ink-200',
        disabled && 'opacity-40 cursor-not-allowed'
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-card shadow-elevate transition-transform',
          checked ? 'translate-x-[18px]' : 'translate-x-0.5'
        )}
      />
    </button>
  );
}

/** 只读状态药丸：health 上同步过来的服务端值，染色三态 (unknown/ok/warn) */
export function ReadonlyPill({
  children,
  ok,
}: {
  children: React.ReactNode;
  ok?: boolean;
}) {
  const tone =
    ok === undefined
      ? 'text-ink-500 bg-ink-100/60'
      : ok
        ? 'text-oxide-600 bg-oxide-100'
        : 'text-amber-500 bg-amber-100';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 h-7 px-2 rounded-md font-mono text-2xs',
        tone
      )}
    >
      {ok && <Check className="w-3 h-3" />}
      {children}
    </span>
  );
}

/** key/value pair：health 卡片里横向陈列服务端字段 */
export function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="label !mb-0 !text-[0.625rem]">{k}</span>
      <span className="text-sm text-ink-800 font-mono truncate">{v}</span>
    </div>
  );
}

/** SSR-safe useLocalStorage：读取动作放在 mount 后，避免 hydration mismatch。
 *  写入时把状态置为 saving → saved → idle，让 SettingRow 右侧的徽章自动转。 */
export function useLocalStorageString<T extends string = string>(
  key: string,
  initial: T,
  parse: (raw: string) => T = (s) => s as T
): [T, (v: T) => void, SettingStatus] {
  const [value, setValue] = React.useState<T>(initial);
  const [status, setStatus] = React.useState<SettingStatus>('idle');
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    const raw = typeof window === 'undefined' ? null : window.localStorage.getItem(key);
    if (raw !== null) setValue(parse(raw));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = React.useCallback(
    (v: T) => {
      setValue(v);
      if (typeof window === 'undefined') return;
      setStatus('saving');
      try {
        window.localStorage.setItem(key, String(v));
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          setStatus('saved');
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setStatus('idle'), 1500);
        }, 180);
      } catch {
        setStatus('error');
      }
    },
    [key]
  );

  return [value, update, status];
}

/** 把秒数转成 4d 3h / 12m / 30s。settings 页 health 卡片里用。 */
export function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h`;
}
