import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useEventUploads } from '../../media/useUploadQueue';

/**
 * State of «Sube lo que grabaste» on a past concert: this concert's uploads
 * in the queue (progress, errors) and whether the person already has moments
 * here. Once they do (and nothing is uploading or failed) there is no bar.
 */
export const useEventUploadBar = (eventId: string, userId: string | null) => {
  const { summary, retryAll, clearFailed } = useEventUploads(eventId);
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
  // Already uploaded here: nothing to offer. Until the count is known the bar
  // waits too, so it never shows a button that then disappears.
  const visible = inProgress || failed || uploaded === 0;

  // Whether they already have moments here (null until known): the stage's
  // compact «+ Subir» turns into a discreet «+ Subir más».
  const alreadyUploaded = uploaded === null ? null : uploaded > 0;

  return { summary, retryAll, clearFailed, inProgress, failed, visible, alreadyUploaded };
};

export type EventUploadBarState = ReturnType<typeof useEventUploadBar>;
