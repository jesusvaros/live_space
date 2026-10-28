import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Button from '../components/ui/Button';
import { Spinner } from '../components/ui/AppPrimitives';
import { IconChevronLeft } from '../components/icons';
import type { EventListItem } from '../features/events/types';
import { getPrimaryArtistName } from '../features/events/utils';
import { Festival, festivalService } from '../services/festival.service';
import { canGoBack } from '../app/useGoBack';

const fieldClass =
  'min-h-12 w-full rounded-xl border border-app-line bg-app-surface px-3.5 text-[15px] text-app-ink placeholder:text-white/35 focus:border-app-accent focus:outline-none';

const madridParts = (iso: string) => {
  const date = new Date(iso);
  return {
    day: date.toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }),
    time: date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }),
  };
};

// "2026-06-12" + "01:30" → ISO instant in Madrid time. A set after midnight is
// entered under the night it belongs to and lands on the next calendar day.
const madridOffsetMinutes = (date: Date) =>
  (Date.parse(date.toLocaleString('en-US', { timeZone: 'Europe/Madrid' })) -
    Date.parse(date.toLocaleString('en-US', { timeZone: 'UTC' }))) /
  60000;

const madridInstant = (night: string, time: string) => {
  const [hour, minute] = time.split(':').map(Number);
  const [year, month, day] = night.split('-').map(Number);
  const wallClock = Date.UTC(year, month - 1, day + (hour < 6 ? 1 : 0), hour, minute);
  return new Date(wallClock - madridOffsetMinutes(new Date(wallClock)) * 60000).toISOString();
};

const festivalDays = (festival: Festival) => {
  const days: string[] = [];
  const cursor = new Date(`${festival.startsOn}T12:00:00Z`);
  const end = new Date(`${festival.endsOn}T12:00:00Z`);
  while (cursor <= end && days.length < 31) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
};

const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '');

type Draft = { eventId: string | null; artist: string; day: string; time: string; stage: string };

// Organisers write the line-up set by set: artist, night, time and stage.
// Each set becomes a concert page where the audience uploads its moments.
const FestivalTimetable: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [festival, setFestival] = useState<Festival | null>(null);
  const [sets, setSets] = useState<EventListItem[]>([]);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const [next, manage] = await Promise.all([festivalService.get(id), festivalService.canManage(id)]);
      setFestival(next);
      setAllowed(manage);
      if (next && manage) setSets(await festivalService.listSets(next.id));
    } catch (err: any) {
      setError(err?.message || 'No se ha podido cargar el festival.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const days = useMemo(() => (festival ? festivalDays(festival) : []), [festival]);
  const stages = useMemo(() => [...new Set(sets.map(set => set.room).filter(Boolean) as string[])].sort(), [sets]);

  const startDraft = (set?: EventListItem) => {
    if (!festival) return;
    if (set) {
      const { day, time } = madridParts(set.starts_at);
      const hour = Number(time.slice(0, 2));
      // Show an after-midnight set under its night.
      const night = hour < 6 ? new Date(new Date(`${day}T12:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10) : day;
      setDraft({ eventId: set.id, artist: getPrimaryArtistName(set), day: night, time, stage: set.room || '' });
    } else {
      setDraft({ eventId: null, artist: '', day: days[0], time: '20:00', stage: stages[0] || '' });
    }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!festival || !draft || !draft.artist.trim()) return;
    setSaving(true);
    setError('');
    try {
      await festivalService.saveSet({
        festivalId: festival.id,
        eventId: draft.eventId,
        artistName: draft.artist,
        startsAt: madridInstant(draft.day, draft.time),
        stage: draft.stage,
      });
      setDraft(null);
      setSets(await festivalService.listSets(festival.id));
    } catch (err: any) {
      setError(err?.message || 'No se ha podido guardar.');
    } finally {
      setSaving(false);
    }
  };

  const cancelSet = async (set: EventListItem) => {
    if (!festival) return;
    setSaving(true);
    try {
      await festivalService.cancelSet(set.id);
      setSets(await festivalService.listSets(festival.id));
    } catch (err: any) {
      setError(err?.message || 'No se ha podido cancelar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-app-bg pb-[calc(32px+env(safe-area-inset-bottom,0px))] text-app-ink">
      <header className="flex items-center gap-3 px-3 pb-2 pt-[calc(10px+env(safe-area-inset-top,0px))]">
        <button
          type="button"
          onClick={() => (canGoBack() ? navigate(-1) : navigate(festival ? `/tabs/festival/${festival.id}` : '/tabs/events', { replace: true }))}
          aria-label="Volver"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-app-line bg-app-surface text-app-ink"
        >
          <IconChevronLeft size={22} />
        </button>
        <div className="min-w-0">
          <p className="font-mono text-[11px] font-semibold uppercase text-[#8f8b84]">Horario</p>
          <h1 className="truncate font-display text-lg font-bold">{festival?.name || 'Festival'}</h1>
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : null}
      {!loading && (!festival || !allowed) ? (
        <p className="px-4 pt-6 text-sm text-white/60">No tienes acceso a la gestión de este festival.</p>
      ) : null}

      {!loading && festival && allowed ? (
        <div className="px-4">
          {error ? <p className="py-2 text-sm text-rose-400">{error}</p> : null}

          {draft ? (
            <form onSubmit={save} className="mt-2 flex flex-col gap-3 rounded-2xl border border-app-accent bg-app-surface p-3.5">
              <label className="flex flex-col gap-1 text-sm font-semibold">
                Artista
                <input
                  className={fieldClass}
                  value={draft.artist}
                  onChange={event => setDraft({ ...draft, artist: event.target.value })}
                  placeholder="Nombre del grupo o artista"
                  autoFocus
                  required
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-sm font-semibold">
                  Noche
                  <select className={fieldClass} value={draft.day} onChange={event => setDraft({ ...draft, day: event.target.value })}>
                    {days.map(day => (
                      <option key={day} value={day}>
                        {dayLabel(day)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm font-semibold">
                  Hora
                  <input
                    type="time"
                    className={fieldClass}
                    value={draft.time}
                    onChange={event => setDraft({ ...draft, time: event.target.value })}
                    required
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1 text-sm font-semibold">
                Escenario
                <input
                  className={fieldClass}
                  value={draft.stage}
                  list="festival-stages"
                  onChange={event => setDraft({ ...draft, stage: event.target.value })}
                  placeholder="Opcional"
                />
                <datalist id="festival-stages">
                  {stages.map(stage => (
                    <option key={stage} value={stage} />
                  ))}
                </datalist>
              </label>
              <p className="text-xs text-white/50">Después de medianoche, déjalo en la noche que corresponde: «01:30» del viernes es la madrugada del sábado.</p>
              <div className="flex gap-2">
                <Button type="submit" disabled={saving} className="flex-1">
                  {draft.eventId ? 'Guardar cambios' : 'Añadir al horario'}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setDraft(null)}>
                  Cancelar
                </Button>
              </div>
            </form>
          ) : (
            <Button onClick={() => startDraft()} className="mt-2 w-full">
              + Añadir actuación
            </Button>
          )}

          {!festival.venuePlaceId ? (
            <p className="pt-3 text-sm text-amber-300">Falta el recinto del festival: escríbenos para añadirlo antes de publicar el horario.</p>
          ) : null}

          <ul className="mt-4 flex flex-col gap-2">
            {sets.map(set => {
              const { day, time } = madridParts(set.starts_at);
              return (
                <li key={set.id} className="flex items-center gap-3 rounded-2xl border border-app-line bg-app-surface px-3.5 py-2.5">
                  <span className="w-[84px] shrink-0 font-mono text-[12px] font-semibold uppercase text-app-accent">
                    {dayLabel(day)} {time}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-[15px] font-bold">{getPrimaryArtistName(set)}</span>
                    {set.room ? <span className="block truncate text-xs text-[#8f8b84]">{set.room}</span> : null}
                  </span>
                  <button type="button" onClick={() => startDraft(set)} className="min-h-11 px-2 text-sm font-semibold text-app-ink">
                    Editar
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => cancelSet(set)}
                    className="min-h-11 px-2 text-sm font-semibold text-rose-300 disabled:opacity-50"
                  >
                    Quitar
                  </button>
                </li>
              );
            })}
          </ul>
          {sets.length === 0 ? <p className="pt-4 text-sm text-white/55">Aún no hay actuaciones en el horario.</p> : null}
        </div>
      ) : null}
    </div>
  );
};

export default FestivalTimetable;
