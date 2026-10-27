import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../api';
import AppShell from '../components/AppShell';
import { Spinner } from '../components/ui/AppPrimitives';
import DetailHeader from '../components/ui/DetailHeader';
import GeneratedPoster from '../components/ui/GeneratedPoster';
import MomentGrid from '../components/ui/MomentGrid';
import PhotoCredit from '../components/ui/PhotoCredit';
import ClaimProfileLink from '../components/pro/ClaimProfileLink';
import { IconCheckCircle, IconEdit, IconFlag } from '../components/icons';
import { useAuth } from '../contexts/AuthContext';
import type { EventListItem } from '../features/events/types';
import { getPrimaryArtistName } from '../features/events/utils';
import { useRouteEntityId } from '../hooks/useRouteEntityId';
import type { PostWithSetlist } from '../lib/types';
import { Festival, festivalDateRange, festivalService } from '../services/festival.service';
import { socialService } from '../services/social.service';

const madridDay = (iso: string) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
const madridTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
// A set before 06:00 belongs to the previous night of the festival.
const festivalNight = (iso: string) => {
  const date = new Date(iso);
  const hour = Number(date.toLocaleTimeString('es-ES', { hour: '2-digit', hour12: false, timeZone: 'Europe/Madrid' }));
  return hour < 6 ? madridDay(new Date(date.getTime() - 6 * 3600 * 1000).toISOString()) : madridDay(iso);
};
const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00`)
    .toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
    .replace(/^\w/, letter => letter.toUpperCase());

// A festival edition: dates and place, the line-up by night and stage (each
// set is an ordinary concert page) and everything the audience recorded.
const FestivalDetail: React.FC = () => {
  const id = useRouteEntityId();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const contentRef = useRef<HTMLElement | null>(null);

  const [festival, setFestival] = useState<Festival | null>(null);
  const [sets, setSets] = useState<EventListItem[]>([]);
  const [moments, setMoments] = useState<PostWithSetlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [canManage, setCanManage] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const next = await festivalService.get(id);
        if (cancelled) return;
        if (!next) {
          setError('Festival no encontrado.');
          setFestival(null);
          return;
        }
        setFestival(next);
        const [setRows, manage, following] = await Promise.all([
          festivalService.listSets(next.id).catch(() => []),
          user ? festivalService.canManage(next.id) : Promise.resolve(false),
          profile?.subject_id ? socialService.isFollowing(profile.subject_id, next.subjectId).catch(() => false) : Promise.resolve(false),
        ]);
        if (cancelled) return;
        setSets(setRows);
        setCanManage(manage);
        setIsFollowing(following);

        const setIds = setRows.map(set => set.id);
        if (setIds.length > 0) {
          const { data } = await supabase
            .from('v_post_cards')
            .select('*')
            .in('event_id', setIds)
            .order('created_at', { ascending: false })
            .limit(24);
          if (!cancelled) setMoments((data || []) as unknown as PostWithSetlist[]);
        } else {
          setMoments([]);
        }
      } catch {
        if (!cancelled) setError('No se ha podido cargar el festival.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [id, user, profile?.subject_id]);

  // Night → stage → sets in time order.
  const nights = useMemo(() => {
    const byNight = new Map<string, EventListItem[]>();
    for (const set of sets) {
      const night = festivalNight(set.starts_at);
      byNight.set(night, [...(byNight.get(night) || []), set]);
    }
    return [...byNight.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([night, list]) => {
        const stages = new Map<string, EventListItem[]>();
        for (const set of list) {
          const stage = set.room || '';
          stages.set(stage, [...(stages.get(stage) || []), set]);
        }
        return { night, stages: [...stages.entries()].sort(([left], [right]) => left.localeCompare(right, 'es')) };
      });
  }, [sets]);

  const toggleFollow = async () => {
    if (!festival) return;
    if (!user || !profile?.subject_id) {
      navigate('/welcome');
      return;
    }
    setFollowLoading(true);
    try {
      if (isFollowing) await socialService.unfollow(profile.subject_id, festival.subjectId);
      else await socialService.follow(profile.subject_id, festival.subjectId);
      setIsFollowing(!isFollowing);
    } finally {
      setFollowLoading(false);
    }
  };

  return (
    <AppShell headerProps={null} contentRef={contentRef}>
      <DetailHeader title={festival?.name || 'Festival'} scrollRef={contentRef} fallbackHref="/tabs/events" />
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      ) : null}
      {!loading && error ? <p className="p-4 text-sm text-rose-400">{error}</p> : null}

      {!loading && festival ? (
        <div className="pb-[calc(32px+env(safe-area-inset-bottom,0px))]">
          <section className="relative h-[340px] w-full overflow-hidden">
            {festival.coverImageUrl ? (
              <img src={festival.coverImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <GeneratedPoster title={festival.name} variant="hero" />
            )}
            <div className="absolute inset-0 bg-[linear-gradient(to_top,#0d0e12_4%,rgba(13,14,18,0.2)_60%,rgba(13,14,18,0.5))]" />
            <div className="absolute inset-x-4 bottom-1.5">
              <PhotoCredit credit={festival.coverCredit} className="mb-2" />
              <p className="flex items-center gap-1.5 font-mono text-[12px] font-semibold uppercase tracking-[0.06em] text-app-accent">
                <IconFlag size={14} />
                {['Festival', festivalDateRange(festival), festival.city].join(' · ')}
              </p>
              <h1 className={`mt-1.5 font-poster leading-[0.86] text-app-ink ${festival.name.length > 16 ? 'text-[44px]' : 'text-[60px]'}`}>
                {festival.name}
              </h1>
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-2 px-4 pt-3.5">
            <button
              type="button"
              aria-pressed={isFollowing}
              disabled={followLoading}
              onClick={toggleFollow}
              className={`inline-flex min-h-[46px] items-center gap-1.5 rounded-full px-[18px] text-[15px] font-bold transition disabled:opacity-60 ${
                isFollowing ? 'border border-app-line bg-app-surface text-app-ink' : 'bg-app-accent text-[#14151a]'
              }`}
            >
              {isFollowing ? <IconCheckCircle size={16} className="text-[#25d47b]" /> : null}
              {isFollowing ? 'Siguiendo' : 'Seguir'}
            </button>
            {canManage ? (
              <Link
                to={`/gestion/festival/${festival.id}`}
                className="inline-flex min-h-[46px] items-center gap-1.5 rounded-full border border-app-line px-[18px] text-[15px] font-semibold text-app-ink"
              >
                <IconEdit size={16} />
                Editar horario
              </Link>
            ) : null}
            {festival.websiteUrl ? (
              <a
                href={festival.websiteUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-[46px] items-center rounded-full border border-app-line px-[18px] text-[15px] font-semibold text-app-ink"
              >
                Web
              </a>
            ) : null}
          </div>

          {festival.description ? <p className="px-4 pt-4 text-[15px] leading-relaxed text-[#c9c5bd]">{festival.description}</p> : null}

          <section className="px-4 pt-6">
            <h2 className="mb-1 font-display text-xl font-bold text-app-ink">Cartel</h2>
            {nights.length === 0 ? (
              <p className="text-sm text-white/55">
                El horario aún no está publicado.{canManage ? ' Añádelo desde «Editar horario».' : ''}
              </p>
            ) : (
              nights.map(({ night, stages }) => (
                <div key={night} className="pt-4">
                  <h3 className="font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-app-accent">{dayLabel(night)}</h3>
                  {stages.map(([stage, list]) => (
                    <div key={stage || 'main'} className="pt-2">
                      {stage ? <p className="pb-1 text-xs font-semibold uppercase tracking-[0.06em] text-[#8f8b84]">{stage}</p> : null}
                      <ul className="overflow-hidden rounded-2xl border border-app-line bg-app-surface">
                        {list.map(set => (
                          <li key={set.id} className="border-b border-app-line last:border-b-0">
                            <button
                              type="button"
                              onClick={() => navigate(`/event/${set.id}`)}
                              className="flex min-h-[52px] w-full items-center gap-3 px-3.5 text-left"
                            >
                              <span className="w-12 shrink-0 font-mono text-[13px] font-semibold text-app-ink">{madridTime(set.starts_at)}</span>
                              <span className="min-w-0 flex-1 truncate font-display text-[15px] font-bold text-app-ink">
                                {getPrimaryArtistName(set)}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ))
            )}
          </section>

          <section className="px-4 pt-6">
            <h2 className="mb-2.5 font-display text-xl font-bold text-app-ink">Grabado aquí</h2>
            {moments.length === 0 ? (
              <p className="text-sm text-white/55">Todavía nadie ha subido nada de este festival.</p>
            ) : (
              <MomentGrid moments={moments} />
            )}
          </section>

          {canManage ? null : (
            <ClaimProfileLink type="festival" entityId={festival.id} subjectId={festival.subjectId} className="px-4 pt-6" />
          )}
        </div>
      ) : null}
    </AppShell>
  );
};

export default FestivalDetail;
