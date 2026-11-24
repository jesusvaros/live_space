import React, { useMemo, useState } from 'react';
import { IconCheckCircle, IconCopy, IconDownload, IconEye, IconEyeOff, IconFlag, IconLock, IconPlay } from '../../components/icons';
import { Modal } from '../../components/ui/AppPrimitives';
import ProLockChip from '../pro/ProLockChip';
import { creditLine, type ManagedMoment } from './eventMoments';

// The fans' moments of one concert, for its artist, venue or festival.
// Hide (reversible: the fan keeps it) and download (only with the fan's
// licence, credit in the file name and a line to paste). Square tiles, state
// told by icons; nothing absolute outside a tile.

type Filter = 'all' | 'hidden';

type EventMomentsManagerProps = {
  moments: ManagedMoment[];
  busy?: boolean;
  /** Downloading is a Pro perk; hiding is always free. */
  canDownload?: boolean;
  onSetHidden: (postIds: string[], hidden: boolean) => Promise<void> | void;
  onDownload: (moments: ManagedMoment[]) => Promise<void> | void;
};

const Tile: React.FC<{
  moment: ManagedMoment;
  selecting: boolean;
  selected: boolean;
  onPress: () => void;
}> = ({ moment, selecting, selected, onPress }) => (
  <button
    type="button"
    onClick={onPress}
    aria-pressed={selecting ? selected : undefined}
    aria-label={`Momento de ${moment.credit}${moment.hidden ? ', oculto' : ''}`}
    className={`relative aspect-square overflow-hidden rounded-xl bg-app-surface transition-transform active:scale-[0.97] motion-reduce:transition-none ${
      selected ? 'ring-2 ring-app-ink ring-offset-2 ring-offset-app-bg' : ''
    }`}
  >
    {moment.thumbnail_url ? (
      <img src={moment.thumbnail_url} alt="" loading="lazy" className={`h-full w-full object-cover ${moment.hidden ? 'opacity-35 grayscale' : ''}`} />
    ) : (
      <span className="flex h-full w-full items-center justify-center text-white/30">
        <IconPlay size={22} />
      </span>
    )}
    <span className="absolute inset-x-1.5 top-1.5 flex items-start justify-between gap-1">
      <span className="flex gap-1">
        {moment.resource_type === 'video' ? (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white">
            <IconPlay size={12} />
          </span>
        ) : null}
        {moment.open_reports > 0 ? (
          <span className="flex h-6 items-center gap-0.5 rounded-full bg-black/60 px-1.5 text-[11px] font-bold text-white">
            <IconFlag size={11} />
            {moment.open_reports}
          </span>
        ) : null}
      </span>
      {selecting ? (
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${
            selected ? 'border-app-ink bg-app-ink text-app-bg' : 'border-white/80 bg-black/30 text-transparent'
          }`}
        >
          <IconCheckCircle size={14} />
        </span>
      ) : null}
    </span>
    <span className="absolute inset-x-1.5 bottom-1.5 flex justify-end gap-1">
      {moment.hidden ? (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-app-ink text-app-bg">
          <IconEyeOff size={13} />
        </span>
      ) : null}
      {!moment.allow_reuse ? (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white/80">
          <IconLock size={12} />
        </span>
      ) : null}
    </span>
  </button>
);

const CreditBox: React.FC<{ line: string }> = ({ line }) => {
  const [copied, setCopied] = useState(false);
  if (!line) return null;
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(line).then(() => setCopied(true));
      }}
      className="flex min-h-12 w-full items-center gap-3 rounded-2xl border border-dashed border-white/25 px-3.5 text-left"
    >
      <span className="min-w-0 flex-1 truncate text-[13px] text-app-ink">{line}</span>
      <span className="flex shrink-0 items-center gap-1 text-[12px] font-semibold text-white/60">
        <IconCopy size={14} /> {copied ? 'Copiado' : 'Copiar'}
      </span>
    </button>
  );
};

const EventMomentsManager: React.FC<EventMomentsManagerProps> = ({ moments, busy = false, canDownload = true, onSetHidden, onDownload }) => {
  const [filter, setFilter] = useState<Filter>('all');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<ManagedMoment | null>(null);

  const hiddenCount = moments.filter(moment => moment.hidden).length;
  const visible = filter === 'hidden' ? moments.filter(moment => moment.hidden) : moments;
  const chosen = useMemo(() => moments.filter(moment => selected.has(moment.post_id)), [moments, selected]);
  const chosenDownloadable = chosen.filter(moment => moment.allow_reuse && moment.media_url);
  const allDownloadable = moments.filter(moment => moment.allow_reuse && moment.media_url && !moment.hidden);
  const chosenAllHidden = chosen.length > 0 && chosen.every(moment => moment.hidden);

  const toggle = (id: string) =>
    setSelected(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const endSelection = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  if (moments.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-app-line bg-app-surface text-white/50">
          <IconPlay size={24} />
        </span>
        <p className="font-display text-lg font-bold text-app-ink">Aún no hay momentos</p>
        <p className="text-sm text-white/55">Pon el QR en la sala y aparecerán aquí.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 pb-[calc(120px+env(safe-area-inset-bottom,0px))]">
      <div className="flex items-center gap-2 px-4">
        {(['all', 'hidden'] as const).map(key => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
            className={`inline-flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold ${
              filter === key ? 'border-app-ink bg-app-ink text-app-bg' : 'border-app-line bg-app-surface text-app-ink/85'
            }`}
          >
            {key === 'all' ? <IconPlay size={14} /> : <IconEyeOff size={14} />}
            {key === 'all' ? moments.length : hiddenCount}
          </button>
        ))}
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => (selecting ? endSelection() : setSelecting(true))}
          className="min-h-10 rounded-full px-3 text-[13px] font-semibold text-app-ink"
        >
          {selecting ? 'Cancelar' : 'Seleccionar'}
        </button>
      </div>

      {visible.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-white/50">Nada oculto.</p>
      ) : (
        <div className="grid grid-cols-3 gap-1.5 px-4">
          {visible.map(moment => (
            <Tile
              key={moment.post_id}
              moment={moment}
              selecting={selecting}
              selected={selected.has(moment.post_id)}
              onPress={() => (selecting ? toggle(moment.post_id) : setOpen(moment))}
            />
          ))}
        </div>
      )}

      {/* Bottom bar: the selection's actions, or «download all». */}
      <div className="fixed inset-x-0 bottom-[calc(16px+env(safe-area-inset-bottom,0px))] z-40 flex justify-center px-4">
        {selecting ? (
          <div className="flex w-full max-w-md items-center gap-2 rounded-full border border-app-line bg-app-surface/95 p-1.5 shadow-[0_10px_28px_rgba(0,0,0,0.55)] backdrop-blur-md">
            <span className="pl-3 font-mono text-[13px] font-bold text-app-ink">{chosen.length}</span>
            <span className="flex-1" />
            <button
              type="button"
              disabled={busy || chosen.length === 0}
              onClick={async () => {
                await onSetHidden(chosen.map(moment => moment.post_id), !chosenAllHidden);
                endSelection();
              }}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold text-app-ink disabled:opacity-40"
            >
              {chosenAllHidden ? <IconEye size={16} /> : <IconEyeOff size={16} />}
              {chosenAllHidden ? 'Mostrar' : 'Ocultar'}
            </button>
            {canDownload ? (
            <button
              type="button"
              disabled={busy || chosenDownloadable.length === 0}
              onClick={async () => {
                await onDownload(chosenDownloadable);
                endSelection();
              }}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-app-ink px-4 text-[13px] font-semibold text-app-bg disabled:opacity-40"
            >
              <IconDownload size={16} />
              {chosenDownloadable.length || ''}
            </button>
            ) : (
              <ProLockChip label="Descargar" className="mr-1 min-h-11 px-3.5" />
            )}
          </div>
        ) : allDownloadable.length > 0 && canDownload ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onDownload(allDownloadable)}
            className="inline-flex min-h-12 items-center gap-2 rounded-full bg-app-ink px-5 text-[14px] font-bold text-app-bg shadow-[0_10px_28px_rgba(0,0,0,0.55)] disabled:opacity-50"
          >
            <IconDownload size={18} />
            Descargar {allDownloadable.length}
          </button>
        ) : null}
      </div>

      <Modal isOpen={open !== null} onDidDismiss={() => setOpen(null)} initialBreakpoint={0.8} title="Momento">
        {open ? (
          <div className="max-h-[85dvh] overflow-y-auto px-4 pb-[calc(20px+env(safe-area-inset-bottom,0px))] pt-3">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" aria-hidden />
            <div className="overflow-hidden rounded-2xl bg-black">
              {open.resource_type === 'video' && open.media_url ? (
                <video src={open.media_url} poster={open.thumbnail_url ?? undefined} controls playsInline className="max-h-[50dvh] w-full" />
              ) : open.thumbnail_url ? (
                <img src={open.thumbnail_url} alt="" className="max-h-[50dvh] w-full object-contain" />
              ) : null}
            </div>
            <p className="mt-3 text-sm font-semibold text-app-ink">{open.credit}</p>
            {open.open_reports > 0 ? (
              <p className="mt-1 flex items-center gap-1.5 text-[13px] text-white/60">
                <IconFlag size={13} /> {open.open_reports}
              </p>
            ) : null}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  await onSetHidden([open.post_id], !open.hidden);
                  setOpen(null);
                }}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-app-line bg-app-surface text-sm font-semibold text-app-ink"
              >
                {open.hidden ? <IconEye size={17} /> : <IconEyeOff size={17} />}
                {open.hidden ? 'Mostrar' : 'Ocultar'}
              </button>
              {canDownload ? (
              <button
                type="button"
                disabled={busy || !open.allow_reuse || !open.media_url}
                onClick={() => void onDownload([open])}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-app-ink text-sm font-semibold text-app-bg disabled:bg-app-surface disabled:text-white/40"
              >
                {open.allow_reuse ? <IconDownload size={17} /> : <IconLock size={16} />}
                {open.allow_reuse ? 'Descargar' : 'Sin permiso'}
              </button>
              ) : (
                <span className="flex min-h-12 items-center justify-center rounded-2xl border border-dashed border-white/25">
                  <ProLockChip label="Descargar" />
                </span>
              )}
            </div>
            {open.allow_reuse && canDownload ? (
              <div className="mt-3">
                <CreditBox line={creditLine([open])} />
              </div>
            ) : null}
            <p className="mt-3 text-[12px] leading-relaxed text-white/45">
              Ocultar lo quita del concierto para el público. Su autor lo sigue viendo.
            </p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};

export { CreditBox };
export default EventMomentsManager;
