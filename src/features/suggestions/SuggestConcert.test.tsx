import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: { id: 'user-1' } as { id: string } | null,
  insert: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('../../auth/AuthPanel', () => ({ default: () => <div>auth-panel</div> }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: () => ({ insert: mocks.insert }) } }));

import { SuggestConcertSheet } from './SuggestConcert';
import { suggestErrorToResult } from './suggestEventLink';

const renderSheet = () =>
  render(
    <MemoryRouter initialEntries={['/tabs/discover']}>
      <SuggestConcertSheet isOpen onOpen={() => undefined} onClose={() => undefined} />
    </MemoryRouter>,
  );

const typeLink = (value: string) => fireEvent.change(screen.getByPlaceholderText('https://'), { target: { value } });

describe('SuggestConcertSheet', () => {
  afterEach(cleanup);

  beforeEach(() => {
    mocks.user = { id: 'user-1' };
    mocks.insert.mockReset().mockResolvedValue({ error: null });
    // Node's own (file-less) localStorage can shadow jsdom's: use a plain one.
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, String(value)),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
    });
  });

  it('sends the normalized link and thanks', async () => {
    renderSheet();
    typeLink(' https://dice.fm/event/abc?utm_source=ig&fbclid=x ');
    fireEvent.change(screen.getByPlaceholderText(/segundo pase/), { target: { value: '  Es el pase de las 23:00 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText(/Gracias\. Lo buscaremos en el próximo repaso de conciertos y te avisamos\./)).toBeInTheDocument();
    expect(mocks.insert).toHaveBeenCalledWith({ url: 'https://dice.fm/event/abc', note: 'Es el pase de las 23:00' });
  });

  it('rejects something that is not an http(s) link', async () => {
    renderSheet();
    typeLink('dice.fm/event/abc');
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('http:// o https://');
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('signed out: asks for an account and keeps the link', async () => {
    mocks.user = null;
    renderSheet();
    typeLink('https://dice.fm/event/abc');
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText('auth-panel')).toBeInTheDocument();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('live_space.suggest_link_draft')).toContain('https://dice.fm/event/abc');
  });

  it('shows the daily limit', async () => {
    mocks.insert.mockResolvedValue({ error: { code: 'P0001', message: 'rate_limited' } });
    renderSheet();
    typeLink('https://dice.fm/event/abc');
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('muchos links hoy'));
  });
});

describe('suggestErrorToResult', () => {
  it('maps database errors', () => {
    expect(suggestErrorToResult(null)).toBe('sent');
    expect(suggestErrorToResult({ code: '23505' })).toBe('already_sent');
    expect(suggestErrorToResult({ code: 'P0001', message: 'rate_limited' })).toBe('rate_limited');
    expect(suggestErrorToResult({ code: '22023', message: 'invalid_url' })).toBe('invalid_url');
    expect(suggestErrorToResult({ code: 'PGRST205' })).toBe('unavailable');
    expect(suggestErrorToResult({ code: '500' })).toBe('error');
  });
});
