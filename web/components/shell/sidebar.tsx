'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Boxes,
  TagsIcon,
  DownloadCloud,
  Sparkles,
  Wand2,
  GitPullRequestArrow,
  Settings as SettingsIcon,
  ChevronsLeft,
  ChevronsRight,
  BarChart3,
  MonitorSmartphone,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from './logo';

interface NavItem {
  href: string;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  /** 数据标记：实验性 / Beta / 新增等 */
  flag?: string;
}

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Overview',
    items: [
      { href: '/', label: '总览', hint: '关键指标 / 最近活动', icon: LayoutDashboard },
    ],
  },
  {
    title: 'Registry',
    items: [
      { href: '/artifacts', label: 'Artifacts', hint: 'Skill / MCP / Plugin', icon: Boxes },
      { href: '/tags', label: '分组标签', hint: '人工 / 自动 标签', icon: TagsIcon },
      { href: '/ingest', label: '入库', hint: '从 GitHub 拉取', icon: DownloadCloud },
      { href: '/autotag', label: '自动打标', hint: '小模型分类批处理', icon: Wand2, flag: 'AI' },
    ],
  },
  {
    title: 'Routing',
    items: [
      { href: '/playground', label: 'Playground', hint: '推荐效果试验', icon: Sparkles },
      { href: '/discovery', label: '审批队列', hint: '远程发现的新仓库', icon: GitPullRequestArrow },
    ],
  },
  {
    title: 'Analytics',
    items: [
      { href: '/insights', label: 'Insights', hint: '推荐质量与流量分析', icon: BarChart3, flag: 'NEW' },
    ],
  },
  {
    title: 'System',
    items: [
      { href: '/environment', label: '本机环境', hint: '已装的 MCP / plugin / skill', icon: MonitorSmartphone, flag: 'NEW' },
      { href: '/settings', label: '设置', hint: 'API key / 主题 / 后端地址', icon: SettingsIcon },
    ],
  },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        'sticky top-0 h-screen shrink-0 z-30',
        'bg-parchment-50/85 backdrop-blur-md',
        'border-r border-ink-100/60',
        'transition-[width] duration-300',
        collapsed ? 'w-[72px]' : 'w-[252px]'
      )}
    >
      <div className="h-full flex flex-col">
        {/* Logo + brand mark */}
        <div className="px-5 pt-6 pb-5 border-b border-ink-100/60">
          <Link href="/" className="flex items-center gap-2.5 group">
            <Logo />
            {!collapsed && (
              <div className="flex flex-col leading-none animate-fade-up">
                <span className="display text-[1.35rem] font-medium text-ink-800">
                  AIForge
                </span>
                <span className="label !text-2xs !tracking-ultra mt-1 text-ink-300">
                  CONTROL PLANE
                </span>
              </div>
            )}
          </Link>
        </div>

        {/* nav groups */}
        <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-6">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              {!collapsed && (
                <div className="label !text-2xs !tracking-ultra px-2 mb-2 text-ink-300">
                  {group.title}
                </div>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active =
                    item.href === '/'
                      ? pathname === '/'
                      : pathname.startsWith(item.href);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          'group flex items-center gap-3 rounded-md px-2.5 py-2 text-sm transition',
                          'hover:bg-ink-100/50',
                          active
                            ? 'bg-ink-800 text-parchment-50 shadow-elevate hover:bg-ink-800'
                            : 'text-ink-500 hover:text-ink-800'
                        )}
                      >
                        <Icon
                          className={cn(
                            'w-4 h-4 shrink-0',
                            active ? 'text-moss-500' : 'text-ink-300 group-hover:text-ink-500'
                          )}
                        />
                        {!collapsed && (
                          <>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium flex items-center gap-1.5">
                                {item.label}
                                {item.flag && (
                                  <span
                                    className={cn(
                                      'text-[0.55rem] uppercase tracking-ultra px-1 py-px rounded-sm font-mono',
                                      active
                                        ? 'bg-moss-500/20 text-moss-500'
                                        : 'bg-oxide-100 text-oxide-600'
                                    )}
                                  >
                                    {item.flag}
                                  </span>
                                )}
                              </div>
                              <div
                                className={cn(
                                  'text-2xs mt-0.5 truncate',
                                  active ? 'text-parchment-300' : 'text-ink-300'
                                )}
                              >
                                {item.hint}
                              </div>
                            </div>
                          </>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* footer */}
        <div className="px-3 py-3 border-t border-ink-100/60">
          <button
            onClick={onToggle}
            className={cn(
              'flex items-center justify-center w-full h-8 rounded-md',
              'text-ink-400 hover:text-ink-800 hover:bg-ink-100/60 transition'
            )}
            aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
          >
            {collapsed ? <ChevronsRight className="w-4 h-4" /> : <ChevronsLeft className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </aside>
  );
}
