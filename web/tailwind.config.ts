import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

// AIForge 设计令牌
// 「Editorial Engineering」: parchment 底色 + graphite ink + oxide green 单一强调色
const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    container: { center: true, padding: '1.25rem', screens: { '2xl': '1440px' } },
    extend: {
      colors: {
        // 基底
        parchment: {
          50: '#FCFBF8',
          100: '#FAFAF7',
          200: '#F2F0EA',
          300: '#E6E4DC',
          400: '#CFCCC0',
        },
        ink: {
          50: '#F5F6F7',
          100: '#E2E4E8',
          200: '#B7BAC0',
          300: '#7E828B',
          400: '#5F6470',
          500: '#3D424C',
          600: '#252932',
          700: '#161A22',
          800: '#0E1116',
          900: '#06080C',
        },
        // 单一品牌色: 氧化铜绿，与传统 emerald/cyan 截然不同
        oxide: {
          50: '#EAF3F0',
          100: '#CDE3DC',
          200: '#9DC8BB',
          300: '#5FA793',
          400: '#1F7E64',
          500: '#0E5C4A', // 主
          600: '#0A4738',
          700: '#08382C',
          800: '#062A21',
          900: '#031813',
        },
        // 状态色
        ember: { 500: '#9B2B22', 100: '#F2DBD8' },   // danger
        amber: { 500: '#A26F1E', 100: '#F2E4CC' },   // warning
        navy: { 500: '#1F3F6F', 100: '#D5DEEB' },    // info
        moss: { 500: '#3FC79A' },                    // accent glow

        // shadcn-style 语义令牌（基于上面的色系）
        background: '#FAFAF7',
        foreground: '#0E1116',
        muted: { DEFAULT: '#F2F0EA', foreground: '#5F6470' },
        card: { DEFAULT: '#FFFFFF', foreground: '#0E1116' },
        popover: { DEFAULT: '#FFFFFF', foreground: '#0E1116' },
        primary: { DEFAULT: '#0E5C4A', foreground: '#FCFBF8' },
        secondary: { DEFAULT: '#F2F0EA', foreground: '#0E1116' },
        accent: { DEFAULT: '#EAF3F0', foreground: '#0E5C4A' },
        destructive: { DEFAULT: '#9B2B22', foreground: '#FCFBF8' },
        border: '#E6E4DC',
        input: '#E6E4DC',
        ring: '#1F7E64',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Fraunces', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'Geist', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '0.875rem', letterSpacing: '0.02em' }],
      },
      letterSpacing: {
        ultra: '0.16em',
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px',
      },
      boxShadow: {
        hairline: '0 0 0 1px rgba(14, 17, 22, 0.06)',
        'hairline-strong': '0 0 0 1px rgba(14, 17, 22, 0.12)',
        elevate: '0 1px 2px rgba(14,17,22,.04), 0 8px 24px -16px rgba(14,17,22,.12)',
        glow: '0 0 0 6px rgba(63, 199, 154, 0.14)',
      },
      backgroundImage: {
        // 极细密的网格背景
        'grid-faint':
          'linear-gradient(to right, rgba(14,17,22,0.035) 1px, transparent 1px),' +
          'linear-gradient(to bottom, rgba(14,17,22,0.035) 1px, transparent 1px)',
        'dot-faint':
          'radial-gradient(rgba(14,17,22,0.08) 1px, transparent 1px)',
        'noise':
          "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.18 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
      },
      backgroundSize: {
        'grid-32': '32px 32px',
        'grid-24': '24px 24px',
        'dot-16': '16px 16px',
      },
      keyframes: {
        'pulse-dot': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.55', transform: 'scale(0.85)' },
        },
        'reactor-spin': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        ticker: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'pulse-dot': 'pulse-dot 1.6s ease-in-out infinite',
        'reactor-spin': 'reactor-spin 18s linear infinite',
        ticker: 'ticker 60s linear infinite',
        'fade-up': 'fade-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) both',
      },
    },
  },
  plugins: [animate],
};

export default config;
