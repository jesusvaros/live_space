import React, { useEffect, useRef, useState } from 'react';
import { IconLock, IconPlus, IconTicket, IconTrash } from '../../components/icons';
import { Modal } from '../../components/ui/AppPrimitives';
import { useAuth } from '../../contexts/AuthContext';
import { isTicketFileOk, ticketAccept, ticketsService, type TicketFile } from '../../services/tickets.service';

// «Tu entrada» on an upcoming concert: keep the ticket (photo, screenshot or
// PDF) privately and open it in one tap at the door. A ticket stub with a
// perforated edge; dashed while empty. Only for logged-in fans.

type TicketSlotProps = { eventId: string; eventName: string; className?: string };

export const TicketViewer: React.FC<{
  files: TicketFile[];
  isOpen: boolean;
  onClose: () => void;
  onRemove?: (file: TicketFile) => void;
}> = ({ files, isOpen, onClose, onRemove }) => {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    let live = true;
    const made: string[] = [];
    setError(null);
    files
      .filter(file => !file.isPdf)
      .forEach(file =>
        ticketsService
          .imageUrl(file.path)
          .then(url => {
            made.push(url);
            if (live) setUrls(current => ({ ...current, [file.path]: url }));
          })
          .catch(err => live && setError(err.message)),
      );
    return () => {
      live = false;
      made.forEach(url => URL.revokeObjectURL(url));
    };
  }, [files, isOpen]);

  return (
    <Modal isOpen={isOpen} onDidDismiss={onClose} title="Tu entrada">
      <div className="flex h-full flex-col bg-black pt-[env(safe-area-inset-top,0px)]">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-white/70">
            <IconLock size={16} /> Solo la ves tú
          </span>
          <button type="button" onClick={onClose} className="min-h-11 rounded-full bg-white/10 px-4 text-sm font-semibold text-white">
            Cerrar
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-[calc(24px+env(safe-area-inset-bottom,0px))]">
          {error ? <p className="text-sm text-rose-400">{error}</p> : null}
          {files.map(file => (
            <div key={file.path} className="overflow-hidden rounded-2xl bg-white">
              {file.isPdf ? (
                <button
                  type="button"
                  onClick={() => ticketsService.openPdf(file.path).catch(err => setError(err.message))}
                  className="flex min-h-32 w-full items-center justify-center gap-2 text-base font-bold text-[#14151a]"
                >
                  <IconTicket size={22} /> Abrir PDF
                </button>
              ) : urls[file.path] ? (
                <img src={urls[file.path]} alt="Entrada" className="block w-full" />
              ) : (
                <div className="h-64 animate-pulse bg-white/80" />
              )}
              {onRemove ? (
                <button
                  type="button"
                  onClick={() => onRemove(file)}
                  className="flex min-h-11 w-full items-center justify-center gap-2 border-t border-black/10 text-sm font-semibold text-[#8a1c1c]"
                >
                  <IconTrash size={16} /> Borrar
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
};

export const TicketStub: React.FC<{
  has: boolean;
  busy?: boolean;
  eventName: string;
  onMain: () => void;
  onAdd: () => void;
}> = ({ has, busy = false, eventName, onMain, onAdd }) => (
  <div
    className={`flex min-h-14 items-stretch overflow-hidden rounded-2xl border ${
      has ? 'border-app-line bg-app-surface' : 'border-dashed border-white/25'
    }`}
  >
    <button
      type="button"
      disabled={busy}
      onClick={onMain}
      aria-label={has ? `Ver tu entrada de ${eventName}` : `Guardar tu entrada de ${eventName}`}
      className="flex min-w-0 flex-1 items-center gap-3 px-3.5 text-left"
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
          has ? 'bg-app-accent text-[#14151a]' : 'bg-white/10 text-app-ink'
        }`}
      >
        <IconTicket size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-app-ink">
          {busy ? 'Guardando…' : has ? 'Tu entrada' : 'Guarda tu entrada'}
        </span>
        <span className="flex items-center gap-1 text-[12px] text-white/55">
          <IconLock size={12} /> Solo la ves tú
        </span>
      </span>
    </button>
    {has ? (
      <>
        <span aria-hidden className="w-0 border-l-2 border-dashed border-app-line" />
        <button
          type="button"
          aria-label="Añadir otra entrada"
          disabled={busy}
          onClick={onAdd}
          className="flex w-14 shrink-0 items-center justify-center text-white/60"
        >
          <IconPlus size={18} />
        </button>
      </>
    ) : null}
  </div>
);

const TicketSlot: React.FC<TicketSlotProps> = ({ eventId, eventName, className = '' }) => {
  const { user } = useAuth();
  const [files, setFiles] = useState<TicketFile[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!user) return undefined;
    let live = true;
    ticketsService
      .list(user.id, eventId)
      .then(list => live && setFiles(list))
      .catch(() => live && setFiles([]));
    return () => {
      live = false;
    };
  }, [eventId, user]);

  if (!user || files === null) return null;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (!isTicketFileOk(file)) {
      setError('Sube una foto o un PDF de menos de 10 MB.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = await ticketsService.upload(user.id, eventId, file);
      setFiles(current => [...(current || []), saved]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido guardar la entrada.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const remove = async (file: TicketFile) => {
    try {
      await ticketsService.remove(file.path);
      const rest = (files || []).filter(item => item.path !== file.path);
      setFiles(rest);
      if (rest.length === 0) setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido borrar la entrada.');
    }
  };

  const has = files.length > 0;

  return (
    <div className={className}>
      <input ref={input} type="file" accept={ticketAccept} className="hidden" onChange={event => pick(event.target.files?.[0])} />
      <TicketStub
        has={has}
        busy={busy}
        eventName={eventName}
        onMain={() => (has ? setOpen(true) : input.current?.click())}
        onAdd={() => input.current?.click()}
      />
      {error ? <p className="mt-1.5 text-[13px] text-rose-400">{error}</p> : null}
      <TicketViewer files={files} isOpen={open} onClose={() => setOpen(false)} onRemove={remove} />
    </div>
  );
};

export default TicketSlot;
