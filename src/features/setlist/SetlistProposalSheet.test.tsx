import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  recognize: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('../wrapped/recognizeText', () => ({
  recognizeImageText: mocks.recognize,
  usesNativeOcr: () => true,
}));

import SetlistProposalSheet from './SetlistProposalSheet';

const renderSheet = (props: Partial<React.ComponentProps<typeof SetlistProposalSheet>> = {}) =>
  render(<SetlistProposalSheet isOpen onClose={() => undefined} eventId="event-1" {...props} />);

const textarea = () => screen.getByPlaceholderText(/Primera canción/) as HTMLTextAreaElement;

describe('SetlistProposalSheet', () => {
  afterEach(cleanup);

  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.recognize.mockReset();
  });

  it('previews the cleaned list and sends it as a proposal', async () => {
    mocks.rpc.mockResolvedValue({ data: { status: 'pending', titles: ['Uno', 'Dos'] }, error: null });
    const onSubmitted = vi.fn();
    renderSheet({ onSubmitted });
    fireEvent.change(textarea(), { target: { value: 'Setlist\n  Uno \n\nDos\nEncore' } });

    const preview = screen.getByRole('list', { name: 'Vista previa del setlist' });
    expect(within(preview).getAllByRole('listitem').map(item => item.textContent)).toEqual(['01Uno', '02Dos']);

    fireEvent.click(screen.getByRole('button', { name: 'Enviar setlist' }));
    expect(await screen.findByText('Enviado. Lo verá el artista o moderación antes de publicarlo.')).toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledWith('submit_audience_setlist', { p_event_id: 'event-1', p_titles: ['Uno', 'Dos'] });
    expect(onSubmitted).toHaveBeenCalledWith({ kind: 'pending', titles: ['Uno', 'Dos'] });
  });

  it('explains a title that is too long without sending', async () => {
    renderSheet();
    fireEvent.change(textarea(), { target: { value: `Uno\n${'a'.repeat(121)}` } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar setlist' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('demasiado largo');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('shows why the database refused it', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'setlist_locked' } });
    renderSheet();
    fireEvent.change(textarea(), { target: { value: 'Uno' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar setlist' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ya tiene su setlist oficial');
  });

  it('fills the textarea from a photo', async () => {
    mocks.recognize.mockResolvedValue([['SETLIST', '1. Can-', 'ción'], ['2) Otra']]);
    renderSheet({ initialTitles: ['Ya escrita'] });
    await waitFor(() => expect(textarea().value).toBe('Ya escrita'));
    const file = new File(['x'], 'setlist.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('setlist-photo-input'), { target: { files: [file] } });
    await waitFor(() => expect(textarea().value).toBe('Ya escrita\nCanción\nOtra'));
    expect(mocks.recognize).toHaveBeenCalledWith(file);
  });

  it('says so when the photo has no songs', async () => {
    mocks.recognize.mockResolvedValue([['12', '---']]);
    renderSheet();
    fireEvent.change(screen.getByTestId('setlist-photo-input'), {
      target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('No hemos leído canciones');
  });
});
