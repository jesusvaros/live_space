import { describe, expect, it, vi } from 'vitest';

describe('at() polyfill', () => {
  it('fills in a WebView without it, like the native one', async () => {
    const native = Array.prototype.at;
    const nativeString = String.prototype.at;
    // @ts-expect-error simulating an old WebView
    delete Array.prototype.at;
    // @ts-expect-error simulating an old WebView
    delete String.prototype.at;
    try {
      vi.resetModules();
      await import('./polyfills');
      expect([1, 2, 3].at(-1)).toBe(3);
      expect([1, 2, 3].at(0)).toBe(1);
      expect([1, 2, 3].at(5)).toBeUndefined();
      expect([].at(-1)).toBeUndefined();
      expect('abc'.at(-2)).toBe('b');
    } finally {
      Object.defineProperty(Array.prototype, 'at', { value: native, writable: true, configurable: true });
      Object.defineProperty(String.prototype, 'at', { value: nativeString, writable: true, configurable: true });
    }
  });
});
