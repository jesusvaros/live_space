import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GalleryAsset } from '../../media/native/gallery';

const mocks = vi.hoisted(() => ({ findMedia: vi.fn() }));

vi.mock('../../media/native/gallery', () => ({ findMedia: mocks.findMedia }));

import GalleryRangeSheet from './GalleryRangeSheet';

// Saturday 3 Oct 2026, 21:00–23:30 in Madrid.
const CONCERT = { startsAt: '2026-10-03T19:00:00Z', endsAt: '2026-10-03T21:30:00Z', timeZone: 'Europe/Madrid' };

const asset = (id: string, createdAt: string, kind: GalleryAsset['kind'] = 'photo', durationSec: number | null = null): GalleryAsset => ({
  id,
  kind,
  createdAt,
  durationSec,
  location: null,
  thumbnailUri: `https://localhost/_capacitor_file_/thumb-${id}.jpg`,
  width: null,
  height: null,
});

const ASSETS = [
  asset('fri', '2026-10-02T09:00:00Z'),
  asset('show-video', '2026-10-03T20:05:00Z', 'video', 75),
  asset('show-photo', '2026-10-03T20:10:00Z'),
  asset('sun', '2026-10-04T10:00:00Z'),
];

const renderSheet = (props: Partial<React.ComponentProps<typeof GalleryRangeSheet>> = {}) => {
  const onConfirm = vi.fn();
  const onOpenFullGallery = vi.fn();
  render(
    <GalleryRangeSheet
      isOpen
      concert={CONCERT}
      alreadyAdded={[]}
      limited={false}
      onClose={() => undefined}
      onConfirm={onConfirm}
      onOpenFullGallery={onOpenFullGallery}
      {...props}
    />,
  );
  return { onConfirm, onOpenFullGallery };
};

describe('GalleryRangeSheet', () => {
  beforeEach(() => {
    mocks.findMedia.mockReset().mockResolvedValue(ASSETS);
  });

  it('scans the day before to the day after, by day, with the concert ticked', async () => {
    const { onConfirm } = renderSheet();
    expect(await screen.findByText('Sábado 3 oct · día del concierto')).toBeInTheDocument();
    expect(screen.getByText('Viernes 2 oct')).toBeInTheDocument();
    expect(screen.getByText('Domingo 4 oct')).toBeInTheDocument();

    const [{ from, to }] = mocks.findMedia.mock.calls[0];
    expect(from.toISOString()).toBe('2026-10-01T22:00:00.000Z');
    expect(to.toISOString()).toBe('2026-10-04T21:59:59.999Z');

    expect(screen.getByText('▶ 1:15')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vídeo de las 22:05' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Foto de las 22:10' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Foto de las 11:00' })).toHaveAttribute('aria-pressed', 'false');

    // Untick the photo, tick Friday's.
    fireEvent.click(screen.getByRole('button', { name: 'Foto de las 22:10' }));
    fireEvent.click(screen.getByRole('button', { name: 'Foto de las 11:00' }));
    fireEvent.click(screen.getByRole('button', { name: 'Añadir 2' }));
    expect(onConfirm).toHaveBeenCalledWith([ASSETS[0], ASSETS[1]]);
  });

  it('reopens with what was already added instead of the preselection', async () => {
    renderSheet({ alreadyAdded: ['sun'] });
    expect(await screen.findByRole('button', { name: 'Añadir 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Foto de las 12:00' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Vídeo de las 22:05' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('with nothing those days, says so and offers the whole gallery', async () => {
    mocks.findMedia.mockResolvedValue([]);
    const { onOpenFullGallery } = renderSheet();
    expect(await screen.findByText('No hay fotos ni vídeos de esos días')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Añadir/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver toda la galería' }));
    await waitFor(() => expect(onOpenFullGallery).toHaveBeenCalled());
  });
});
