import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Usage analytics (Capacitor + Supabase) is never real in unit tests: every
// test sees spies; import { track } from the module to assert on events.
vi.mock('../features/analytics/analytics', () => ({
  analytics: {
    track: vi.fn(),
    flush: vi.fn(async () => undefined),
    setEnabled: vi.fn(),
    isEnabled: vi.fn(() => true),
  },
  track: vi.fn(),
  setAnalyticsSharing: vi.fn(),
  flushAnalytics: vi.fn(async () => undefined),
  startAnalytics: vi.fn(),
}));
