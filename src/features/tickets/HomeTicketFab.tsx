import React, { useEffect, useState } from 'react';
import { IconTicket } from '../../components/icons';
import { useAuth } from '../../contexts/AuthContext';
import { useAppResume } from '../../shared/hooks/useAppResume';
import { ticketsService, type TicketEvent, type TicketFile } from '../../services/tickets.service';
import { TicketViewer } from './TicketSlot';

const dayLabel = (iso: string, now = new Date()) => {
  const date = new Date(iso);
  if (date.toDateString() === now.toDateString()) return 'Hoy';
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (date.toDateString() === tomorrow.toDateString()) return 'Mañana';
  return date.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' }).replace(/[.,]/g, '');
};

/**
 * «Tu entrada» floating on Inicio, stacked above «Escanear QR», whenever the
 * fan has saved a ticket for an upcoming concert: one tap opens it.
 */
const HomeTicketFab: React.FC = () => {
  const { user } = useAuth();
  const resumeTick = useAppResume();
  const [next, setNext] = useState<TicketEvent | null>(null);
  const [files, setFiles] = useState<TicketFile[] | null>(null);

  useEffect(() => {
    if (!user) {
      setNext(null);
      return undefined;
    }
    let live = true;
    ticketsService
      .upcoming(user.id)
      .then(list => live && setNext(list[0] ?? null))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [user, resumeTick]);

  if (!user || !next) return null;

  const open = async () => {
    const list = await ticketsService.list(user.id, next.id).catch(() => []);
    if (list.length) setFiles(list);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void open()}
        aria-label={`Tu entrada de ${next.name}`}
        className="flex h-14 max-w-[70vw] items-center gap-2 rounded-full border border-app-line bg-app-surface/95 pl-2 pr-4 text-left text-app-ink shadow-xl backdrop-blur-md"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-app-ink text-app-bg">
          <IconTicket size={20} />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-bold leading-tight">Tu entrada</span>
          <span className="block truncate text-[12px] leading-tight text-white/60">
            {dayLabel(next.startsAt)} · {next.name}
          </span>
        </span>
      </button>
      <TicketViewer files={files || []} isOpen={files !== null} onClose={() => setFiles(null)} />
    </>
  );
};

export default HomeTicketFab;
