import { useEffect, useState } from 'react';
import UploadsSheet from './UploadsSheet';
import { useUploadQueue } from '../media/useUploadQueue';

type UploadProgressPillProps = {
  className?: string;
};

/**
 * Small status pill for the background upload queue, mounted by AppShell.
 * Renders nothing while the queue is empty; mounting it also resumes the
 * uploads saved before the app was closed.
 */
const UploadProgressPill = ({ className }: UploadProgressPillProps) => {
  const { summary, jobs, remove, retryAll, clearFailed, clearFinished } = useUploadQueue();
  const [sheetOpen, setSheetOpen] = useState(false);

  // "Subidos" stays a few seconds, then the pill goes away.
  useEffect(() => {
    if (summary.state !== 'done') return undefined;
    const timer = setTimeout(() => void clearFinished(), 6_000);
    return () => clearTimeout(timer);
  }, [summary.state, clearFinished]);

  if (summary.state === 'idle') return null;

  const live = summary.total - summary.failed;
  let label: string;
  switch (summary.state) {
    case 'waiting_network':
      label = `Sin conexión · ${summary.pending} pendiente${summary.pending === 1 ? '' : 's'}`;
      break;
    case 'waiting_wifi':
      label = `Esperando wifi · ${summary.pending} pendiente${summary.pending === 1 ? '' : 's'}`;
      break;
    case 'error':
      if (summary.failed === 1 && summary.errorMessage) {
        // Say why (too big, too long…): it tells them whether retrying helps.
        label = summary.errorMessage;
      } else if (summary.retryable === 0) {
        label = summary.errorMessage
          ? `${summary.failed} momentos no se pueden subir: ${summary.errorMessage}`
          : `${summary.failed} momentos no se pueden subir`;
      } else {
        label = summary.failed === 1 ? '1 momento no se pudo subir' : `${summary.failed} momentos no se pudieron subir`;
      }
      break;
    case 'done':
      label = summary.done === 1 ? 'Momento subido' : `${summary.done} momentos subidos`;
      break;
    default:
      label = summary.compressing
        ? `Preparando vídeo · ${summary.percent} %`
        : `Subiendo ${summary.current} de ${live} · ${summary.percent} %`;
  }

  const showBar = summary.state === 'working';
  // Only what can succeed is retried; the rest (too big, too long…) is removed.
  const cancelPending = () => {
    for (const job of jobs) if (job.status !== 'done' && job.status !== 'failed') void remove(job.id);
  };
  const action = summary.retryable > 0
    ? { text: 'Reintentar', onClick: retryAll }
    : summary.failed > 0
      ? { text: 'Quitar', onClick: () => void clearFailed() }
      : summary.state === 'done'
        ? { text: 'Cerrar', onClick: () => void clearFinished() }
        : null;
  // Always a way out: «Cancelar» while something is pending, «Quitar» next to
  // «Reintentar» for what failed.
  const secondary = summary.pending > 0
    ? { text: 'Cancelar', onClick: cancelPending }
    : summary.retryable > 0
      ? { text: 'Quitar', onClick: () => void clearFailed() }
      : null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        'relative flex items-center gap-3 overflow-hidden rounded-full border border-white/10 bg-black/80 py-2 pl-4 pr-2 text-sm text-white shadow-lg backdrop-blur',
        className,
      ].filter(Boolean).join(' ')}
    >
      <span
        aria-hidden="true"
        className={[
          'h-2 w-2 shrink-0 rounded-full',
          summary.state === 'error' ? 'bg-rose-400' : summary.state === 'done' ? 'bg-emerald-400' : 'bg-white/70',
          summary.state === 'working' ? 'animate-pulse motion-reduce:animate-none' : '',
        ].join(' ')}
      />
      {/* Tapping the progress opens «Subiendo» with every photo and video. */}
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className={['min-w-0 flex-1 text-left', summary.state === 'error' ? 'line-clamp-2' : 'truncate'].join(' ')}
      >
        {label}
      </button>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white hover:bg-white/20"
        >
          {action.text}
        </button>
      )}
      {secondary && (
        <button
          type="button"
          onClick={secondary.onClick}
          className="shrink-0 rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-white/80"
        >
          {secondary.text}
        </button>
      )}
      {showBar && (
        <span
          aria-hidden="true"
          className="absolute bottom-0 left-0 h-0.5 bg-white/70 transition-[width] duration-300"
          style={{ width: `${summary.percent}%` }}
        />
      )}
      <UploadsSheet isOpen={sheetOpen} onClose={() => setSheetOpen(false)} />
    </div>
  );
};

export default UploadProgressPill;
