'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

const KEY_COMPLETED = 'aiforge.onboarding.completed';
const KEY_STEP = 'aiforge.onboarding.step';
const EVT = 'aiforge.onboarding.change';

export interface OnboardingState {
  completed: boolean;
  step: number;
}

export interface UseOnboarding {
  state: OnboardingState;
  isOpen: boolean;
  next(): void;
  prev(): void;
  goto(n: number): void;
  complete(): void;
  reopen(): void;
}

const TOTAL_STEPS = 5;

function readState(): OnboardingState {
  if (typeof window === 'undefined') return { completed: false, step: 1 };
  try {
    const completed = window.localStorage.getItem(KEY_COMPLETED) === 'true';
    const stepRaw = window.localStorage.getItem(KEY_STEP);
    const step = Math.min(
      TOTAL_STEPS,
      Math.max(1, stepRaw ? parseInt(stepRaw, 10) || 1 : 1)
    );
    return { completed, step };
  } catch {
    return { completed: false, step: 1 };
  }
}

function writeState(s: OnboardingState) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY_COMPLETED, s.completed ? 'true' : 'false');
    window.localStorage.setItem(KEY_STEP, String(s.step));
    window.dispatchEvent(new CustomEvent(EVT));
  } catch {
    /* noop */
  }
}

export function useOnboarding(): UseOnboarding {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [state, setState] = useState<OnboardingState>({
    completed: true, // SSR-safe default — never flash modal on first paint
    step: 1,
  });

  useEffect(() => {
    setMounted(true);
    setState(readState());

    const handler = () => setState(readState());
    window.addEventListener(EVT, handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener(EVT, handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  const next = useCallback(() => {
    setState((prev) => {
      const nextStep = Math.min(TOTAL_STEPS, prev.step + 1);
      const ns = { ...prev, step: nextStep };
      writeState(ns);
      return ns;
    });
  }, []);

  const prev = useCallback(() => {
    setState((cur) => {
      const prevStep = Math.max(1, cur.step - 1);
      const ns = { ...cur, step: prevStep };
      writeState(ns);
      return ns;
    });
  }, []);

  const goto = useCallback((n: number) => {
    setState((cur) => {
      const target = Math.min(TOTAL_STEPS, Math.max(1, n));
      const ns = { ...cur, step: target };
      writeState(ns);
      return ns;
    });
  }, []);

  const complete = useCallback(() => {
    const ns = { completed: true, step: TOTAL_STEPS };
    setState(ns);
    writeState(ns);
  }, []);

  const reopen = useCallback(() => {
    const ns = { completed: false, step: 1 };
    setState(ns);
    writeState(ns);
  }, []);

  // 只在 root 路径打开，避免在深链上打扰
  const isOpen = mounted && !state.completed && pathname === '/';

  return { state, isOpen, next, prev, goto, complete, reopen };
}

export const ONBOARDING_TOTAL_STEPS = TOTAL_STEPS;
