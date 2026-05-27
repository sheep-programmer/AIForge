'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

const SEGMENT_LABELS: Record<string, string> = {
  '': '总览',
  artifacts: 'Artifacts',
  tags: '标签',
  ingest: '入库',
  autotag: '自动打标',
  playground: 'Playground',
  discovery: '审批',
  settings: '设置',
};

export function BreadcrumbBar() {
  const pathname = usePathname() || '/';
  const segments = pathname.split('/').filter(Boolean);

  const crumbs = segments.length === 0
    ? [{ href: '/', label: '总览', last: true }]
    : [
        { href: '/', label: 'AIForge', last: false },
        ...segments.map((seg, i) => {
          const href = '/' + segments.slice(0, i + 1).join('/');
          const last = i === segments.length - 1;
          const label = SEGMENT_LABELS[seg] ?? decodeURIComponent(seg);
          return { href, label, last };
        }),
      ];

  return (
    <nav aria-label="breadcrumb" className="flex items-center gap-1.5 text-sm">
      {crumbs.map((c, i) => (
        <span key={c.href} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-ink-200" />}
          {c.last ? (
            <span className="display text-[1.05rem] font-medium text-ink-800 truncate">
              {c.label}
            </span>
          ) : (
            <Link
              href={c.href}
              className="text-ink-400 hover:text-ink-700 transition truncate"
            >
              {c.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
