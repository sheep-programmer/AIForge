'use client';

import { Search, Command, ExternalLink, BookOpen } from 'lucide-react';
import useSWR from 'swr';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetcher } from '@/lib/api-client';
import type { HealthResponse } from '@/lib/api-types';
import { MOCK_HEALTH } from '@/lib/mock-data';
import { cn } from '@/lib/utils';
import { BreadcrumbBar } from './breadcrumb';

export function Topbar() {
  const { data: rawHealth } = useSWR<HealthResponse>('/v1/health', fetcher, {
    refreshInterval: 12_000,
    revalidateOnFocus: false,
    onError: () => {},
  });
  const health = rawHealth ?? MOCK_HEALTH;
  const mock = !rawHealth;

  // ⌘K 快捷键
  const [showCmd, setShowCmd] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCmd((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <header className="sticky top-0 z-20 backdrop-blur-md bg-parchment-100/80 border-b border-ink-100/60">
      <div className="flex items-center gap-6 px-6 lg:px-10 h-14">
        {/* breadcrumb 占 1fr */}
        <div className="flex-1 min-w-0">
          <BreadcrumbBar />
        </div>

        {/* command search */}
        <button
          onClick={() => setShowCmd(true)}
          className={cn(
            'hidden md:flex items-center gap-2 h-9 px-3 rounded-md',
            'bg-card hover:bg-parchment-200 transition',
            'border border-ink-100/80 text-ink-400 text-sm w-[280px]'
          )}
        >
          <Search className="w-4 h-4" />
          <span className="flex-1 text-left">搜索 artifact / 标签 / 仓库…</span>
          <kbd className="font-mono text-2xs px-1.5 py-0.5 rounded bg-ink-100 text-ink-400 inline-flex items-center gap-0.5">
            <Command className="w-2.5 h-2.5" />K
          </kbd>
        </button>

        {/* health pill */}
        <HealthPill health={health} mock={mock} />

        {/* docs link */}
        <Link
          href="https://github.com/aiforge/aiforge"
          target="_blank"
          className="hidden lg:inline-flex items-center gap-1.5 text-sm text-ink-400 hover:text-ink-800 transition"
        >
          <BookOpen className="w-4 h-4" />
          文档
          <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      {showCmd && <CommandPalette onClose={() => setShowCmd(false)} />}
    </header>
  );
}

function HealthPill({ health, mock }: { health: HealthResponse; mock: boolean }) {
  const tone =
    mock
      ? { label: 'DEMO', dot: 'bg-amber-500', shadow: 'shadow-[0_0_0_4px_rgba(162,111,30,0.18)]' }
      : health.status === 'ok'
      ? { label: 'HEALTHY', dot: 'bg-oxide-500', shadow: 'shadow-[0_0_0_4px_rgba(63,199,154,0.18)]' }
      : health.status === 'degraded'
      ? { label: 'DEGRADED', dot: 'bg-amber-500', shadow: 'shadow-[0_0_0_4px_rgba(162,111,30,0.18)]' }
      : { label: 'DOWN', dot: 'bg-ember-500', shadow: 'shadow-[0_0_0_4px_rgba(155,43,34,0.18)]' };

  return (
    <div className="hidden sm:flex items-center gap-3 px-3 h-9 rounded-md bg-card border border-ink-100/80">
      <span
        className={cn(
          'inline-block w-1.5 h-1.5 rounded-full animate-pulse-dot',
          tone.dot,
          tone.shadow
        )}
      />
      <div className="flex items-center gap-2.5 text-2xs">
        <span className="label !text-2xs">{tone.label}</span>
        <span className="text-ink-300">·</span>
        <span className="num text-ink-500">
          {health.skills_count.toLocaleString()} artifacts
        </span>
        <span className="text-ink-300">·</span>
        <span className="num text-ink-500">
          {health.reranker_available ? 'reranker' : 'embed-only'}
        </span>
      </div>
    </div>
  );
}

function CommandPalette({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[14vh] bg-ink-900/40 backdrop-blur-sm animate-fade-up"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="surface-strong w-[640px] max-w-[92vw] overflow-hidden"
      >
        <div className="flex items-center gap-3 px-4 h-14 border-b border-ink-100/60">
          <Search className="w-4 h-4 text-ink-300" />
          <input
            autoFocus
            placeholder="搜索 artifact、跳转页面、执行命令…"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-ink-300"
          />
          <kbd className="font-mono text-2xs px-1.5 py-0.5 rounded bg-ink-100 text-ink-400">
            ESC
          </kbd>
        </div>
        <div className="px-3 py-3 space-y-1 max-h-[60vh] overflow-y-auto">
          {[
            { label: '总览', href: '/' },
            { label: '浏览 Artifacts', href: '/artifacts' },
            { label: '标签管理', href: '/tags' },
            { label: '触发自动打标', href: '/autotag' },
            { label: '入库 GitHub 仓库', href: '/ingest' },
            { label: 'Playground', href: '/playground' },
            { label: '审批队列', href: '/discovery' },
            { label: '设置', href: '/settings' },
          ].map((row) => (
            <Link
              key={row.href}
              href={row.href}
              onClick={onClose}
              className="block px-3 py-2 rounded-md text-sm hover:bg-parchment-200 text-ink-700"
            >
              <span className="font-medium">{row.label}</span>
              <span className="font-mono text-2xs text-ink-300 ml-3">{row.href}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
