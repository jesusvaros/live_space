import React from 'react';
import { IconPlus } from '../../components/icons';
import type { EventUploadBarState } from './useEventUploadBar';

type EventUploadButtonProps = {
  bar: EventUploadBarState;
  onUpload: () => void;
};

/**
 * «Sube lo que grabaste» on a past concert. While this concert's uploads are
 * in the queue it becomes the progress bar, filling up as they go; a failed
 * upload turns it into «Reintentar». Once the person has moments here the page
 * does not show it at all (useEventUploadBar().visible).
 */
const EventUploadButton: React.FC<EventUploadButtonProps> = ({ bar, onUpload }) => {
  const { summary, retryAll, clearFailed, inProgress, failed } = bar;
  // Too big / too long / unsupported: retrying can't help, offer to remove.
  const canRetry = summary.retryable > 0;
  const live = summary.total - summary.failed;

  let label: React.ReactNode;
  if (summary.state === 'waiting_network') label = 'Sin conexión · esperando';
  else if (summary.state === 'waiting_wifi') label = 'Esperando wifi';
  else if (inProgress && summary.compressing) label = `Preparando vídeo · ${summary.percent} %`;
  else if (inProgress) label = `Subiendo ${summary.current} de ${live} · ${summary.percent} %`;
  else if (failed)
    label = canRetry
      ? summary.failed === 1 ? '1 no se pudo subir · Reintentar' : `${summary.failed} no se pudieron subir · Reintentar`
      : `${summary.errorMessage ?? (summary.failed === 1 ? '1 no se pudo subir' : `${summary.failed} no se pudieron subir`)} · Quitar`;
  else
    label = (
      <>
        <IconPlus className="h-5 w-5" />
        Sube lo que grabaste
      </>
    );

  // One button for every state, so going from «Sube…» to the bar only moves
  // the fill and fades the colour.
  return (
    <button
      type="button"
      onClick={failed ? () => void (canRetry ? retryAll() : clearFailed()) : onUpload}
      disabled={inProgress}
      aria-busy={inProgress}
      className={`relative flex h-[52px] flex-1 items-center justify-center gap-2 overflow-hidden rounded-full text-base font-bold transition-colors duration-500 ${
        failed ? 'bg-rose-500 text-white' : inProgress ? 'bg-[#3a3b42] text-white' : 'bg-app-accent text-[#14151a]'
      }`}
    >
      {/* While uploading the button turns grey and fills with orange. */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 bg-app-accent transition-[width,opacity] duration-500 ease-out"
        style={{ width: inProgress ? `${Math.max(3, summary.percent)}%` : '0%', opacity: inProgress ? 1 : 0 }}
      />
      <span
        className={`relative flex items-center gap-2 tabular-nums ${
          failed ? 'line-clamp-2 block px-5 text-center text-[13px] leading-tight' : ''
        }`}
      >
        {label}
      </span>
    </button>
  );
};

export default EventUploadButton;
