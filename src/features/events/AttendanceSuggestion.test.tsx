import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: { id: 'user-1' } as { id: string } | null,
  fetchAttendanceStatus: vi.fn(),
  markAttendance: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('./attendance', async () => {
  const actual = await vi.importActual<typeof import('./attendance')>('./attendance');
  return { ...actual, fetchAttendanceStatus: mocks.fetchAttendanceStatus, markAttendance: mocks.markAttendance };
});

import AttendanceSuggestion from './AttendanceSuggestion';

const PAST = { startsAt: '2026-01-10T21:00:00Z', endsAt: '2026-01-10T23:30:00Z' };

describe('AttendanceSuggestion', () => {
  beforeEach(() => {
    mocks.user = { id: 'user-1' };
    mocks.fetchAttendanceStatus.mockReset().mockResolvedValue(null);
    mocks.markAttendance.mockReset().mockResolvedValue(undefined);
  });

  it('asks, and only marks the concert after the tap', async () => {
    const onMarked = vi.fn();
    render(<AttendanceSuggestion eventId="e1" {...PAST} onMarked={onMarked} />);
    expect(await screen.findByText('¿Marcamos que fuiste?')).toBeInTheDocument();
    expect(mocks.markAttendance).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Sí, fui' }));
    await waitFor(() => expect(mocks.markAttendance).toHaveBeenCalledWith('e1', 'user-1', 'attended'));
    expect(onMarked).toHaveBeenCalledWith('attended');
  });

  it('«Ahora no» closes it without marking', async () => {
    const onClose = vi.fn();
    render(<AttendanceSuggestion eventId="e1" {...PAST} onClose={onClose} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ahora no' }));
    expect(onClose).toHaveBeenCalled();
    expect(mocks.markAttendance).not.toHaveBeenCalled();
    expect(screen.queryByText('¿Marcamos que fuiste?')).not.toBeInTheDocument();
  });

  it('says nothing when already marked or signed out', async () => {
    mocks.fetchAttendanceStatus.mockResolvedValue('going');
    const { container, unmount } = render(<AttendanceSuggestion eventId="e1" {...PAST} />);
    await waitFor(() => expect(mocks.fetchAttendanceStatus).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    unmount();

    mocks.user = null;
    const signedOut = render(<AttendanceSuggestion eventId="e1" {...PAST} />);
    expect(signedOut.container).toBeEmptyDOMElement();
  });
});
