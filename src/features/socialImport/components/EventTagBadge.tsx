import React, { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { getEventTag, type TaggableEvent } from '../eventTag';

type EventTagBadgeProps = {
  eventId: string;
  // Skip the fetch when the caller already has the event row.
  event?: TaggableEvent | null;
  // inline: just the tag chip (posters). banner: the call to action for event pages.
  variant?: 'banner' | 'inline';
  className?: string;
};

const tagCache = new Map<string, string | null>();

const fetchEventTag = async (eventId: string) => {
  if (tagCache.has(eventId)) return tagCache.get(eventId) ?? null;
  const select = (columns: string) =>
    supabase
      .from('events')
      .select(columns)
      .eq('id', eventId)
      .maybeSingle();
  let { data, error } = await select('share_tag,starts_at,timezone,venue_place:venue_places!events_venue_place_id_fkey (name)');
  // Before the share_tag migration: fall back to the computed base tag.
  if (error) ({ data, error } = await select('starts_at,timezone,venue_place:venue_places!events_venue_place_id_fkey (name)'));
  const tag = !error && data ? getEventTag(data as TaggableEvent) : null;
  tagCache.set(eventId, tag);
  return tag;
};

// "Etiqueta tus vídeos con #LSRIV29": the concert's tag, which files every
// Instagram/TikTok/YouTube clip that mentions it into this event.
const EventTagBadge: React.FC<EventTagBadgeProps> = ({ eventId, event, variant = 'banner', className }) => {
  const initial = event ? getEventTag(event) : tagCache.get(eventId) ?? null;
  const [tag, setTag] = useState<string | null>(initial);
  const [copied, setCopied] = useState(false);
  const [explained, setExplained] = useState(false);

  useEffect(() => {
    if (event?.share_tag || !eventId) return undefined;
    let alive = true;
    fetchEventTag(eventId)
      .then(value => {
        if (alive && value) setTag(value);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [eventId, event?.share_tag]);

  if (!tag) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tag);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable: the tag stays visible to type by hand.
    }
  };

  if (variant === 'inline') {
    return (
      <span className={`inline-flex items-center rounded-full bg-app-accent px-3 py-1 font-mono text-sm font-semibold tracking-[0.04em] text-[#14151a] ${className || ''}`}>
        {tag}
      </span>
    );
  }

  return (
    <div className={`rounded-2xl border border-app-line bg-app-surface px-4 py-3 ${className || ''}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[13px] text-white/65">
            Etiqueta tus vídeos con
            <button
              type="button"
              onClick={() => setExplained(value => !value)}
              aria-expanded={explained}
              aria-label="¿Para qué sirve la etiqueta?"
              className="flex h-5 w-5 items-center justify-center rounded-full border border-white/30 font-mono text-[11px] font-bold text-white/70"
            >
              i
            </button>
          </p>
          <p className="font-mono text-xl font-semibold tracking-[0.04em] text-app-accent">{tag}</p>
        </div>
        <button
          type="button"
          onClick={copy}
          className="min-h-11 shrink-0 rounded-full border border-app-line px-4 text-[13px] font-semibold text-white"
          aria-label={`Copiar ${tag}`}
        >
          {copied ? 'Copiada' : 'Copiar'}
        </button>
      </div>
      {explained ? (
        <p className="mt-2.5 border-t border-app-line pt-2.5 text-[13px] leading-relaxed text-[#c9c5bd]">
          Ponla en el texto de tu reel, TikTok o vídeo de YouTube. Luego compártelo con Live Space (Compartir → Live Space) y
          aparece en este concierto, en su canción, sin tener que buscarlo ni volver a subirlo.
        </p>
      ) : null}
    </div>
  );
};

export default EventTagBadge;
