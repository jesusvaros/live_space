import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ProfileEditor from './ProfileEditor';
import TeamView from './TeamView';
import type { TeamMember } from '../../services/team.service';

afterEach(cleanup);

const MEMBERS: TeamMember[] = [
  { profileId: 'me', role: 'admin', username: 'lucia', displayName: 'Lucía', avatarUrl: null, createdAt: '2026-11-01' },
  { profileId: 'p2', role: 'editor', username: 'marcos', displayName: 'Marcos', avatarUrl: null, createdAt: '2026-11-02' },
  { profileId: 'p3', role: 'owner', username: 'dueno', displayName: 'Dueño', avatarUrl: null, createdAt: '2026-10-01' },
];

const noop = () => Promise.resolve();

describe('TeamView', () => {
  it('admins invite with the chosen role and get a link to share', async () => {
    const onCreateInvite = vi.fn().mockResolvedValue('https://site.es/unirse?equipo=Zq4mN8xT2vLp9RkW3sYb7HcD');
    render(
      <TeamView
        entityName="Sala Lobo"
        members={MEMBERS}
        invites={[]}
        currentUserId="me"
        canAdmin
        onCreateInvite={onCreateInvite}
        onRevokeInvite={noop}
        onChangeRole={noop}
        onRemove={noop}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: /Moderador/ }));
    fireEvent.change(screen.getByLabelText('Email de la persona'), { target: { value: 'ana@sala.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear enlace' }));
    await waitFor(() => expect(screen.getByText('https://site.es/unirse?equipo=Zq4mN8xT2vLp9RkW3sYb7HcD')).toBeInTheDocument());
    expect(onCreateInvite).toHaveBeenCalledWith('moderator', 'ana@sala.com');
    expect(screen.getByRole('link', { name: 'Enviar por email' }).getAttribute('href')).toMatch(/^mailto:ana%40sala\.com\?/);
  });

  it('owners and yourself cannot be changed; others ask before being removed', async () => {
    const onRemove = vi.fn().mockResolvedValue(undefined);
    render(
      <TeamView
        entityName="Sala Lobo"
        members={MEMBERS}
        invites={[]}
        currentUserId="me"
        canAdmin
        onCreateInvite={vi.fn()}
        onRevokeInvite={noop}
        onChangeRole={noop}
        onRemove={onRemove}
      />,
    );
    expect(screen.queryByLabelText('Rol de Lucía')).toBeNull();
    expect(screen.queryByLabelText('Rol de Dueño')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Quitar a Marcos' }));
    expect(onRemove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Quitar' }));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('p2'));
  });

  it('editors only see the team', () => {
    render(
      <TeamView
        entityName="Sala Lobo"
        members={MEMBERS}
        invites={[]}
        currentUserId="p2"
        canAdmin={false}
        onCreateInvite={vi.fn()}
        onRevokeInvite={noop}
        onChangeRole={noop}
        onRemove={noop}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Crear enlace' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Quitar a/ })).toBeNull();
  });
});

describe('ProfileEditor', () => {
  const initial = {
    photoUrl: null,
    city: 'Madrid',
    bio: '',
    genres: [],
    links: {},
    address: '',
    capacity: '',
    website: '',
  };

  it('saves normalized links for an artist', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ProfileEditor kind="artist" name="Los Lobos" initial={initial} onUploadPhoto={vi.fn()} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText('Bio'), { target: { value: 'Rock de garaje.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rock' }));
    fireEvent.change(screen.getByLabelText('Instagram'), { target: { value: '@loslobos' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toEqual({
      city: 'Madrid',
      bio: 'Rock de garaje.',
      genres: ['Rock'],
      links: { instagram: 'https://www.instagram.com/loslobos' },
    });
    expect(await screen.findByText('Guardado')).toBeInTheDocument();
  });

  it('a venue with a wrong capacity is not saved', () => {
    const onSave = vi.fn();
    render(<ProfileEditor kind="venue" name="Sala Lobo" initial={initial} onUploadPhoto={vi.fn()} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText('Aforo'), { target: { value: 'mucha' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('El aforo tiene que ser un número.');
  });

  it('moderators see it read-only', () => {
    render(<ProfileEditor kind="artist" name="Los Lobos" initial={initial} readOnly onUploadPhoto={vi.fn()} onSave={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Guardar' })).toBeNull();
    expect(screen.getByLabelText('Bio')).toBeDisabled();
  });
});
