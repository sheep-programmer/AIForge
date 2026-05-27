'use client';

// 3-pane mini clock：UTC / 本地 / 服务器 uptime。
// 客户端用 setInterval(1s) 更新，避免 SSR mismatch（首屏返回占位）。

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

function fmtUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}d ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function fmtTime(d: Date, tz: 'UTC' | 'local'): string {
  const opts: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: tz === 'UTC' ? 'UTC' : undefined,
  };
  return new Intl.DateTimeFormat('en-GB', opts).format(d);
}

function fmtDate(d: Date, tz: 'UTC' | 'local'): string {
  const opts: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: '2-digit',
    weekday: 'short',
    timeZone: tz === 'UTC' ? 'UTC' : undefined,
  };
  return new Intl.DateTimeFormat('en-GB', opts).format(d);
}

export function WorldClock({ uptimeSeconds }: { uptimeSeconds: number }) {
  const [now, setNow] = useState<Date | null>(null);
  const [uptime, setUptime] = useState(uptimeSeconds);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => {
      setNow(new Date());
      setUptime((s) => s + 1);
    }, 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="grid grid-cols-3 gap-3">
      <Pane
        label="UTC"
        time={now ? fmtTime(now, 'UTC') : '--:--:--'}
        sub={now ? fmtDate(now, 'UTC') : '——'}
      />
      <Pane
        label="LOCAL"
        time={now ? fmtTime(now, 'local') : '--:--:--'}
        sub={now ? fmtDate(now, 'local') : '——'}
      />
      <Pane
        label="UPTIME"
        time={fmtUptime(uptime)}
        sub="server"
        accent
      />
    </div>
  );
}

function Pane({
  label,
  time,
  sub,
  accent,
}: {
  label: string;
  time: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <div className="flex items-center justify-between">
        <span className="label !text-[0.55rem]">{label}</span>
        <Clock className={`w-3 h-3 ${accent ? 'text-oxide-500' : 'text-ink-300'}`} />
      </div>
      <div
        className={`font-mono tabular-nums text-base leading-none truncate ${
          accent ? 'text-oxide-600' : 'text-ink-800'
        }`}
      >
        {time}
      </div>
      <div className="text-2xs text-ink-400 font-mono truncate">{sub}</div>
    </div>
  );
}
