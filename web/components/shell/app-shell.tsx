'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { BackendStatusBanner } from './backend-status-banner';
import { ActivityTicker } from './activity-ticker';
import { DensityProvider } from './density-context';
import { Footer } from './footer';
import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const v = localStorage.getItem('aiforge.sidebar.collapsed');
    if (v === '1') setCollapsed(true);
  }, []);

  useEffect(() => {
    localStorage.setItem('aiforge.sidebar.collapsed', collapsed ? '1' : '0');
  }, [collapsed]);

  return (
    <DensityProvider>
      <div className="relative isolate min-h-screen">
        {/* 极细网格：贯穿全局，强化"工程感" */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-10 bg-grid-faint bg-grid-32 opacity-60"
        />
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-10 bg-noise opacity-[0.025] mix-blend-multiply"
        />

        <div className="flex">
          <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />

          <div className="flex-1 min-w-0 flex flex-col min-h-screen">
            <Topbar />
            <BackendStatusBanner />
            <main className="px-6 lg:px-10 pt-6 pb-12 max-w-[1600px] mx-auto w-full flex-1">
              {children}
            </main>
            {/* 全局底部条：位于 LIVE FEED ticker 之上 */}
            <Footer />
          </div>
        </div>

        {/* 永远在底部的活动 ticker */}
        <ActivityTicker />

        {/* 首次访问的引导浮层（全局挂载，组件内部自行决定是否渲染） */}
        <OnboardingWizard />
      </div>
    </DensityProvider>
  );
}
