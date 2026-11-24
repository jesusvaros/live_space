import React, { useCallback, useEffect, useState } from 'react';
import { IconEye, IconEyeOff, IconFlag, IconPlay, IconTrash } from '../icons';
import { Modal, Spinner } from '../ui/AppPrimitives';
import {
  decideReportedMoment,
  fetchModerationQueue,
  REPORT_REASON_LABELS,
  type QueueAction,
  type ReportedMoment,
} from '../../features/community/eventMoments';

// Admin → Reportes: reported moments, most reported first. Keep (publish
// again), hide (archive, reversible) or delete (removes the fan's file; asks
// first). Each decision closes the moment's open reports and is logged.

type ReportsQueueViewProps = {
  items: ReportedMoment[];
  busyId?: string | null;
  onDecide: (item: ReportedMoment, action: QueueAction) => void;
};

const when = (iso: string) =>
  new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace(/\./g, '');

export const ReportsQueueView: React.FC<ReportsQueueViewProps> = ({ items, busyId = null, onDecide }) => {
  const [confirm, setConfirm] = useState<ReportedMoment | null>(null);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-14 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-app-line bg-app-surface text-white/50">
          <IconFlag size={22} />
        </span>
        <p className="font-display text-lg font-bold text-app-ink">Sin reportes</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map(item => (
        <article key={item.post_id} className="overflow-hidden rounded-2xl border border-app-line bg-app-surface">
          <div className="flex gap-3 p-3">
            <a
              href={`/post/${item.post_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-black"
              aria-label="Ver el momento"
            >
              {item.thumbnail_url ? <img src={item.thumbnail_url} alt="" className="h-full w-full object-cover" /> : null}
              {item.resource_type === 'video' ? (
                <span className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white">
                  <IconPlay size={12} />
                </span>
              ) : null}
            </a>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 font-mono text-[12px] font-bold text-app-ink">
                <IconFlag size={13} /> {item.reports}
                {item.post_status !== 'published' ? (
                  <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-app-ink px-2 py-0.5 text-[10px] text-app-bg">
                    <IconEyeOff size={10} /> oculto
                  </span>
                ) : null}
              </p>
              <p className="mt-1 truncate text-sm font-semibold text-app-ink">{item.author_name}</p>
              <p className="truncate text-[12px] text-white/55">{item.event_name || 'Sin concierto'}</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {(item.reasons || []).map(reason => (
                  <span key={reason} className="rounded-full border border-app-line px-2 py-0.5 text-[11px] text-white/70">
                    {REPORT_REASON_LABELS[reason] || reason}
                  </span>
                ))}
              </div>
              {(item.details || []).slice(0, 2).map(detail => (
                <p key={detail} className="mt-1 line-clamp-2 text-[12px] italic text-white/55">
                  «{detail}»
                </p>
              ))}
              <p className="mt-1 text-[11px] text-white/35">{when(item.last_report_at)}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 border-t border-app-line">
            <button
              type="button"
              disabled={busyId === item.post_id}
              onClick={() => onDecide(item, 'keep')}
              className="inline-flex min-h-12 items-center justify-center gap-1.5 border-r border-app-line text-[13px] font-semibold text-app-ink disabled:opacity-40"
            >
              <IconEye size={15} /> Mantener
            </button>
            <button
              type="button"
              disabled={busyId === item.post_id}
              onClick={() => onDecide(item, 'hide')}
              className="inline-flex min-h-12 items-center justify-center gap-1.5 border-r border-app-line text-[13px] font-semibold text-app-ink disabled:opacity-40"
            >
              <IconEyeOff size={15} /> Ocultar
            </button>
            <button
              type="button"
              disabled={busyId === item.post_id}
              onClick={() => setConfirm(item)}
              className="inline-flex min-h-12 items-center justify-center gap-1.5 text-[13px] font-semibold text-rose-300 disabled:opacity-40"
            >
              <IconTrash size={15} /> Borrar
            </button>
          </div>
        </article>
      ))}

      <Modal isOpen={confirm !== null} onDidDismiss={() => setConfirm(null)} initialBreakpoint={0.4} title="Borrar momento">
        <div className="px-4 pb-[calc(20px+env(safe-area-inset-bottom,0px))] pt-3">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" aria-hidden />
          <p className="font-display text-xl font-bold text-app-ink">¿Borrar para siempre?</p>
          <p className="mt-1 text-sm text-white/60">Se borra el archivo de {confirm?.author_name}. No se puede deshacer.</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setConfirm(null)}
              className="min-h-12 rounded-2xl border border-app-line bg-app-surface text-sm font-semibold text-app-ink"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm) onDecide(confirm, 'delete');
                setConfirm(null);
              }}
              className="min-h-12 rounded-2xl bg-rose-500 text-sm font-bold text-white"
            >
              Borrar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

const ReportsQueue: React.FC = () => {
  const [items, setItems] = useState<ReportedMoment[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setItems(await fetchModerationQueue());
      setError('');
    } catch {
      setError('No se ha podido cargar la cola.');
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (item: ReportedMoment, action: QueueAction) => {
    setBusyId(item.post_id);
    try {
      await decideReportedMoment(item.post_id, action);
      setItems(current => (current || []).filter(row => row.post_id !== item.post_id));
    } catch {
      setError('No se ha podido guardar la decisión.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      {items === null ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <ReportsQueueView items={items} busyId={busyId} onDecide={(item, action) => void decide(item, action)} />
      )}
    </div>
  );
};

export default ReportsQueue;
