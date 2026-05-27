'use client';

// 全局密度模式 (compact / comfortable)。
// 用 <html data-density="..."> 控制全局 CSS，避免每个组件单独感知。
// 状态持久化到 localStorage.aiforge.density。

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type Density = 'compact' | 'comfortable';
const STORAGE_KEY = 'aiforge.density';

interface DensityCtx {
  density: Density;
  setDensity: (d: Density) => void;
  toggle: () => void;
}

const Ctx = createContext<DensityCtx | null>(null);

export function useDensity(): DensityCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useDensity must be used inside <DensityProvider>');
  return ctx;
}

const INJECTED_CSS = `
:root[data-density="compact"] .surface,
:root[data-density="compact"] .surface-strong {
  padding-top: 0.875rem;
  padding-bottom: 0.875rem;
  padding-left: 1rem;
  padding-right: 1rem;
}
:root[data-density="compact"] .cell-row > a,
:root[data-density="compact"] .cell-row > div {
  padding-top: 0.5rem !important;
  padding-bottom: 0.5rem !important;
}
:root[data-density="compact"] .eyebrow {
  margin-bottom: 0.5rem;
}
:root[data-density="compact"] main {
  padding-top: 1rem !important;
}
:root[data-density="compact"] .density-gap {
  gap: 1rem !important;
}
:root[data-density="comfortable"] .density-gap {
  gap: 1.5rem;
}
`;

export function DensityProvider({ children }: { children: React.ReactNode }) {
  const [density, setDensityState] = useState<Density>('comfortable');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === 'compact' || stored === 'comfortable') {
        setDensityState(stored);
      }
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.setAttribute('data-density', density);
    try {
      window.localStorage.setItem(STORAGE_KEY, density);
    } catch {
      /* ignore */
    }
  }, [density, ready]);

  const setDensity = useCallback((d: Density) => setDensityState(d), []);
  const toggle = useCallback(
    () => setDensityState((d) => (d === 'compact' ? 'comfortable' : 'compact')),
    []
  );

  return (
    <Ctx.Provider value={{ density, setDensity, toggle }}>
      <style
        // 注入到 <head>，覆盖 globals.css 中的 padding 默认
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: INJECTED_CSS }}
      />
      {children}
    </Ctx.Provider>
  );
}
