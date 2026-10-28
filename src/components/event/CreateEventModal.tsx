import React, { useRef } from 'react';
import Button from '../ui/Button';
import { Spinner } from '../ui/AppPrimitives';
import { ConcertWorkspace, useCreateEventForm } from '../../hooks/useCreateEventForm';
import { CreateConcertResult } from '../../services/concerts.service';

type CreateEventModalProps = {
  onDismiss: () => void;
  onCreated?: (result: CreateConcertResult) => void;
  userId?: string | null;
  workspace: ConcertWorkspace | null;
};

const fieldClass =
  'min-h-12 w-full rounded-xl border border-app-line bg-app-bg px-3.5 text-[15px] text-app-ink placeholder:text-white/35 focus:border-app-accent focus:outline-none';
const labelClass = 'text-sm font-semibold text-app-ink';
const chipClass =
  'inline-flex min-h-11 items-center gap-2 rounded-full border border-app-line bg-app-surface px-3.5 text-sm font-semibold text-app-ink';

const CreateEventModal: React.FC<CreateEventModalProps> = ({ onDismiss, onCreated, userId, workspace }) => {
  const form = useCreateEventForm({ userId, workspace });
  const fileRef = useRef<HTMLInputElement | null>(null);
  const isArtist = workspace?.type === 'artist';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const created = await form.submit();
    if (created && created.status === 'published') onCreated?.(created);
  };

  if (form.result && form.result.status !== 'published') {
    const waitsForVenue = form.result.reviewer === 'venue';
    return (
      <div className="flex h-full flex-col items-start justify-center gap-4 bg-app-bg px-5 text-app-ink">
        <p className="font-mono text-[11px] font-semibold uppercase text-amber-300">Propuesta enviada</p>
        <h2 className="font-display text-2xl font-bold">
          {waitsForVenue ? `Ahora decide ${form.venue?.name || 'la sala'}` : 'Lo revisamos y te avisamos'}
        </h2>
        <p className="text-sm text-white/70">
          {waitsForVenue
            ? 'Quien gestiona la sala verá tu propuesta en su panel y podrá aceptarla o rechazarla. Mientras tanto no aparece en la agenda.'
            : 'Una persona del equipo revisa el concierto antes de publicarlo (la sala aún no está verificada en Live Space).'}
        </p>
        <p className="text-sm text-white/70">Puedes seguir el estado en tu panel de gestión.</p>
        <Button onClick={onDismiss}>Volver al panel</Button>
      </div>
    );
  }

  return (
    <form className="flex h-full flex-col bg-app-bg text-app-ink" onSubmit={handleSubmit}>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-app-line px-4 pb-3 pt-[calc(12px+env(safe-area-inset-top,0px))]">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-bold">Añadir concierto</h2>
          <p className="truncate text-xs text-white/55">
            {isArtist
              ? 'Si la sala está en Live Space, la propuesta le llega para que la acepte.'
              : 'Se publica al momento en la agenda de tu sala.'}
          </p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={onDismiss}>
          Cerrar
        </Button>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {/* Venue */}
        <section className="space-y-2">
          <p className={labelClass}>Sala</p>
          {form.venue ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-app-accent/40 bg-app-accent/[0.08] px-3.5 py-2.5">
              <span className="min-w-0">
                <span className="block truncate font-semibold">{form.venue.name}</span>
                {form.venue.city ? <span className="text-xs text-white/55">{form.venue.city}</span> : null}
              </span>
              {!form.venueLocked ? (
                <button type="button" className="min-h-11 shrink-0 px-2 text-sm font-semibold text-app-accent" onClick={() => form.chooseVenue(null)}>
                  Cambiar
                </button>
              ) : null}
            </div>
          ) : (
            <>
              <input
                className={fieldClass}
                value={form.venueQuery}
                onChange={e => form.setVenueQuery(e.target.value)}
                placeholder="Busca la sala por nombre o ciudad"
                autoComplete="off"
                enterKeyHint="search"
              />
              {form.venueSearching ? <Spinner className="h-4 w-4" /> : null}
              {form.venueResults.length ? (
                <ul className="overflow-hidden rounded-xl border border-app-line">
                  {form.venueResults.map(option => (
                    <li key={option.id} className="border-b border-app-line last:border-b-0">
                      <button
                        type="button"
                        className="flex min-h-12 w-full items-center justify-between gap-3 px-3.5 text-left hover:bg-white/5"
                        onClick={() => form.chooseVenue(option)}
                      >
                        <span className="truncate font-semibold">{option.name}</span>
                        <span className="shrink-0 text-xs text-white/55">{option.city}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {!form.venueSearching && form.venueQuery.trim().length >= 2 && !form.venueResults.length ? (
                <p className="text-xs text-white/55">No encontramos esa sala. Escríbenos y la damos de alta.</p>
              ) : null}
            </>
          )}
        </section>

        {/* Day and time */}
        <section className="grid grid-cols-[1fr_7.5rem] gap-3">
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Día</span>
            <input type="date" className={fieldClass} value={form.date} onChange={e => form.setDate(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Hora</span>
            <input type="time" className={fieldClass} value={form.time} onChange={e => form.setTime(e.target.value)} required />
          </label>
        </section>

        {/* Line-up */}
        <section className="space-y-2">
          <p className={labelClass}>Cartel</p>
          {form.lineup.length ? (
            <ul className="flex flex-wrap gap-2">
              {form.lineup.map((pick, index) => {
                const own = pick.id !== null && pick.id === form.ownArtistId;
                return (
                  <li key={`${pick.id ?? 'new'}-${pick.name}`} className={chipClass}>
                    <span className="max-w-[12rem] truncate">{pick.name}</span>
                    {!pick.id ? <span className="font-mono text-[10px] uppercase text-white/45">nuevo</span> : null}
                    {own ? (
                      <span className="font-mono text-[10px] uppercase text-white/45">tú</span>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Quitar ${pick.name}`}
                        className="-mr-1.5 flex h-8 w-8 items-center justify-center rounded-full text-white/60 hover:text-white"
                        onClick={() => form.removeArtist(index)}
                      >
                        ×
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : null}
          <input
            className={fieldClass}
            value={form.artistQuery}
            onChange={e => form.setArtistQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const first = form.artistSuggestions[0];
                if (first) form.addArtist({ id: first.id, name: first.name });
                else if (form.canAddNewArtist) form.addArtist({ id: null, name: form.artistQuery.trim() });
              }
            }}
            placeholder={form.lineup.length ? 'Añade otro artista' : 'Busca un artista'}
            autoComplete="off"
            enterKeyHint="done"
          />
          {form.artistSearching ? <Spinner className="h-4 w-4" /> : null}
          {form.artistSuggestions.length || form.canAddNewArtist ? (
            <ul className="overflow-hidden rounded-xl border border-app-line">
              {form.artistSuggestions.map(option => (
                <li key={option.id} className="border-b border-app-line last:border-b-0">
                  <button
                    type="button"
                    className="flex min-h-12 w-full items-center gap-3 px-3.5 text-left hover:bg-white/5"
                    onClick={() => form.addArtist({ id: option.id, name: option.name })}
                  >
                    {option.avatar_url ? (
                      <img src={option.avatar_url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                    ) : (
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold">
                        {option.name[0]?.toUpperCase()}
                      </span>
                    )}
                    <span className="truncate font-semibold">{option.name}</span>
                  </button>
                </li>
              ))}
              {form.canAddNewArtist ? (
                <li>
                  <button
                    type="button"
                    className="flex min-h-12 w-full items-center px-3.5 text-left text-sm font-semibold text-app-accent hover:bg-white/5"
                    onClick={() => form.addArtist({ id: null, name: form.artistQuery.trim() })}
                  >
                    + Añadir «{form.artistQuery.trim()}»
                  </button>
                </li>
              ) : null}
            </ul>
          ) : null}
        </section>

        {/* Optional */}
        <details className="group rounded-xl border border-app-line px-3.5" open={Boolean(form.name || form.ticketUrl || form.posterFile)}>
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between text-sm font-semibold">
            Nombre, entradas y cartel
            <span className="font-mono text-[11px] uppercase text-white/45">opcional</span>
          </summary>
          <div className="space-y-3 pb-4">
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>Nombre del concierto</span>
              <input
                className={fieldClass}
                value={form.name}
                onChange={e => form.setName(e.target.value)}
                placeholder={form.defaultName || 'Por defecto, el cartel'}
                maxLength={160}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>Enlace de entradas</span>
              <input
                type="url"
                inputMode="url"
                className={fieldClass}
                value={form.ticketUrl}
                onChange={e => form.setTicketUrl(e.target.value)}
                placeholder="https://"
              />
            </label>
            <div className="flex items-center gap-3">
              <div className="h-20 w-16 shrink-0 overflow-hidden rounded-lg border border-app-line bg-app-surface">
                {form.posterPreview ? <img src={form.posterPreview} alt="Cartel" className="h-full w-full object-cover" /> : null}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0] || null;
                  form.setPosterFile(file);
                  e.target.value = '';
                }}
              />
              <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                {form.posterFile ? 'Cambiar cartel' : 'Subir cartel'}
              </Button>
              {form.posterFile ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => form.setPosterFile(null)}>
                  Quitar
                </Button>
              ) : null}
            </div>
          </div>
        </details>
      </div>

      <footer className="shrink-0 space-y-2 border-t border-app-line px-4 pb-[calc(12px+env(safe-area-inset-bottom,0px))] pt-3">
        {form.error ? (
          <p role="alert" className="text-sm text-rose-300">
            {form.error}
          </p>
        ) : null}
        <Button type="submit" block size="lg" disabled={form.saving}>
          {form.saving ? <Spinner className="h-4 w-4" /> : null}
          {form.saving ? 'Guardando…' : isArtist ? 'Enviar propuesta' : 'Publicar concierto'}
        </Button>
      </footer>
    </form>
  );
};

export default CreateEventModal;
