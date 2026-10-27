import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Avatar from '../components/ui/Avatar';
import Button from '../components/ui/Button';
import GeneratedPoster from '../components/ui/GeneratedPoster';
import { Spinner } from '../components/ui/AppPrimitives';
import { IconChevronLeft } from '../components/icons';
import EventEditForm from '../components/pro/EventEditForm';
import SetlistEditor from '../components/pro/SetlistEditor';
import { EntityStatsSummary, EventStatsCard } from '../features/community';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { ManagedEntity } from '../lib/types';
import { claimsService } from '../services/claims.service';
import { eventManagementService, ManagedEvent } from '../services/eventManagement.service';

type Panel = 'edit' | 'setlist' | 'stats';
// An event counts as upcoming until six hours after it starts.
const ONGOING_MS = 6 * 60 * 60 * 1000;

const entityName = (entity: ManagedEntity) => entity.artist?.name || entity.venue?.name || 'Perfil';
const entityId = (entity: ManagedEntity) => (entity.type === 'artist' ? entity.artist?.id : entity.venue?.id) || null;

const formatEventDate = (iso: string) => {
  const date = new Date(iso);
  const day = date
    .toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' })
    .replace(/\./g, '')
    .replace(',', '');
  const time = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
  return `${day} · ${time}`.toUpperCase();
};

const Management: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { managedEntities, activeWorkspace, setActiveWorkspace, loading: workspaceLoading, ready } = useWorkspace();

  const entity = activeWorkspace && activeWorkspace.type !== 'user' ? activeWorkspace : null;
  const currentEntityId = entity ? entityId(entity) : null;

  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [events, setEvents] = useState<ManagedEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [pendingClaims, setPendingClaims] = useState<Array<{ id: string; name: string; type: string }>>([]);

  const entityChoices = managedEntities.filter(item => item.type === 'artist' || item.type === 'venue');

  // With one profile to manage, open it straight away.
  useEffect(() => {
    if (!entity && ready && entityChoices.length === 1) setActiveWorkspace(entityChoices[0]);
  }, [entity, ready, entityChoices, setActiveWorkspace]);

  useEffect(() => {
    if (!user?.id) return;
    claimsService.listMinePending(user.id).then(setPendingClaims).catch(() => setPendingClaims([]));
  }, [user?.id]);

  const loadEvents = useCallback(async () => {
    if (!entity || !currentEntityId) return;
    setLoading(true);
    setError('');
    try {
      setEvents(await eventManagementService.listEvents(entity.type as 'artist' | 'venue', currentEntityId));
    } catch (err: any) {
      setError(err?.message || 'No se han podido cargar los eventos.');
    } finally {
      setLoading(false);
    }
  }, [entity?.type, currentEntityId]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const next = events.filter(event => new Date(event.starts_at).getTime() + ONGOING_MS >= now);
    const done = events.filter(event => new Date(event.starts_at).getTime() + ONGOING_MS < now).reverse();
    return { upcoming: next, past: done };
  }, [events]);

  const visible = tab === 'upcoming' ? upcoming : past;

  const goBack = () => {
    if (window.history.state && window.history.state.idx > 0) navigate(-1);
    else navigate('/tabs/profile', { replace: true });
  };

  const toggle = (eventId: string, nextPanel: Panel) => {
    if (selectedId === eventId && panel === nextPanel) {
      setPanel(null);
      return;
    }
    setSelectedId(eventId);
    setPanel(nextPanel);
  };

  const header = (
    <header className="flex items-center gap-3 px-3 pb-1 pt-[calc(10px+env(safe-area-inset-top,0px))]">
      <button
        type="button"
        onClick={goBack}
        aria-label="Volver"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-app-line bg-app-surface text-app-ink"
      >
        <IconChevronLeft size={22} />
      </button>
      {entity ? (
        <>
          <Avatar
            name={entityName(entity)}
            src={entity.artist?.avatar_url || entity.venue?.photos?.[0] || null}
            rounded="xl"
            className="h-11 w-11 text-lg"
          />
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] font-semibold uppercase text-white/50">Gestionas</p>
            <p className="truncate font-display text-lg font-bold leading-tight text-app-ink">{entityName(entity)}</p>
          </div>
          <Link
            to={`/gestion/estadisticas?entidad=${encodeURIComponent(entity.subject_id)}`}
            className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-app-line px-3.5 text-[13px] font-semibold text-app-ink"
          >
            Estadísticas
          </Link>
          {entityChoices.length > 1 ? (
            <label className="relative">
              <span className="sr-only">Cambiar de perfil</span>
              <select
                className="min-h-11 max-w-28 appearance-none rounded-full border border-app-line bg-transparent px-3.5 text-[13px] font-semibold text-app-ink"
                value={entity.subject_id}
                onChange={event => {
                  const next = entityChoices.find(item => item.subject_id === event.target.value);
                  if (next) {
                    setSelectedId(null);
                    setPanel(null);
                    setActiveWorkspace(next);
                  }
                }}
              >
                {entityChoices.map(item => (
                  <option key={item.subject_id} value={item.subject_id}>{entityName(item)}</option>
                ))}
              </select>
            </label>
          ) : null}
        </>
      ) : (
        <h1 className="flex-1 font-display text-lg font-bold text-app-ink">Panel de gestión</h1>
      )}
    </header>
  );

  const pendingStrip = pendingClaims.length ? (
    <ul className="mx-4 mt-3 space-y-2">
      {pendingClaims.map(claim => (
        <li key={claim.id} className="rounded-xl border border-dashed border-app-line px-3 py-2.5 text-[13px] text-white/70">
          <span className="font-mono text-[11px] font-semibold uppercase text-amber-300">Pendiente de verificación</span>
          <span className="block">Tu solicitud para gestionar <strong className="text-app-ink">{claim.name}</strong> está en revisión.</span>
        </li>
      ))}
    </ul>
  ) : null;

  let body: React.ReactNode;
  if (!ready || workspaceLoading) {
    body = <div className="flex justify-center py-16"><Spinner /></div>;
  } else if (!entity) {
    body = entityChoices.length ? (
      <section className="space-y-2 px-4 pt-4">
        <p className="text-sm text-white/70">Elige qué perfil quieres gestionar.</p>
        {entityChoices.map(item => (
          <button
            key={item.subject_id}
            type="button"
            onClick={() => setActiveWorkspace(item)}
            className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-app-line bg-app-surface px-3 text-left"
          >
            <Avatar name={entityName(item)} rounded="xl" className="h-10 w-10 text-base" />
            <span className="flex-1">
              <span className="block font-semibold text-app-ink">{entityName(item)}</span>
              <span className="font-mono text-[11px] uppercase text-white/50">{item.type === 'venue' ? 'Sala' : 'Artista'}</span>
            </span>
          </button>
        ))}
      </section>
    ) : (
      <section className="space-y-3 px-4 pt-6">
        <h2 className="font-display text-xl font-bold text-app-ink">Todavía no gestionas ningún perfil</h2>
        <p className="text-sm text-white/70">
          Si eres artista o llevas una sala, busca tu perfil y pulsa «¿Eres tú? Gestiona este perfil». Una persona del
          equipo lo verifica.
        </p>
        <Button variant="secondary" onClick={() => navigate('/tabs/discover')}>Buscar mi perfil</Button>
      </section>
    );
  } else {
    body = (
      <>
        <EntityStatsSummary key={entity.subject_id} subjectId={entity.subject_id} className="mx-4 mt-4" />
        <div role="tablist" aria-label="Eventos" className="flex items-center gap-1.5 px-4 pt-4">
          {([
            ['upcoming', `Próximos${upcoming.length ? ` · ${upcoming.length}` : ''}`],
            ['past', `Pasados${past.length ? ` · ${past.length}` : ''}`],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`min-h-11 rounded-full px-3.5 text-sm font-semibold ${
                tab === key ? 'bg-app-ink text-app-bg' : 'border border-app-line text-white/70'
              }`}
            >
              {label}
            </button>
          ))}
          <Button
            size="sm"
            className="ml-auto font-bold"
            onClick={() => navigate('/tabs/create-event', { state: { from: '/gestion' } })}
          >
            + Evento
          </Button>
        </div>

        {error ? <p role="alert" className="mx-4 mt-4 text-sm text-rose-300">{error}</p> : null}
        {loading ? <div className="flex justify-center py-12"><Spinner /></div> : null}
        {!loading && !error && visible.length === 0 ? (
          <p className="mx-4 mt-6 text-sm text-white/60">
            {tab === 'upcoming' ? 'No hay conciertos próximos. Crea uno con «+ Evento».' : 'Aún no hay conciertos pasados.'}
          </p>
        ) : null}

        <ul className="flex flex-col gap-2.5 px-4 pt-3.5">
          {visible.map(event => {
            const selected = selectedId === event.id;
            const locked = (event.manager_locked_fields || []).length > 0;
            const performer = entity.type === 'artist' && entity.artist
              ? { id: entity.artist.id, name: entity.artist.name }
              : event.headliner;
            return (
              <li
                key={event.id}
                className={`overflow-hidden rounded-[18px] border bg-app-surface ${selected ? 'border-app-accent' : 'border-app-line'}`}
              >
                <button
                  type="button"
                  className="flex w-full items-center gap-3 p-3 text-left"
                  aria-expanded={selected}
                  onClick={() => {
                    setSelectedId(selected ? null : event.id);
                    setPanel(null);
                  }}
                >
                  <div className="relative h-[60px] w-12 shrink-0 overflow-hidden rounded-lg">
                    {event.image_url ? (
                      <img src={event.image_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <GeneratedPoster title={event.name} variant="thumb" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[11px] font-semibold text-app-accent">{formatEventDate(event.starts_at)}</p>
                    <p className="mt-0.5 truncate font-display text-base font-bold text-app-ink">{event.name}</p>
                    {locked ? (
                      <p className="mt-0.5 text-xs text-emerald-400">Editado por ti · el scraper no lo pisa</p>
                    ) : (
                      <p className="mt-0.5 truncate text-xs text-white/50">
                        {entity.type === 'artist' ? event.venue_name || event.city : event.headliner?.name || event.city}
                        {event.status !== 'published' ? ' · Borrador' : ''}
                      </p>
                    )}
                  </div>
                </button>
                {selected ? (
                  <>
                    <div className="grid grid-cols-4 border-t border-app-line">
                      {(['edit', 'setlist', 'stats'] as const).map(key => (
                        <button
                          key={key}
                          type="button"
                          aria-pressed={panel === key}
                          onClick={() => toggle(event.id, key)}
                          className={`min-h-12 border-r border-app-line text-[13px] font-semibold ${
                            panel === key ? 'bg-app-accent/[0.12] text-app-accent' : 'text-app-ink'
                          }`}
                        >
                          {key === 'edit' ? 'Editar' : key === 'setlist' ? 'Setlist' : 'Público'}
                        </button>
                      ))}
                      <Link
                        to={`/gestion/evento/${event.id}/qr`}
                        className="flex min-h-12 items-center justify-center text-[13px] font-semibold text-app-ink"
                      >
                        QR
                      </Link>
                    </div>
                    {panel === 'edit' ? (
                      <div className="border-t border-app-line">
                        <EventEditForm
                          key={`${event.id}-${event.starts_at}-${event.name}`}
                          event={event}
                          subjectId={entity.subject_id}
                          onSaved={loadEvents}
                        />
                      </div>
                    ) : null}
                    {panel === 'stats' ? (
                      <div className="border-t border-app-line p-3">
                        <EventStatsCard eventId={event.id} className="border-0 bg-transparent p-0" />
                        <p className="text-[13px] text-white/50 only:block [&:not(:only-child)]:hidden">
                          Aún no hay datos de público para este concierto.
                        </p>
                      </div>
                    ) : null}
                    {panel === 'setlist' && user ? (
                      <div className="border-t border-app-line">
                        <SetlistEditor
                          eventId={event.id}
                          performerArtistId={performer?.id ?? null}
                          performerName={performer?.name ?? null}
                          userId={user.id}
                        />
                      </div>
                    ) : null}
                  </>
                ) : null}
              </li>
            );
          })}
        </ul>
      </>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-app-bg text-app-ink">
      {header}
      <main className="min-h-0 flex-1 overflow-y-auto pb-[calc(32px+env(safe-area-inset-bottom,0px))]">
        {pendingStrip}
        {body}
      </main>
    </div>
  );
};

export default Management;
