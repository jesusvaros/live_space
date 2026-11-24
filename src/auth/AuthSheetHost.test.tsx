import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authState = { user: null as null | { id: string }, loading: false };
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('./AuthPanel', () => ({ default: () => <div>panel</div> }));
vi.mock('../features/analytics/analytics', () => ({ track: vi.fn() }));

import AuthSheetHost from './AuthSheetHost';
import { askForAccount } from './askForAccount';

describe('account sheet', () => {
  beforeEach(() => {
    authState.user = null;
  });

  it('opens over the current screen instead of going to /welcome', () => {
    const navigate = vi.fn();
    const { unmount } = render(
      <MemoryRouter initialEntries={['/event/1']}>
        <AuthSheetHost />
      </MemoryRouter>,
    );
    act(() => askForAccount(navigate, 'Crea tu cuenta para seguir a Frisbi'));
    expect(screen.getByText('Crea tu cuenta para seguir a Frisbi')).toBeInTheDocument();
    expect(screen.getByText('panel')).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
    unmount();
  });

  it('falls back to /welcome when the sheet is not mounted', () => {
    const navigate = vi.fn();
    askForAccount(navigate, 'Motivo');
    expect(navigate).toHaveBeenCalledWith('/welcome', { state: { reason: 'Motivo' } });
  });
});
