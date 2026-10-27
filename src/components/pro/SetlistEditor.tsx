import React, { useEffect, useRef, useState } from 'react';
import Button from '../ui/Button';
import { Spinner } from '../ui/AppPrimitives';
import { eventManagementService, SetlistSong } from '../../services/eventManagement.service';

type SetlistEditorProps = {
  eventId: string;
  performerArtistId: string | null;
  performerName: string | null;
  userId: string;
};

const GripIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    {[6, 12, 18].map(y => (
      <React.Fragment key={y}>
        <circle cx="9" cy={y} r="1.6" />
        <circle cx="15" cy={y} r="1.6" />
      </React.Fragment>
    ))}
  </svg>
);

let localKey = 0;
const newKey = () => `new-${Date.now()}-${localKey++}`;

// Setlist of one concert: add, drag to reorder (or arrow keys on the handle),
// remove. Saved as a whole; each title becomes a song of the performer.
const SetlistEditor: React.FC<SetlistEditorProps> = ({ eventId, performerArtistId, performerName, userId }) => {
  const [songs, setSongs] = useState<SetlistSong[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    eventManagementService
      .getSetlist(eventId)
      .then(rows => {
        if (!cancelled) setSongs(rows);
      })
      .catch(() => {
        if (!cancelled) setMessage({ kind: 'error', text: 'No se ha podido cargar el setlist.' });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const update = (next: SetlistSong[]) => {
    setSongs(next);
    setDirty(true);
    setMessage(null);
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= songs.length || from === to) return;
    const next = [...songs];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    update(next);
  };

  const addSong = () => {
    const titles = draft
      .split('\n')
      .map(title => title.trim())
      .filter(Boolean);
    if (!titles.length) return;
    update([...songs, ...titles.map(title => ({ key: newKey(), title, songId: null }))]);
    setDraft('');
  };

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>, key: string) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragKey(key);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragKey || !listRef.current) return;
    const from = songs.findIndex(song => song.key === dragKey);
    const rows = Array.from(listRef.current.children) as HTMLElement[];
    const to = rows.findIndex(row => {
      const rect = row.getBoundingClientRect();
      return event.clientY >= rect.top && event.clientY <= rect.bottom;
    });
    if (from >= 0 && to >= 0 && to !== from) move(from, to);
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await eventManagementService.saveSetlist(eventId, performerArtistId, songs, userId);
      setSongs(await eventManagementService.getSetlist(eventId));
      setDirty(false);
      setMessage({ kind: 'ok', text: 'Setlist guardado.' });
    } catch (err: any) {
      setMessage({ kind: 'error', text: err?.message || 'No se ha podido guardar el setlist.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-3 px-3 pb-4 pt-3" aria-label="Setlist">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-display text-lg font-bold text-app-ink">Setlist</h3>
        <span className="text-xs text-white/50">Arrastra para ordenar</span>
      </div>
      {performerName ? (
        <p className="text-xs text-white/50">Canciones de {performerName}</p>
      ) : (
        <p className="text-xs text-amber-300">Este concierto no tiene artista en el cartel: los títulos se guardan sin enlazar a canciones.</p>
      )}

      {loading ? (
        <div className="flex justify-center py-4"><Spinner /></div>
      ) : (
        <ol ref={listRef} className="flex flex-col gap-1.5">
          {songs.map((song, index) => (
            <li
              key={song.key}
              className={`flex min-h-12 items-center gap-2 rounded-xl border bg-app-surface pl-1 pr-1 ${
                dragKey === song.key ? 'border-app-accent' : 'border-app-line'
              }`}
            >
              <button
                type="button"
                aria-label={`Mover ${song.title}. Usa las flechas arriba y abajo`}
                className="flex h-11 w-9 shrink-0 cursor-grab touch-none items-center justify-center text-white/45 active:cursor-grabbing"
                onPointerDown={event => onPointerDown(event, song.key)}
                onPointerMove={onPointerMove}
                onPointerUp={() => setDragKey(null)}
                onPointerCancel={() => setDragKey(null)}
                onKeyDown={event => {
                  if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    move(index, index - 1);
                  } else if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    move(index, index + 1);
                  }
                }}
              >
                <GripIcon />
              </button>
              <span className="w-6 shrink-0 font-mono text-xs font-semibold text-white/50">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="min-w-0 flex-1 truncate font-semibold text-app-ink">{song.title}</span>
              <button
                type="button"
                aria-label={`Quitar ${song.title}`}
                className="flex h-11 w-11 shrink-0 items-center justify-center text-xl text-white/50 hover:text-white"
                onClick={() => update(songs.filter(item => item.key !== song.key))}
              >
                ×
              </button>
            </li>
          ))}
        </ol>
      )}

      <form
        className="flex items-center gap-2 rounded-xl border border-dashed border-app-line pl-3"
        onSubmit={event => {
          event.preventDefault();
          addSong();
        }}
      >
        <label className="sr-only" htmlFor={`setlist-add-${eventId}`}>Añadir canción</label>
        <input
          id={`setlist-add-${eventId}`}
          className="min-h-12 min-w-0 flex-1 bg-transparent text-[15px] text-app-ink placeholder:text-white/35 focus:outline-none"
          placeholder="Añadir canción…"
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onPaste={event => {
            const text = event.clipboardData.getData('text');
            if (text.includes('\n')) {
              event.preventDefault();
              const titles = text.split('\n').map(title => title.trim()).filter(Boolean);
              update([...songs, ...titles.map(title => ({ key: newKey(), title, songId: null }))]);
            }
          }}
        />
        <button type="submit" className="min-h-12 px-4 text-sm font-semibold text-app-accent" disabled={!draft.trim()}>
          Añadir
        </button>
      </form>

      <p className="text-[13px] text-white/60">Con el setlist, cada vídeo del público cae en su canción.</p>

      {message ? (
        <p role={message.kind === 'error' ? 'alert' : 'status'} className={`text-sm ${message.kind === 'ok' ? 'text-emerald-400' : 'text-rose-300'}`}>
          {message.text}
        </p>
      ) : null}

      <Button block onClick={save} disabled={saving || loading || !dirty}>
        {saving ? <Spinner className="h-4 w-4" /> : null}
        Guardar setlist
      </Button>
    </section>
  );
};

export default SetlistEditor;
