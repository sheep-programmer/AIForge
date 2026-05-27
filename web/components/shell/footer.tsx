'use client';

// 全局底部条：版本、git sha、系统脉冲、外链。位于 LIVE FEED ticker 之上。

import useSWR from 'swr';
import Link from 'next/link';
import {
  BookOpen,
  CircleCheck,
  CircleX,
  ExternalLink,
  FileCode2,
  Github,
  History,
} from 'lucide-react';
import { fetcher } from '@/lib/api-client';
import type { HealthResponse } from '@/lib/api-types';
import { MOCK_HEALTH } from '@/lib/mock-data';
import { fmtNumber } from '@/lib/utils';

const BUILD_VERSION = '0.2.0';
const GIT_SHA =
  (typeof process !== 'undefined' &&
    (process.env.NEXT_PUBLIC_GIT_SHA || process.env.NEXT_PUBLIC_BUILD_SHA)) ||
  'dev';

function fmtUptime(sec: number): string {
  const days = Math.floor(sec / 86_400);
  const hours = Math.floor((sec % 86_400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((sec % 3600) / 60);
  return `${hours}h ${mins}m`;
}

export function Footer() {
  const { data } = useSWR<HealthResponse>('/v1/health', fetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: false,
    onError: () => {},
  });
  const health = data ?? MOCK_HEALTH;
  const isLive = !!data;

  return (
    <footer className="mt-12 mb-12 border-t border-ink-100/80 bg-parchment-100/70 backdrop-blur-sm">
      <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-3 grid grid-cols-1 lg:grid-cols-3 gap-3 lg:gap-6 items-center">
        {/* 左: 版本信息 */}
        <div className="flex items-center gap-2 text-2xs font-mono text-ink-400">
          <span className="text-ink-800 font-semibold tracking-wide">AIForge</span>
          <span className="text-ink-200">·</span>
          <span>v{BUILD_VERSION}</span>
          <span className="text-ink-200">·</span>
          <span>
            build <span className="text-ink-700">{GIT_SHA.slice(0, 7)}</span>
          </span>
          {!isLive && (
            <>
              <span className="text-ink-200">·</span>
              <span className="text-amber-500 uppercase tracking-ultra">demo</span>
            </>
          )}
        </div>

        {/* 中: 6 个内联仪表 */}
        <div className="flex flex-wrap items-center justify-start lg:justify-center gap-x-4 gap-y-1 text-2xs font-mono text-ink-500">
          <Meter
            label="health"
            value={health.status === 'ok' ? 'OK' : health.status.toUpperCase()}
            ok={health.status === 'ok'}
            dot
          />
          <Sep />
          <Meter
            label="embedder"
            value={health.embedder_loaded ? '✓' : '✗'}
            ok={health.embedder_loaded}
          />
          <Sep />
          <Meter
            label="reranker"
            value={health.reranker_available ? 'qwen-1.5b' : '—'}
            ok={health.reranker_available}
          />
          <Sep />
          <Meter label="artifacts" value={fmtNumber(health.skills_count)} />
          <Sep />
          <Meter label="uptime" value={fmtUptime(health.uptime_seconds)} />
          <Sep />
          <Meter label="db" value="ok" ok />
        </div>

        {/* 右: 外链 */}
        <div className="flex items-center justify-start lg:justify-end gap-4 text-2xs text-ink-400">
          <FooterLink href="/settings" icon={BookOpen}>
            文档
          </FooterLink>
          <FooterLink href="/settings#changelog" icon={History}>
            Changelog
          </FooterLink>
          <FooterLink
            href="https://github.com/aiforge/aiforge"
            external
            icon={Github}
          >
            GitHub
          </FooterLink>
          <FooterLink href="/api/v1/openapi.json" external icon={FileCode2}>
            API Schema
          </FooterLink>
        </div>
      </div>
    </footer>
  );
}

function Meter({
  label,
  value,
  ok,
  dot,
}: {
  label: string;
  value: string;
  ok?: boolean;
  dot?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {dot && (
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full ${
            ok ? 'bg-oxide-500 shadow-[0_0_0_3px_rgba(63,199,154,0.18)]' : 'bg-amber-500'
          }`}
        />
      )}
      <span className="text-ink-300 uppercase tracking-ultra text-[0.625rem]">{label}</span>
      <span
        className={
          ok === false
            ? 'text-ember-500'
            : ok === true
            ? 'text-ink-700'
            : 'text-ink-700'
        }
      >
        {value}
      </span>
      {ok === true && !dot && <CircleCheck className="w-3 h-3 text-oxide-500" />}
      {ok === false && <CircleX className="w-3 h-3 text-ember-500" />}
    </span>
  );
}

function Sep() {
  return <span className="text-ink-200">·</span>;
}

function FooterLink({
  href,
  icon: Icon,
  external,
  children,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  external?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
      className="inline-flex items-center gap-1.5 hover:text-ink-800 transition"
    >
      <Icon className="w-3 h-3" />
      {children}
      {external && <ExternalLink className="w-2.5 h-2.5 text-ink-300" />}
    </Link>
  );
}
