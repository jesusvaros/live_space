import type { Config } from "tailwindcss"

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  corePlugins: {
    preflight: false,
  } as const,
  theme: {
    extend: {
      colors: {
        app: {
          bg: 'var(--app-bg)',
          surface: 'var(--app-surface)',
          surfaceStrong: 'var(--app-surface-strong)',
          ink: 'var(--app-ink)',
          muted: 'var(--app-muted)',
          accent: 'var(--app-accent)',
          accentStrong: 'var(--app-accent-strong)',
          ring: 'var(--app-ring)',
          line: 'var(--app-line)',
        },
      },
      borderRadius: {
        app: 'var(--app-radius)',
      },
      boxShadow: {
        card: 'var(--app-card-shadow)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        display: ['var(--font-display)'],
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'timeline-fade': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        // Profile tabs: the new content slides in from the side of its tab.
        'tab-in-right': {
          '0%': { opacity: '0', transform: 'translateX(28px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateX(0) scale(1)' },
        },
        'tab-in-left': {
          '0%': { opacity: '0', transform: 'translateX(-28px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateX(0) scale(1)' },
        },
        // The ♥ that pops on the concert player after a double tap.
        'like-burst': {
          '0%': { opacity: '0', transform: 'scale(0.6)' },
          '20%': { opacity: '1', transform: 'scale(1.1)' },
          '70%': { opacity: '1', transform: 'scale(1)' },
          '100%': { opacity: '0', transform: 'scale(1.15)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.6s ease-out both',
        'timeline-fade': 'timeline-fade 0.35s ease',
        'like-burst': 'like-burst 0.7s ease-out both',
        'tab-in-right': 'tab-in-right 0.38s cubic-bezier(0.22, 1, 0.36, 1) both',
        'tab-in-left': 'tab-in-left 0.38s cubic-bezier(0.22, 1, 0.36, 1) both',
      },
    },
  },
} satisfies Config
