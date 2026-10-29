import React, { useState } from 'react';
import { Modal } from '../../components/ui/AppPrimitives';
import { IconFlag } from '../../components/icons';
import { useAuth } from '../../contexts/AuthContext';
import { reportPost } from '../socialImport/importPost';

// Saved as moderation_reports.reason. Three reports from different people
// hide the moment until staff review it (hide_reported_post trigger).
const REASONS = [
  { value: 'wrong_event', label: 'No es de este concierto' },
  { value: 'offensive', label: 'Ofensivo o violento' },
  { value: 'rights', label: 'Es contenido mío y no di permiso' },
  { value: 'illegal', label: 'Otro contenido ilegal' },
] as const;

type ReportMomentButtonProps = {
  postId: string;
  authorId?: string | null;
  // 'round' sits in the full-screen viewer's action column; 'row' under a moment.
  variant?: 'round' | 'row';
};

/** "Reportar" on a moment. Renders nothing for its author or signed-out users. */
const ReportMomentButton: React.FC<ReportMomentButtonProps> = ({ postId, authorId, variant = 'row' }) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  if (!user || user.id === authorId) return null;

  const send = async (reason: string) => {
    setState('sending');
    try {
      await reportPost(postId, user.id, reason);
      setState('sent');
    } catch (error: any) {
      // Already reported by this person: same outcome for them.
      setState(error?.code === '23505' ? 'sent' : 'error');
    }
  };

  const trigger = variant === 'round' ? (
    <button
      type="button"
      aria-label="Reportar"
      onClick={() => setOpen(true)}
      className="flex h-12 w-12 items-center justify-center rounded-full bg-black/40 text-app-ink"
    >
      <IconFlag size={20} />
    </button>
  ) : (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="inline-flex items-center gap-2 self-start text-sm text-white/60"
    >
      <IconFlag size={16} />
      Reportar
    </button>
  );

  return (
    <>
      {trigger}
      <Modal isOpen={open} onDidDismiss={() => setOpen(false)} initialBreakpoint={0.5} title="Reportar momento">
        <div className="flex flex-col gap-2 p-4 pb-[calc(16px+env(safe-area-inset-bottom,0px))]">
          {state === 'sent' ? (
            <>
              <p className="m-0 text-base font-semibold text-app-ink">Gracias, lo revisaremos.</p>
              <p className="m-0 text-sm text-white/60">Si más gente lo reporta, se oculta mientras tanto.</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="mt-2 h-12 rounded-full bg-white/10 text-sm font-semibold text-app-ink"
              >
                Cerrar
              </button>
            </>
          ) : (
            <>
              <p className="m-0 mb-1 text-sm text-white/60">¿Qué pasa con este momento?</p>
              {REASONS.map(reason => (
                <button
                  key={reason.value}
                  type="button"
                  disabled={state === 'sending'}
                  onClick={() => void send(reason.value)}
                  className="min-h-12 rounded-2xl border border-app-line bg-app-surface px-4 text-left text-sm text-app-ink disabled:opacity-50"
                >
                  {reason.label}
                </button>
              ))}
              {state === 'error' ? <p className="m-0 text-sm text-rose-400">No se pudo enviar. Inténtalo de nuevo.</p> : null}
            </>
          )}
        </div>
      </Modal>
    </>
  );
};

export default ReportMomentButton;
