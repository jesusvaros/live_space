import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Spinner } from '../components/ui/AppPrimitives';
import { IconMap, IconMic } from '../components/icons';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { LINK_STATE_COPY, ROLE_HINTS, ROLE_LABELS, TOKEN_PATTERN } from '../features/management/profileForm';
import { teamService, type LinkPreview } from '../services/team.service';
import { canGoBack } from '../app/useGoBack';

// Opened from a shared link (via the public /unirse page or inside the app):
// - /equipo/unirse/:token  → join the team of an artist or venue;
// - /reclamar/enlace/:token → take over a profile with the personal link we
//   sent, without the manual review.
// Both need an account (RequireAuth brings the person back here).

const CLAIM_ROLES: Record<'artist' | 'venue', string[]> = {
  artist: ['Soy el artista o del grupo', 'Management', 'Sello', 'Prensa', 'Booking'],
  venue: ['Programación', 'Dirección', 'Comunicación', 'Producción', 'Propiedad'],
};

const JoinByLink: React.FC<{ mode: 'team' | 'claim' }> = ({ mode }) => {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { refreshWorkspaces } = useWorkspace();
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState('');

  useEffect(() => {
    if (!TOKEN_PATTERN.test(token)) {
      setPreview({ state: 'invalid', card: null });
      return undefined;
    }
    let live = true;
    (mode === 'team' ? teamService.previewInvite(token) : teamService.previewClaimLink(token))
      .then(result => live && setPreview(result))
      .catch(err => live && setError(err instanceof Error ? err.message : 'No se ha podido abrir el enlace.'));
    return () => {
      live = false;
    };
  }, [mode, token]);

  const close = () => {
    if (canGoBack()) navigate(-1);
    else navigate('/tabs/events', { replace: true });
  };

  const accept = async () => {
    setBusy(true);
    setError('');
    try {
      if (mode === 'team') await teamService.acceptInvite(token);
      else await teamService.redeemClaimLink(token, role);
      await refreshWorkspaces().catch(() => undefined);
      navigate('/gestion', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido completar.');
      setBusy(false);
    }
  };

  const card = preview?.card ?? null;
  const ready = preview?.state === 'ok' && card;
  const kind = card?.type ?? 'artist';

  return (
    <div className="flex h-dvh flex-col bg-app-bg text-app-ink">
      <header className="flex justify-end px-3 pt-[calc(10px+env(safe-area-inset-top,0px))]">
        <button
          type="button"
          onClick={close}
          className="min-h-11 rounded-full border border-app-line px-4 text-[13px] font-semibold text-app-ink"
        >
          Cerrar
        </button>
      </header>
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-[calc(24px+env(safe-area-inset-bottom,0px))]">
        {!preview && !error ? (
          <div className="flex flex-1 items-center justify-center"><Spinner /></div>
        ) : (
          <>
            {card ? (
              <div className="mt-6 flex flex-col items-center text-center">
                <div className="h-28 w-28 overflow-hidden rounded-3xl border border-app-line bg-app-surface">
                  {card.imageUrl ? (
                    <img src={card.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center font-poster text-4xl text-white/40">
                      {card.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </div>
                <span className="mt-3 flex h-8 w-8 items-center justify-center rounded-lg border border-app-line text-white/70" aria-hidden>
                  {kind === 'artist' ? <IconMic size={16} /> : <IconMap size={16} />}
                </span>
                <h1 className="mt-2 font-display text-[28px] font-bold leading-tight">{card.name}</h1>
                {card.city ? <p className="text-sm text-white/55">{card.city}</p> : null}
              </div>
            ) : null}

            {preview && preview.state !== 'ok' ? (
              <p className="mt-8 text-center text-[15px] text-white/70">{LINK_STATE_COPY[preview.state]}</p>
            ) : null}

            {ready && mode === 'team' && preview.role && preview.role !== 'owner' ? (
              <p className="mt-6 text-center text-[15px] text-white/75">
                Te invitan como <strong className="text-app-ink">{ROLE_LABELS[preview.role]}</strong>
                <span className="block text-[13px] text-white/50">{ROLE_HINTS[preview.role]}</span>
              </p>
            ) : null}

            {ready && mode === 'claim' ? (
              <div className="mt-8">
                <p className="mb-2 text-center font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-white/50">¿Qué haces?</p>
                <div role="radiogroup" aria-label="Tu papel" className="flex flex-wrap justify-center gap-2">
                  {CLAIM_ROLES[kind].map(option => (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={role === option}
                      onClick={() => setRole(option)}
                      className={`min-h-11 rounded-full border px-4 text-[14px] font-semibold ${
                        role === option ? 'border-app-ink bg-app-ink text-app-bg' : 'border-app-line text-app-ink'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {error ? <p role="alert" className="mt-6 text-center text-sm text-rose-300">{error}</p> : null}

            <div className="mt-auto pt-8">
              {ready ? (
                <button
                  type="button"
                  onClick={accept}
                  disabled={busy || (mode === 'claim' && !role)}
                  className="min-h-14 w-full rounded-full bg-app-ink text-[16px] font-bold text-app-bg disabled:opacity-40"
                >
                  {busy ? 'Un momento…' : mode === 'team' ? 'Unirme al equipo' : 'Gestionar este perfil'}
                </button>
              ) : preview?.state === 'member' ? (
                <button
                  type="button"
                  onClick={() => navigate('/gestion', { replace: true })}
                  className="min-h-14 w-full rounded-full bg-app-ink text-[16px] font-bold text-app-bg"
                >
                  Ir al panel
                </button>
              ) : null}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default JoinByLink;
