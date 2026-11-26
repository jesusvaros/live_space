import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api', () => ({ supabase: {} }));
vi.mock('../../lib/supabase', () => ({ supabase: {} }));

import { followLabel, groupByEvent, personName, searchTerm, type FriendGoing } from '../../services/friends.service';
import { FriendsSectionView, friendsLabel, friendsShortLabel, type FriendPlan } from './FriendsSection';

const friend = (friendId: string, name: string, eventId = 'e1', startsAt = '2026-12-01T21:00:00Z'): FriendGoing => ({
  eventId,
  startsAt,
  friendId,
  name,
  username: null,
  avatarUrl: null,
});

describe('friends helpers', () => {
  it('groups friends by concert, soonest first', () => {
    const groups = groupByEvent([
      friend('a', 'Ana', 'late', '2026-12-09T21:00:00Z'),
      friend('b', 'Luis', 'soon', '2026-12-02T21:00:00Z'),
      friend('c', 'Marta', 'late', '2026-12-09T21:00:00Z'),
    ]);
    expect(groups.map(group => group.eventId)).toEqual(['soon', 'late']);
    expect(groups[1].friends.map(item => item.name)).toEqual(['Ana', 'Marta']);
  });

  it('labels the faces with first names', () => {
    expect(friendsLabel([friend('a', 'Ana García')])).toBe('Ana');
    expect(friendsLabel([friend('a', 'Ana'), friend('b', 'Luis Pérez')])).toBe('Ana y Luis');
    expect(friendsLabel([friend('a', 'Ana'), friend('b', 'Luis'), friend('c', 'Marta')])).toBe('Ana y 2 más');
  });

  it('keeps the poster label short', () => {
    expect(friendsShortLabel([friend('a', 'Ana García')])).toBe('Ana');
    expect(friendsShortLabel([friend('a', 'Ana'), friend('b', 'Luis')])).toBe('2 personas');
  });

  it('cleans search text so it cannot break the filter', () => {
    expect(searchTerm('  @@ana ')).toBe('ana');
    expect(searchTerm('a,b(c)%_')).toBe('abc');
  });

  it('names people and follow states', () => {
    expect(personName({ display_name: ' ', username: 'ana' })).toBe('@ana');
    expect(personName({})).toBe('Alguien');
    expect(followLabel({ iFollow: false, followsMe: false })).toBe('Seguir');
    expect(followLabel({ iFollow: false, followsMe: true })).toBe('Seguir también');
    expect(followLabel({ iFollow: true, followsMe: false })).toBe('Siguiendo');
    expect(followLabel({ iFollow: true, followsMe: true })).toBe('Amigos');
  });
});

describe('FriendsSectionView', () => {
  afterEach(cleanup);
  it('invites to find friends when nobody is going anywhere', () => {
    const onFind = vi.fn();
    render(
      <MemoryRouter>
        <FriendsSectionView plans={[]} onOpen={vi.fn()} onFind={onFind} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('Busca a tus amigos'));
    expect(onFind).toHaveBeenCalled();
    expect(screen.queryByText('La gente que sigues aún no ha marcado conciertos.')).not.toBeInTheDocument();
  });

  it('lists the people you follow when none of them has marked a concert', () => {
    const onOpenPerson = vi.fn();
    render(
      <MemoryRouter>
        <FriendsSectionView
          plans={[]}
          people={[{ id: 'p1', name: 'Ana García', avatarUrl: null }]}
          onOpen={vi.fn()}
          onFind={vi.fn()}
          onOpenPerson={onOpenPerson}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByText('Busca a tus amigos')).not.toBeInTheDocument();
    expect(screen.getByText('La gente que sigues aún no ha marcado conciertos.')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Ana'));
    expect(onOpenPerson).toHaveBeenCalledWith('p1');
  });

  it('shows each concert with who is going', () => {
    const plans: FriendPlan[] = [
      {
        event: { id: 'e1', name: 'Concierto', starts_at: '2026-12-01T21:00:00Z' } as FriendPlan['event'],
        friends: [friend('a', 'Ana'), friend('b', 'Luis')],
      },
    ];
    render(
      <MemoryRouter>
        <FriendsSectionView plans={plans} onOpen={vi.fn()} onFind={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Gente que sigues')).toBeInTheDocument();
    expect(screen.getByText('2 personas')).toBeInTheDocument();
    expect(screen.queryByText('Busca a tus amigos')).not.toBeInTheDocument();
  });
});
