import './globals.css';
import type { Metadata } from 'next';
import { Fraunces, JetBrains_Mono, Inter } from 'next/font/google';
import { AppShell } from '@/components/shell/app-shell';
import { Toaster } from 'sonner';

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  axes: ['SOFT', 'WONK', 'opsz'],
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

// 用 Inter 作 body 字体（Geist 离线，避免拉远端）。
// 通过 OpenType feature 启用 cv11/ss01/ss03 让它接近 Geist 的字形特征。
const sans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'AIForge · Control Plane',
  description: 'Unified registry & router for agent skills, MCP servers, and Claude Code plugins.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hans" className={`${fraunces.variable} ${mono.variable} ${sans.variable}`}>
      <body className="font-sans antialiased min-h-screen">
        <AppShell>{children}</AppShell>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#FFFFFF',
              border: '1px solid rgba(14,17,22,0.08)',
              color: '#0E1116',
              fontFamily: 'var(--font-sans)',
              borderRadius: '8px',
              boxShadow: '0 12px 32px -16px rgba(14,17,22,.18)',
            },
          }}
        />
      </body>
    </html>
  );
}
