import React, { useEffect, useMemo, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { useNavigate } from 'react-router-dom';
import { Modal } from './ui/AppPrimitives';
import { IconCamera, IconPlay, IconPlus } from './icons';
import { jobFraction, useUploadQueue } from '../media/useUploadQueue';
import { isRetryableFailure, type UploadJob } from '../media/uploadQueue';

// «Subiendo»: what is in the upload queue, one big card each (like the
// selection in «Subir»), with its own progress and, when it failed,
// «Reintentar» or «Quitar». Opened by tapping the progress pill.

const clock = (iso: string | null) => {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
};

const statusText = (job: UploadJob) => {
  switch (job.status) {
    case 'done':
      return 'Subido';
    case 'failed':
      return job.error || 'No se pudo subir';
    case 'compressing':
      return 'Preparando';
    case 'finalizing':
      return 'Casi';
    case 'waiting_network':
      return 'Sin conexión';
    case 'waiting_wifi':
      return 'Esperando wifi';
    case 'queued':
    case 'retrying':
      return 'En cola';
    default:
      return null;
  }
};

/** What the WebView can show for a job: the File, the native photo or the video's frame. */
const useJobPreview = (job: UploadJob) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (job.file && job.kind === 'image') {
      const objectUrl = URL.createObjectURL(job.file);
      setUrl(objectUrl);
      return () => URL.revokeObjectURL(objectUrl);
    }
    const nativeImage = job.kind === 'image' ? job.nativePath : job.prepared?.thumbnailPath ?? null;
    setUrl(nativeImage && Capacitor.isNativePlatform() ? Capacitor.convertFileSrc(nativeImage) : null);
    return undefined;
  }, [job.file, job.kind, job.nativePath, job.prepared?.thumbnailPath]);
  return url;
};

const UploadCard: React.FC<{ job: UploadJob; onRetry: () => void; onRemove: () => void }> = ({ job, onRetry, onRemove }) => {
  const preview = useJobPreview(job);
  const isVideo = job.kind === 'video';
  const percent = Math.round(jobFraction(job) * 100);
  const failed = job.status === 'failed';
  const done = job.status === 'done';
  const text = statusText(job);
  const time = clock(job.capturedAt);
  return (
    <li className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-app-surface">
      {preview ? (
        <img src={preview} alt="" className={`h-full w-full object-cover ${done ? '' : 'opacity-70'}`} />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-[#8f8b84]">
          {isVideo ? <IconPlay size={28} /> : <IconCamera size={28} />}
        </span>
      )}
      {!done && !failed ? (
        <button
          type="button"
          aria-label="Cancelar esta subida"
          onClick={onRemove}
          className="absolute right-1.5 top-1.5 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      ) : null}
      <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 font-mono text-[11px] font-semibold text-white">
        {isVideo ? <IconPlay size={12} /> : <IconCamera size={12} />}
        {time ?? (isVideo ? 'Vídeo' : 'Foto')}
      </span>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2.5 pb-2.5 pt-8">
        <div className="flex items-center justify-between gap-2 text-[12px] font-bold text-white">
          <span className={`min-w-0 truncate ${failed ? 'text-rose-300' : done ? 'text-emerald-300' : ''}`}>{text ?? `${percent} %`}</span>
          {text && !failed && !done ? <span className="tabular-nums text-white/70">{percent} %</span> : null}
        </div>
        {failed ? (
          <div className="mt-1.5 flex gap-1.5">
            {isRetryableFailure(job) ? (
              <button type="button" onClick={onRetry} className="min-h-9 flex-1 rounded-full bg-white text-[12px] font-bold text-[#14151a]">
                Reintentar
              </button>
            ) : null}
            <button type="button" onClick={onRemove} className="min-h-9 flex-1 rounded-full border border-white/30 text-[12px] font-bold text-white">
              Quitar
            </button>
          </div>
        ) : (
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/20" aria-hidden="true">
            <div className={`h-full rounded-full transition-[width] duration-500 ${done ? 'bg-emerald-400' : 'bg-app-accent'}`} style={{ width: `${Math.max(3, percent)}%` }} />
          </div>
        )}
      </div>
    </li>
  );
};

type UploadsSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  /** Only this concert's uploads (the concert page); all of them otherwise. */
  eventId?: string | null;
};

const UploadsSheet: React.FC<UploadsSheetProps> = ({ isOpen, onClose, eventId }) => {
  const navigate = useNavigate();
  const { jobs, retry, remove } = useUploadQueue();
  const shown = useMemo(() => (eventId ? jobs.filter(job => job.eventId === eventId) : jobs), [jobs, eventId]);
  const done = shown.filter(job => job.status === 'done').length;
  const pending = shown.filter(job => job.status !== 'done' && job.status !== 'failed');

  const uploadMore = () => {
    onClose();
    navigate(eventId ? `/tabs/upload?event=${encodeURIComponent(eventId)}` : '/tabs/upload');
  };
  const cancelAll = () => {
    for (const job of pending) void remove(job.id);
  };

  return (
    <Modal isOpen={isOpen} onDidDismiss={onClose} initialBreakpoint={0.9} title="Subiendo">
      <div className="max-h-[90dvh] overflow-y-auto px-4 pb-[calc(20px+env(safe-area-inset-bottom,0px))] pt-3">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" aria-hidden />
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="m-0 font-display text-lg font-bold text-app-ink">Subiendo</h3>
          {shown.length ? (
            <span className="font-mono text-[12px] font-semibold text-white/55">
              {done}/{shown.length}
            </span>
          ) : null}
        </div>
        {shown.length === 0 ? (
          <p className="py-8 text-center text-sm text-white/55">No hay nada subiéndose.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2">
            {shown.map(job => (
              <UploadCard key={job.id} job={job} onRetry={() => void retry(job.id)} onRemove={() => void remove(job.id)} />
            ))}
          </ul>
        )}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={uploadMore}
            className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-app-accent text-[15px] font-bold text-[#14151a]"
          >
            <IconPlus size={18} />
            Subir más
          </button>
          {pending.length > 0 ? (
            <button
              type="button"
              onClick={cancelAll}
              className="min-h-12 shrink-0 rounded-full border border-app-line px-4 text-[14px] font-semibold text-app-ink"
            >
              Cancelar {pending.length === 1 ? 'la subida' : `las ${pending.length}`}
            </button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
};

export default UploadsSheet;
