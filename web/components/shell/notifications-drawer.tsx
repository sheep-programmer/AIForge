'use client';

import { useMemo, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  GitPullRequestArrow,
  Inbox,
  KeyRound,
  PackageCheck,
  PackageX,
  RefreshCcw,
  ServerCrash,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import { cn, fmtRelativeTime } from '@/lib/utils';
import {
  bucketByDate,
  NotificationCategory,
  NotificationItem,
  NotificationKind,
} from '@/lib/notifications';

type TabKey = 'all' | NotificationCategory;
const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'jobs', label: '任务' },
  { key: 'discoveries', label: '发现' },
  { key: 'system', label: '系统' },
];

interface Props {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  items: NotificationItem[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}

const KIND_ICON: Record<NotificationKind, React.ComponentType<{ className?: string }>> = {
  ingest_done: PackageCheck,
  ingest_failed: PackageX,
  autotag_done: Wand2,
  discovery_new: GitPullRequestArrow,
  gateway_offline: ServerCrash,
  system_upgrade: Sparkles,
  auth_required: KeyRound,
};

const STATUS_DOT: Record<NotificationItem['status'], string> = {
  success: 'bg-oxide-500 shadow-[0_0_0_3px_rgba(63,199,154,0.18)]',
  info: 'bg-navy-500 shadow-[0_0_0_3px_rgba(31,63,111,0.18)]',
  warn: 'bg-amber-500 shadow-[0_0_0_3px_rgba(162,111,30,0.20)]',
  error: 'bg-ember-500 shadow-[0_0_0_3px_rgba(155,43,34,0.22)]',
};

export function NotificationsDrawer({
  open,
  onOpenChange,
  items,
  onMarkRead,
  onMarkAllRead,
}: Props) {
  const [tab, setTab] = useState<TabKey>('all');

  const filtered = useMemo(
    () => (tab === 'all' ? items : items.filter((n) => n.category === tab)),
    [items, tab]
  );
  const unreadCount = useMemo(() => items.filter((n) => !n.read).length, [items]);
  const buckets = useMemo(() => bucketByDate(filtered), [filtered]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-ink-900/30 backdrop-blur-sm',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            'fixed z-50 right-0 top-0 h-full w-[480px] max-w-[94vw]',
            'bg-parchment-50 border-l border-ink-100/80 shadow-elevate',
            'flex flex-col',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right'
          )}
        >
          {/* Header */}
          <div className="px-5 pt-5 pb-3 border-b border-ink-100/70">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="label !text-2xs !tracking-ultra text-ink-300 mb-1">
                  INBOX · LIVE
                </div>
                <DialogPrimitive.Title className="display text-[1.5rem] font-medium text-ink-800 tracking-tight">
                  通知
                  {unreadCount > 0 && (
                    <span className="ml-2 align-middle text-2xs font-mono font-normal text-parchment-50 bg-oxide-500 px-1.5 py-0.5 rounded">
                      {unreadCount}
                    </span>
                  )}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="sr-only">
                  系统通知与任务事件
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close
                className="w-8 h-8 inline-flex items-center justify-center rounded text-ink-400 hover:text-ink-800 hover:bg-ink-100/60 transition"
                aria-label="关闭"
              >
                <X className="w-4 h-4" />
              </DialogPrimitive.Close>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <div role="tablist" className="flex items-center gap-1 text-2xs">
                {TABS.map((t) => {
                  const active = tab === t.key;
                  return (
                    <button
                      key={t.key}
                      role="tab"
                      aria-selected={active}
                      onClick={() => setTab(t.key)}
                      className={cn(
                        'px-2.5 h-7 rounded font-medium transition',
                        active
                          ? 'bg-ink-800 text-parchment-50'
                          : 'text-ink-400 hover:text-ink-800 hover:bg-ink-100/60'
                      )}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={onMarkAllRead}
                disabled={unreadCount === 0}
                className={cn(
                  'inline-flex items-center gap-1.5 text-2xs font-medium transition',
                  unreadCount === 0
                    ? 'text-ink-200 cursor-not-allowed'
                    : 'text-ink-500 hover:text-oxide-500'
                )}
              >
                <RefreshCcw className="w-3 h-3" />
                全部标为已读
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            {buckets.length === 0 ? (
              <EmptyState tab={tab} />
            ) : (
              <ul className="py-2">
                {buckets.map((g) => (
                  <li key={g.bucket}>
                    <div className="px-5 pt-4 pb-1.5 label !text-2xs !tracking-ultra text-ink-300">
                      {g.label}
                    </div>
                    <ul>
                      {g.items.map((n) => (
                        <NotificationRow key={n.id} item={n} onClick={() => onMarkRead(n.id)} />
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-ink-100/70 px-5 py-3 flex items-center justify-between text-2xs text-ink-400">
            <div className="inline-flex items-center gap-2">
              <span className="dot dot-live" />
              <span className="font-mono">实时事件流 · mock</span>
            </div>
            <span className="font-mono">{items.length} 条记录</span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function NotificationRow({
  item,
  onClick,
}: {
  item: NotificationItem;
  onClick: () => void;
}) {
  const Icon = KIND_ICON[item.kind] ?? CircleAlert;
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'w-full text-left px-5 py-3 flex items-start gap-3 transition',
          'hover:bg-parchment-200/60',
          'border-b border-ink-100/50',
          item.read && 'opacity-55'
        )}
      >
        <div
          className={cn(
            'shrink-0 w-9 h-9 rounded inline-flex items-center justify-center',
            'bg-card border border-ink-100/80 text-ink-500'
          )}
        >
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'inline-block w-1.5 h-1.5 rounded-full',
                item.read ? 'bg-ink-200' : STATUS_DOT[item.status]
              )}
            />
            <span className="text-sm font-medium text-ink-800 truncate">{item.title}</span>
          </div>
          <div className="mt-0.5 text-2xs text-ink-400 line-clamp-2">{item.description}</div>
          <div className="mt-1 font-mono text-2xs text-ink-300">
            {fmtRelativeTime(item.timestamp)}
          </div>
        </div>
        {!item.read && <StatusGlyph status={item.status} />}
      </button>
    </li>
  );
}

function StatusGlyph({ status }: { status: NotificationItem['status'] }) {
  if (status === 'success')
    return <CheckCircle2 className="w-3.5 h-3.5 text-oxide-500 shrink-0 mt-1" />;
  if (status === 'warn')
    return <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-1" />;
  if (status === 'error')
    return <CircleAlert className="w-3.5 h-3.5 text-ember-500 shrink-0 mt-1" />;
  return null;
}

function EmptyState({ tab }: { tab: TabKey }) {
  const labelMap: Record<TabKey, string> = {
    all: '当前没有任何通知',
    jobs: '没有进行中或最近完成的任务',
    discoveries: '没有新发现等待审批',
    system: '系统一切正常',
  };
  return (
    <div className="h-full min-h-[280px] flex flex-col items-center justify-center px-6 text-center">
      <div className="w-12 h-12 rounded-full bg-ink-100/60 inline-flex items-center justify-center mb-3">
        <Inbox className="w-5 h-5 text-ink-300" />
      </div>
      <div className="text-sm text-ink-500">{labelMap[tab]}</div>
      <div className="mt-1 text-2xs text-ink-300 font-mono">no events</div>
    </div>
  );
}
