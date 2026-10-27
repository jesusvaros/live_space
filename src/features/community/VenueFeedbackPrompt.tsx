import React, { useEffect, useState } from 'react';
import Button from '../../components/ui/Button';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  fetchOwnVenueFeedback,
  submitVenueFeedback,
  VENUE_TAG_LABELS,
  VENUE_TAG_OPPOSITES,
  VENUE_TAGS,
  type VenueTag,
} from './api';

type PromptEvent = { id: string; starts_at: string; venue_place_id: string; venue_name: string };

const DISMISS_KEY = 'live_space.venue_feedback.dismissed.';
const ASK_FOR_DAYS = 30;

const startOfNextDay = (iso: string) => {
  const date = new Date(iso);
  date.setHours(24, 0, 0, 0);
  return date;
};

/** The day after the concert, and for a month. */
const isFeedbackWindowOpen = (startsAt: string, now = new Date()) => {
  const opens = startOfNextDay(startsAt);
  const closes = new Date(opens.getTime() + ASK_FOR_DAYS * 86_400_000);
  return now >= opens && now < closes;
};

const attendedLabel = (startsAt: string) => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const day = new Date(startsAt);
  if (day.toDateString() === yesterday.toDateString()) return 'Fuiste ayer';
  return `Fuiste el ${day.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`;
};

const isDismissed = (eventId: string) => {
  try {
    return globalThis.localStorage?.getItem(DISMISS_KEY + eventId) === '1';
  } catch {
    return false;
  }
};

const dismiss = (eventId: string) => {
  try {
    globalThis.localStorage?.setItem(DISMISS_KEY + eventId, '1');
  } catch {
    // ignore: the card only reappears on the next visit
  }
};

const loadPromptEvent = async (eventId: string, profileId: string): Promise<PromptEvent | null> => {
  const [{ data: event }, { data: attendance }] = await Promise.all([
    supabase.from('events').select('id,starts_at,venue_place_id,venue_places(name)').eq('id', eventId).maybeSingle(),
    supabase.from('event_attendance').select('status').eq('event_id', eventId).eq('profile_id', profileId).maybeSingle(),
  ]);
  if (!event || attendance?.status !== 'attended') return null;
  const venue = (event as { venue_places?: { name?: string } | { name?: string }[] | null }).venue_places;
  const venueName = (Array.isArray(venue) ? venue[0]?.name : venue?.name) || 'la sala';
  return {
    id: event.id as string,
    starts_at: event.starts_at as string,
    venue_place_id: event.venue_place_id as string,
    venue_name: venueName,
  };
};

/**
 * One-tap venue tags for someone who marked the event as attended, shown
 * from the day after the concert. Renders nothing otherwise.
 */
const VenueFeedbackPrompt: React.FC<{ eventId: string; className?: string }> = ({ eventId, className = '' }) => {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [event, setEvent] = useState<PromptEvent | null>(null);
  const [selected, setSelected] = useState<VenueTag[]>([]);
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setEvent(null);
    setSelected([]);
    setState('idle');
    setHidden(false);
    if (!userId || !eventId || isDismissed(eventId)) return undefined;
    (async () => {
      const candidate = await loadPromptEvent(eventId, userId);
      if (!candidate || !isFeedbackWindowOpen(candidate.starts_at)) return;
      if (await fetchOwnVenueFeedback(eventId, userId)) return;
      if (!cancelled) setEvent(candidate);
    })().catch(error => console.warn('Venue feedback prompt unavailable', error));
    return () => {
      cancelled = true;
    };
  }, [eventId, userId]);

  if (!event || !userId || hidden) return null;

  const toggleTag = (tag: VenueTag) => {
    setSelected(current => {
      if (current.includes(tag)) return current.filter(item => item !== tag);
      const opposite = VENUE_TAG_OPPOSITES[tag];
      return [...current.filter(item => item !== opposite), tag];
    });
  };

  const send = async () => {
    setState('sending');
    try {
      await submitVenueFeedback({ eventId: event.id, venuePlaceId: event.venue_place_id, profileId: userId, tags: selected });
      setState('sent');
    } catch (error) {
      console.warn('Failed to send venue feedback', error);
      setState('error');
    }
  };

  if (state === 'sent') {
    return (
      <section className={`rounded-2xl border border-app-line bg-app-surface p-4 ${className}`} role="status">
        <p className="m-0 font-display text-base font-bold text-app-ink">Gracias</p>
        <p className="m-0 mt-1 text-sm text-white/65">Lo sumamos a lo que dice la gente de {event.venue_name}.</p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby={`venue-feedback-${event.id}`}
      className={`rounded-[18px] border border-app-line bg-app-surface p-4 ${className}`}
    >
      <p className="m-0 font-mono text-[11px] font-semibold uppercase text-[#25d47b]">{attendedLabel(event.starts_at)}</p>
      <h3 id={`venue-feedback-${event.id}`} className="m-0 mt-1 font-display text-xl font-bold text-app-ink">
        ¿Qué tal {event.venue_name}?
      </h3>
      <p className="m-0 mb-3 mt-1 text-[13px] text-[#c9c5bd]">Toca lo que aplique. Ayuda a quien vaya después.</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Etiquetas de la sala">
        {VENUE_TAGS.map(tag => {
          const active = selected.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              aria-pressed={active}
              onClick={() => toggleTag(tag)}
              className={`min-h-11 rounded-full border px-3.5 text-[13px] font-semibold transition ${
                active
                  ? 'border-app-accent bg-app-accent/15 text-app-accent'
                  : 'border-app-line bg-transparent text-app-ink hover:border-white/30'
              }`}
            >
              {VENUE_TAG_LABELS[tag]}
            </button>
          );
        })}
      </div>
      {state === 'error' && <p className="m-0 mt-2 text-xs text-rose-400">No se pudo enviar. Inténtalo de nuevo.</p>}
      <Button size="lg" block className="mt-3.5" disabled={selected.length === 0 || state === 'sending'} onClick={send}>
        {state === 'sending' ? 'Enviando…' : 'Enviar'}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        block
        className="mt-1 text-[#8f8b84]"
        onClick={() => {
          dismiss(event.id);
          setHidden(true);
        }}
      >
        Ahora no
      </Button>
    </section>
  );
};

export default VenueFeedbackPrompt;
