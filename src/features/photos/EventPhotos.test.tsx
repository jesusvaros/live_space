import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TimelineMoment } from '../moments/concertTimeline';

vi.mock('./PhotoGrid', () => ({ default: () => null }));
vi.mock('./usePhotoActions', () => ({ usePhotoActions: () => ({ handlers: {}, undo: null, undoHide: () => undefined }) }));

import EventPhotos from './EventPhotos';

const photo = (id: string, userId: string, likes: number, minute: number, songId: string | null = null): TimelineMoment => ({
  id,
  userId,
  userName: userId,
  mediaType: 'image',
  mediaUrl: `https://res.cloudinary.com/x/image/upload/${id}.jpg`,
  thumbnailUrl: null,
  capturedAt: `2026-10-10T21:${String(minute).padStart(2, '0')}:00.000Z`,
  createdAt: '2026-10-11T10:00:00.000Z',
  songId,
  likes,
});

const renderPhotos = (moments: TimelineMoment[]) =>
  render(
    <MemoryRouter>
      <EventPhotos
        moments={moments}
        currentUserId="ana"
        onDeleted={() => undefined}
        songs={[{ songId: 's1', label: '01 · Uno' }]}
      />
    </MemoryRouter>,
  );

describe('EventPhotos', () => {
  afterEach(cleanup);

  it('opens on the most liked, then a section per person', () => {
    renderPhotos([photo('a', 'ana', 0, 1), photo('b', 'pepe', 7, 2, 's1'), photo('c', 'pepe', 2, 3)]);
    expect(screen.getByText('Lo más gustado')).toBeInTheDocument();
    expect(screen.getByText('♥ 7')).toBeInTheDocument();
    expect(screen.getByText('Tus fotos')).toBeInTheDocument();
    expect(screen.getByText('@pepe')).toBeInTheDocument();
  });

  it('regroups by song', () => {
    renderPhotos([photo('a', 'ana', 0, 1), photo('b', 'pepe', 0, 2, 's1')]);
    expect(screen.getByText('Lo último')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Canciones' }));
    expect(screen.getByText('01 · Uno')).toBeInTheDocument();
    expect(screen.getByText('Sin canción')).toBeInTheDocument();
  });
});
