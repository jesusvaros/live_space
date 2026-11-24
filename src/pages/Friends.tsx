import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import ShareSheet from '../components/ShareSheet';
import { IconShare } from '../components/icons';
import Avatar from '../components/ui/Avatar';
import DetailHeader from '../components/ui/DetailHeader';
import { useAuth } from '../contexts/AuthContext';
import FollowPersonButton from '../features/friends/FollowPersonButton';
import { friendsService, type Person, type Relation } from '../services/friends.service';

// Perfil → «Amigos» (/amigos): find people by name or @usuario, follow them,
// and share your own profile. Friends = you follow each other.

type Row = Person & Relation;

const PersonRow: React.FC<{ person: Row; mySubjectId: string | null; onChange: (relation: Relation) => void; onOpen: () => void }> = ({
  person,
  mySubjectId,
  onChange,
  onOpen,
}) => (
  <li className="flex items-center gap-3 py-2">
    <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
      <Avatar name={person.name} src={person.avatarUrl} className="h-11 w-11 text-[15px]" />
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-semibold text-app-ink">{person.name}</span>
        {person.username ? <span className="block truncate text-[13px] text-white/50">@{person.username}</span> : null}
      </span>
    </button>
    {mySubjectId && person.subjectId ? (
      <FollowPersonButton mySubjectId={mySubjectId} theirSubjectId={person.subjectId} relation={person} onChange={onChange} />
    ) : null}
  </li>
);

const Friends: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const contentRef = useRef<HTMLElement | null>(null);
  const mySubjectId = profile?.subject_id ?? null;
  const [query, setQuery] = useState('');
  const [mine, setMine] = useState<Row[]>([]);
  const [found, setFound] = useState<Row[]>([]);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (!mySubjectId) return;
    friendsService.myPeople(mySubjectId).then(setMine).catch(() => undefined);
  }, [mySubjectId]);

  useEffect(() => {
    const term = query.trim();
    if (term.replace(/^@+/, '').length < 2) {
      setFound([]);
      return undefined;
    }
    let live = true;
    const timer = window.setTimeout(() => {
      friendsService
        .search(term, user?.id)
        .then(people => {
          if (!live) return;
          const known = new Map(mine.map(person => [person.id, person]));
          setFound(people.map(person => ({ ...person, iFollow: false, followsMe: false, ...known.get(person.id) })));
        })
        .catch(() => undefined);
    }, 250);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [query, user?.id, mine]);

  const update = (id: string, relation: Relation) => {
    const apply = (rows: Row[]) => rows.map(row => (row.id === id ? { ...row, ...relation } : row));
    setMine(apply);
    setFound(apply);
  };

  const friends = useMemo(() => mine.filter(person => person.iFollow && person.followsMe), [mine]);
  const others = useMemo(() => mine.filter(person => !(person.iFollow && person.followsMe)), [mine]);
  const searching = query.trim().replace(/^@+/, '').length >= 2;
  const myLink = user ? `${window.location.origin}/profile/${user.id}` : '';

  const list = (rows: Row[]) => (
    <ul className="flex flex-col">
      {rows.map(person => (
        <PersonRow
          key={person.id}
          person={person}
          mySubjectId={mySubjectId}
          onChange={relation => update(person.id, relation)}
          onOpen={() => navigate(`/profile/${person.id}`)}
        />
      ))}
    </ul>
  );

  return (
    <AppShell headerProps={null} contentRef={contentRef}>
      <DetailHeader title="Amigos" scrollRef={contentRef} fallbackHref="/tabs/profile" />
      <div className="mx-auto flex max-w-lg flex-col gap-6 px-4 pb-[calc(40px+env(safe-area-inset-bottom,0px))] pt-[calc(72px+env(safe-area-inset-top,0px))]">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-bold text-app-ink">Amigos</h1>
          <button
            type="button"
            onClick={() => setSharing(true)}
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-app-line px-3.5 text-[13px] font-semibold text-app-ink"
          >
            <IconShare size={16} /> Tu perfil
          </button>
        </div>

        <input
          type="search"
          inputMode="search"
          enterKeyHint="search"
          aria-label="Buscar personas"
          placeholder="Nombre o @usuario"
          value={query}
          onChange={event => setQuery(event.target.value)}
          className="h-12 w-full rounded-full border border-app-line bg-app-surface px-4 text-[15px] text-app-ink outline-none placeholder:text-white/40 focus:border-app-accent/70"
        />

        {searching ? (
          found.length ? list(found) : <p className="text-sm text-white/50">Nadie con ese nombre.</p>
        ) : (
          <>
            {friends.length ? (
              <section className="flex flex-col gap-1">
                <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">Os seguís</h2>
                {list(friends)}
              </section>
            ) : null}
            {others.length ? (
              <section className="flex flex-col gap-1">
                <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">Más gente</h2>
                {list(others)}
              </section>
            ) : null}
            {mine.length === 0 ? (
              <p className="text-sm text-white/55">Cuando os sigáis, verás a qué conciertos van.</p>
            ) : null}
          </>
        )}
      </div>
      <ShareSheet isOpen={sharing} onClose={() => setSharing(false)} link={myLink} kind="profile" />
    </AppShell>
  );
};

export default Friends;
