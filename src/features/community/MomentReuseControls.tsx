import React, { useEffect, useState } from 'react';
import Button from '../../components/ui/Button';
import { useAuth } from '../../contexts/AuthContext';
import { fetchMomentLicence, setMomentAllowReuse, type MomentLicence } from './api';
import { downloadMoment, LICENCE_TERMS_PATH, momentFileName } from './licence';

type MomentReuseControlsProps = {
  postId: string;
  className?: string;
};

/**
 * Licence row on a moment:
 *  - its author sees a switch to allow or stop reuse;
 *  - members of the event's artist or venue see "Descargar" while reuse is on;
 *  - everybody else sees nothing.
 */
const MomentReuseControls: React.FC<MomentReuseControlsProps> = ({ postId, className = '' }) => {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [licence, setLicence] = useState<MomentLicence | null>(null);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [withCredit, setWithCredit] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLicence(null);
    setMessage('');
    if (!userId || !postId) return undefined;
    fetchMomentLicence(postId)
      .then(data => {
        if (!cancelled) setLicence(data);
      })
      .catch(error => console.warn('Failed to load moment licence', error));
    return () => {
      cancelled = true;
    };
  }, [postId, userId]);

  if (!licence || (!licence.is_owner && !licence.can_download)) return null;

  const toggle = async () => {
    setSaving(true);
    setMessage('');
    try {
      await setMomentAllowReuse(postId, !licence.allow_reuse);
      // Re-read: the download rights follow the new licence.
      setLicence(await fetchMomentLicence(postId));
    } catch {
      setMessage('No se pudo guardar. Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const download = async () => {
    setDownloading(true);
    setMessage('');
    try {
      const name = await downloadMoment(licence, { overlay: withCredit });
      setMessage(`Descargado como ${name}`);
    } catch {
      setMessage('No se pudo descargar.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <section className={`rounded-2xl border border-app-line bg-app-surface p-4 ${className}`} aria-label="Licencia del momento">
      {licence.is_owner ? (
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="m-0 text-sm font-semibold text-app-ink">Reutilización con crédito</p>
            <p className="m-0 mt-0.5 text-xs leading-relaxed text-white/60">
              {licence.allow_reuse
                ? 'El artista y la sala pueden reutilizar este momento citándote.'
                : 'Nadie puede reutilizar este momento.'}{' '}
              <a href={LICENCE_TERMS_PATH} className="font-semibold text-app-accent underline-offset-2 hover:underline">
                Condiciones
              </a>
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={licence.allow_reuse}
            aria-label="Permitir que el artista y la sala reutilicen este momento citándome"
            disabled={saving}
            onClick={toggle}
            className="flex h-11 w-14 shrink-0 items-center justify-center disabled:opacity-50"
          >
            <span
              className={`relative inline-block h-7 w-12 rounded-full transition-colors ${
                licence.allow_reuse ? 'bg-app-accent' : 'bg-white/15'
              }`}
            >
              <span
                className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${
                  licence.allow_reuse ? 'left-6' : 'left-1'
                }`}
              />
            </span>
          </button>
        </div>
      ) : null}

      {licence.can_download ? (
        <div className={licence.is_owner ? 'mt-3 border-t border-app-line pt-3' : ''}>
          <p className="m-0 text-sm font-semibold text-app-ink">Puedes reutilizar este momento</p>
          <p className="m-0 mt-0.5 text-xs text-white/60">
            Cita siempre a {licence.credit}. Se guardará como{' '}
            <span className="break-all font-mono text-[11px] text-white/75">{momentFileName(licence)}</span>
          </p>
          {licence.resource_type !== 'video' && (
            <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-3 text-sm text-white/80">
              <input
                type="checkbox"
                checked={withCredit}
                onChange={event => setWithCredit(event.target.checked)}
                className="h-5 w-5 accent-[#ff5b2e]"
              />
              Añadir «{licence.credit} vía Live Space» sobre la foto
            </label>
          )}
          <Button className="mt-2" block disabled={downloading} onClick={download}>
            {downloading ? 'Descargando…' : 'Descargar'}
          </Button>
        </div>
      ) : null}

      {message ? <p className="m-0 mt-2 text-xs text-white/60" role="status">{message}</p> : null}
    </section>
  );
};

export default MomentReuseControls;
