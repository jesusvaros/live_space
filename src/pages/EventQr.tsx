import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import Button from '../components/ui/Button';
import { Spinner } from '../components/ui/AppPrimitives';
import { IconChevronLeft } from '../components/icons';
import { useAuth } from '../contexts/AuthContext';
import { buildUploadQrUrl } from '../lib/uploadQr';
import { fallbackShareTag, POSTER_COLORS, PosterVariant, qrSvg, renderPosterPng } from '../lib/qrPoster';
import { eventManagementService, ManagedEvent } from '../services/eventManagement.service';
import { canGoBack } from '../app/useGoBack';

const posterDate = (iso: string) =>
  new Date(iso)
    .toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' })
    .replace(/\./g, '')
    .replace(',', '')
    .toUpperCase();

const slug = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);

const BrandMark: React.FC<{ color: string }> = ({ color }) => (
  <svg width="18" height="18" viewBox="0 0 26 26" aria-hidden="true">
    <circle cx="13" cy="13" r="11" fill="none" stroke={color} strokeWidth="2.6" />
    <circle cx="13" cy="13" r="5" fill={color} />
  </svg>
);

// Printable QR poster for one concert. The QR opens Upload with the concert
// already chosen, through the event's private upload token.
const EventQr: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [event, setEvent] = useState<ManagedEvent | null>(null);
  const [link, setLink] = useState('');
  const [svg, setSvg] = useState('');
  const [shareTag, setShareTag] = useState<string | null>(null);
  const [variant, setVariant] = useState<PosterVariant>('paper');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!id || !user?.id) return undefined;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const found = await eventManagementService.getEvent(id);
        if (!found) throw new Error('No encontramos este concierto.');
        const token = await eventManagementService.getOrCreateUploadToken(id, user.id);
        const url = buildUploadQrUrl({ token, eventId: id });
        const markup = await qrSvg(url);
        const tag = await eventManagementService.getShareTag(id).catch(() => null);
        if (cancelled) return;
        setShareTag(tag);
        setEvent(found);
        setLink(url);
        setSvg(markup);
      } catch (err: any) {
        if (cancelled) return;
        setError(
          err?.code === '42501'
            ? 'Solo quien gestiona el artista o la sala puede sacar el QR de este concierto.'
            : err?.message || 'No se ha podido generar el QR.',
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [id, user?.id]);

  const content = useMemo(() => {
    if (!event) return null;
    const kicker = [event.venue_name, posterDate(event.starts_at)].filter(Boolean).join(' · ').toUpperCase();
    return {
      url: link,
      kicker,
      artist: event.headliner?.name || event.name,
      shareTag: shareTag || fallbackShareTag(event.venue_name, event.starts_at),
    };
  }, [event, link, shareTag]);

  const colors = POSTER_COLORS[variant];

  const goBack = () => {
    if (canGoBack()) navigate(-1);
    else navigate('/gestion', { replace: true });
  };

  const download = async () => {
    if (!content || !event) return;
    setDownloading(true);
    try {
      const blob = await renderPosterPng(content, variant);
      const fileName = `qr-${slug(content.artist) || 'concierto'}-${variant === 'dark' ? 'oscuro' : 'papel'}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });
      if (Capacitor.isNativePlatform() && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'QR del concierto' });
        return;
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err: any) {
      if (err?.name !== 'AbortError') setError(err?.message || 'No se ha podido descargar la imagen.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex h-dvh flex-col bg-app-bg text-app-ink print:block print:h-auto print:bg-white">
      <style>{`@media print { @page { size: A4 portrait; margin: 0; } html, body, #root { height: auto !important; background: ${colors.ground} !important; } }`}</style>
      <header className="flex items-center gap-2 px-3 pt-[calc(10px+env(safe-area-inset-top,0px))] print:hidden">
        <button
          type="button"
          onClick={goBack}
          aria-label="Volver"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-app-line bg-app-surface text-app-ink"
        >
          <IconChevronLeft size={22} />
        </button>
        <h1 className="flex-1 font-display text-lg font-bold">QR para la sala</h1>
        <div role="radiogroup" aria-label="Estilo" className="flex rounded-full border border-app-line p-[3px]">
          {(['paper', 'dark'] as const).map(option => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={variant === option}
              onClick={() => setVariant(option)}
              className={`min-h-[38px] rounded-full px-3 text-xs font-semibold ${
                variant === option ? 'bg-app-ink text-app-bg' : 'text-white/70'
              }`}
            >
              {option === 'paper' ? 'Papel' : 'Oscuro'}
            </button>
          ))}
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto pb-6 print:overflow-visible print:p-0">
        {loading ? (
          <div className="flex justify-center py-16 print:hidden"><Spinner /></div>
        ) : error || !content ? (
          <p role="alert" className="px-4 pt-8 text-sm text-rose-300 print:hidden">{error || 'No se ha podido generar el QR.'}</p>
        ) : (
          <>
            <section
              aria-label="Cartel con QR"
              className="mx-6 mt-4 rounded-md px-5 py-6 shadow-[0_18px_40px_rgba(0,0,0,0.5)] [print-color-adjust:exact] print:m-0 print:flex print:min-h-screen print:flex-col print:justify-between print:rounded-none print:px-[14mm] print:py-[16mm] print:shadow-none"
              style={{ background: colors.ground, color: colors.ink }}
            >
              <div>
                <p className="font-mono text-[11px] font-semibold tracking-[0.08em] print:text-[16pt]">{content.kicker}</p>
                <h2 className="mt-2 font-poster text-[46px] leading-[0.86] print:text-[72pt]">
                  Sube lo que
                  <br />
                  <span style={{ color: colors.accent }}>grabes</span> esta noche
                </h2>
              </div>
              <div className="mx-auto mt-[18px] w-[190px] rounded bg-white p-2.5 print:w-[120mm] print:p-[6mm]">
                <div
                  role="img"
                  aria-label="Código QR del concierto"
                  className="[&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
                  dangerouslySetInnerHTML={{ __html: svg }}
                />
              </div>
              <p className="mt-3 text-center font-display text-[13px] font-bold print:text-[18pt]">
                Etiqueta tus vídeos con <span style={{ color: colors.accent }}>{content.shareTag}</span>
              </p>
              <div className="mt-3 flex items-center justify-between gap-3 border-t-2 pt-2.5" style={{ borderColor: colors.ink }}>
                <span className="min-w-0 truncate font-poster text-[22px] print:text-[32pt]">{content.artist}</span>
                <span className="flex shrink-0 items-center gap-1.5 font-display text-[13px] font-bold print:text-[16pt]">
                  <BrandMark color={colors.accent} />
                  Live Space
                </span>
              </div>
            </section>
            <p className="mx-6 mt-3.5 text-center text-[13px] text-white/70 print:hidden">
              Al escanearlo se abre la subida con este concierto ya elegido.
            </p>
          </>
        )}
      </main>

      {!loading && content ? (
        <footer className="flex gap-2 border-t border-app-line bg-app-bg/95 px-4 pb-[calc(16px+env(safe-area-inset-bottom,0px))] pt-2.5 print:hidden">
          <Button variant="secondary" size="lg" className="flex-1" onClick={() => window.print()}>
            Imprimir
          </Button>
          <Button size="lg" className="flex-1 font-bold" onClick={download} disabled={downloading}>
            {downloading ? <Spinner className="h-4 w-4" /> : null}
            Descargar PNG
          </Button>
        </footer>
      ) : null}
    </div>
  );
};

export default EventQr;
