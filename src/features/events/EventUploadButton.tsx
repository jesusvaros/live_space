import React, { useEffect, useState } from 'react';
import { IconCheckCircle, IconPlus } from '../../components/icons';
import { supabase } from '../../lib/supabase';
import { useEventUploads } from '../../media/useUploadQueue';

type EventUploadButtonProps = {
  eventId: string;
  userId: string | null;
  onUpload: () => void;
};

/**
 * «Sube lo que grabaste» on a past concert. While this concert's uploads are
 * in the queue it becomes the progress bar, filling up as they go; once the
 * user has moments here it is done and stays off.
 */
const EventUploadButton: React.FC<EventUploadButtonProps> = ({ eventId, userId, onUpload }) => {
  const { summary, retryAll } = useEventUploads(eventId);
  const [uploaded, setUploaded] = useState<number | null>(null);

  // Their moments on this concert; read again each time an upload finishes.
  useEffect(() => {
    if (!userId) {
      setUploaded(0);
      return undefined;
    }
    let cancelled = false;
    supabase
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('author_id', userId)
      .in('status', ['published', 'review'])
      .then(({ count, error }) => {
        if (!cancelled) setUploaded(error ? 0 : count ?? 0);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, userId, summary.done]);

  const inProgress =
    summary.state === 'working' || summary.state === 'waiting_network' || summary.state === 'waiting_wifi';
  const failed = summary.state === 'error';
  const done = !inProgress && !failed && (uploaded ?? 0) > 0;
  const live = summary.total - summary.failed;

  let label: React.ReactNode;
  if (summary.state === 'waiting_network') label = 'Sin conexión · esperando';
  else if (summary.state === 'waiting_wifi') label = 'Esperando wifi';
  else if (inProgress && summary.compressing) label = `Preparando vídeo · ${summary.percent} %`;
  else if (inProgress) label = `Subiendo ${summary.current} de ${live} · ${summary.percent} %`;
  else if (failed)
    label = summary.failed === 1 ? '1 no se pudo subir · Reintentar' : `${summary.failed} no se pudieron subir · Reintentar`;
  else if (done)
    label = (
      <>
        <IconCheckCircle className="h-5 w-5" />
        {uploaded === 1 ? 'Subiste 1 momento' : `Subiste ${uploaded} momentos`}
      </>
    );
  else
    label = (
      <>
        <IconPlus className="h-5 w-5" />
        Sube lo que grabaste
      </>
    );

  // One button for every state, so going from «Sube…» to the bar and to
  // «Subiste…» only moves the fill and fades the colour.
  return (
    <button
      type="button"
      onClick={failed ? () => void retryAll() : onUpload}
      disabled={inProgress || done || uploaded === null}
      aria-busy={inProgress}
      className={`relative flex h-[52px] flex-1 items-center justify-center gap-2 overflow-hidden rounded-full text-base font-bold transition-colors duration-500 ${
        failed
          ? 'bg-rose-500 text-white'
          : done
            ? 'bg-app-surface text-app-ink/70'
            : inProgress
              ? 'bg-[#3a3b42] text-white'
              : 'bg-app-accent text-[#14151a]'
      }`}
    >
      {/* While uploading the button turns grey and fills with orange. */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 bg-app-accent transition-[width,opacity] duration-500 ease-out"
        style={{ width: inProgress ? `${Math.max(3, summary.percent)}%` : '0%', opacity: inProgress ? 1 : 0 }}
      />
      <span className="relative flex items-center gap-2 tabular-nums">{label}</span>
    </button>
  );
};

export default EventUploadButton;
