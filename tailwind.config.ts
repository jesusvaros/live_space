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
      },
      animation: {
        'fade-up': 'fade-up 0.6s ease-out both',
        'timeline-fade': 'timeline-fade 0.35s ease',
      },
    },
  },
} satisfies Config
