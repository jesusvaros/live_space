import React from 'react';
import { IconPlus } from '../../components/icons';
import type { EventUploadBarState } from './useEventUploadBar';

type EventUploadButtonProps = {
  bar: EventUploadBarState;
  onUpload: () => void;
  // 'pill': the compact «+ Subir» among the concert player's controls.
  variant?: 'bar' | 'pill';
};

/**
 * «Sube lo que grabaste» on a past concert. While this concert's uploads are
 * in the queue it becomes the progress bar, filling up as they go; a failed
 * upload turns it into «Reintentar». As a bar, once the person has moments
 * here the page does not show it at all (useEventUploadBar().visible).
 *
 * The 'pill' variant sits among the concert player's controls and is always
 * there: «+ Subir» in orange, or a discreet «+ Subir más» for someone who
 * already uploaded here. It fills and fails the same way, in less space.
 */
const EventUploadButton: React.FC<EventUploadButtonProps> = ({ bar, onUpload, variant = 'bar' }) => {
  const { summary, retryAll, clearFailed, inProgress, failed } = bar;
  // Too big / too long / unsupported: retrying can't help, offer to remove.
  const canRetry = summary.retryable > 0;
  const live = summary.total - summary.failed;
  const onClick = failed ? () => void (canRetry ? retryAll() : clearFailed()) : onUpload;

  if (variant === 'pill') {
    const errorText = summary.errorMessage ?? (summary.failed === 1 ? 'No se pudo subir' : `${summary.failed} no se pudieron subir`);
    const idle = !inProgress && !failed;
    let pillLabel: string;
    if (summary.state === 'waiting_network') pillLabel = 'Sin conexión';
    else if (summary.state === 'waiting_wifi') pillLabel = 'Esperando wifi';
    else if (inProgress && summary.compressing) pillLabel = `Preparando · ${summary.percent} %`;
    else if (inProgress) pillLabel = live > 1 ? `Subiendo ${summary.current}/${live} · ${summary.percent} %` : `Subiendo · ${summary.percent} %`;
    else if (failed) pillLabel = canRetry ? 'No se subió · Reintentar' : `${errorText} · Quitar`;
    else pillLabel = bar.alreadyUploaded ? 'Subir más' : 'Subir';
    // Orange to invite the first upload; translucent like the other
    // controls once they have moments here (or until that is known).
    const idleStyle =
      bar.alreadyUploaded === false
        ? 'bg-app-accent text-[#14151a]'
        : 'border border-white/20 bg-black/45 text-white backdrop-blur';
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={inProgress}
        aria-busy={inProgress}
        aria-label={failed ? (canRetry ? 'No se pudo subir: reintentar' : `${errorText}: quitar`) : undefined}
        className={`relative flex h-9 min-w-0 max-w-[62%] shrink items-center justify-center gap-1 overflow-hidden rounded-full px-3.5 text-[13px] font-bold transition-colors duration-500 ${
          failed ? 'bg-rose-500 text-white' : inProgress ? 'bg-[#3a3b42] text-white' : idleStyle
        }`}
      >
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 bg-app-accent transition-[width,opacity] duration-500 ease-out"
          style={{ width: inProgress ? `${Math.max(3, summary.percent)}%` : '0%', opacity: inProgress ? 1 : 0 }}
        />
        {idle ? <IconPlus className="relative h-4 w-4 shrink-0" /> : null}
        <span className="relative min-w-0 truncate tabular-nums">{pillLabel}</span>
      </button>
    );
  }

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
      onClick={onClick}
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
