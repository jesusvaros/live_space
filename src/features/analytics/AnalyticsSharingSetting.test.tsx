import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stubLocalStorage } from '../../test/memoryStorage';
import { setAnalyticsSharing } from './analytics';
import AnalyticsSharingSetting from './AnalyticsSharingSetting';
import { getAnalyticsSharing, saveAnalyticsSharing } from './settings';

// ./analytics is a spy module (src/test/setup.ts): this checks the switch and
// the saved choice.

beforeEach(() => {
  stubLocalStorage();
  vi.mocked(setAnalyticsSharing).mockClear();
});

afterEach(cleanup);

describe('«Compartir cómo usas la app»', () => {
  it('is on by default', () => {
    expect(getAnalyticsSharing()).toBe(true);
    render(<AnalyticsSharingSetting />);
    expect(screen.getByRole('switch', { name: 'Compartir cómo usas la app' })).toHaveAttribute('aria-checked', 'true');
  });

  it('turning it off tells analytics, and turning it on again too', () => {
    render(<AnalyticsSharingSetting />);
    const toggle = screen.getByRole('switch', { name: 'Compartir cómo usas la app' });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(setAnalyticsSharing).toHaveBeenLastCalledWith(false);
    fireEvent.click(toggle);
    expect(setAnalyticsSharing).toHaveBeenLastCalledWith(true);
  });

  it('shows the saved choice', () => {
    saveAnalyticsSharing(false);
    expect(getAnalyticsSharing()).toBe(false);
    render(<AnalyticsSharingSetting />);
    expect(screen.getByRole('switch', { name: 'Compartir cómo usas la app' })).toHaveAttribute('aria-checked', 'false');
  });
});
