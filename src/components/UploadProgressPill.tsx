import { useEffect } from 'react';
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
  const { summary, retryAll, clearFinished } = useUploadQueue();

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
      label = summary.failed === 1 ? '1 momento no se pudo subir' : `${summary.failed} momentos no se pudieron subir`;
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
  const action = summary.failed > 0
    ? { text: 'Reintentar', onClick: retryAll }
    : summary.state === 'done'
      ? { text: 'Cerrar', onClick: () => void clearFinished() }
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
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white hover:bg-white/20"
        >
          {action.text}
        </button>
      )}
      {showBar && (
        <span
          aria-hidden="true"
          className="absolute bottom-0 left-0 h-0.5 bg-white/70 transition-[width] duration-300"
          style={{ width: `${summary.percent}%` }}
        />
      )}
    </div>
  );
};

export default UploadProgressPill;
