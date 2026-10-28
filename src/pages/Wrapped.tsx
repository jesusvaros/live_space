import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { Spinner, useToast } from '../components/ui/AppPrimitives';
import Avatar from '../components/ui/Avatar';
import Button from '../components/ui/Button';
import { IconCheckCircle, IconChevronLeft, IconShare } from '../components/icons';
import { useAuth } from '../contexts/AuthContext';
import { useFollowedSubjects } from '../hooks/useFollowedSubjects';
import { rememberPendingImport } from '../features/socialImport/ShareTargetListener';
import { extractWrappedCandidates } from '../features/wrapped/parseWrapped';
import { matchWrappedArtists, type CatalogArtist, type WrappedMatch } from '../features/wrapped/matchArtists';
import { recognizeImageText, usesNativeOcr } from '../features/wrapped/recognizeText';
import { loadSharedImage, WRAPPED_PATH, wrappedPathFor } from '../features/wrapped/sharedImage';
import { renderWrappedStory, shareWrappedStory } from '../features/wrapped/shareCard';
import { canGoBack } from '../app/useGoBack';

type Step =
  | { kind: 'pick'; error?: string }
  | { kind: 'reading' }
  | { kind: 'review'; matches: WrappedMatch[] }
  | { kind: 'done'; followed: CatalogArtist[]; missing: string[] };

const NO_ARTISTS =
  'No hemos encontrado artistas en esta imagen. Usa la tarjeta de «Tus artistas favoritos» del Wrapped, sin recortar los nombres.';

const Wrapped: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const { presentToast } = useToast();
  const { canFollow, isFollowing, followMany } = useFollowedSubjects();
  const sharedImage = useMemo(() => new URLSearchParams(location.search).get('imagen'), [location.search]);

  const [step, setStep] = useState<Step>({ kind: 'pick' });
  const [preview, setPreview] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [following, setFollowing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const startedFor = useRef<string | null>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const goBack = () => {
    if (canGoBack()) navigate(-1);
    else navigate('/tabs/discover', { replace: true });
  };

  const read = async (image: Blob) => {
    setPreview(URL.createObjectURL(image));
    setStep({ kind: 'reading' });
    try {
      const blocks = await recognizeImageText(image);
      const candidates = extractWrappedCandidates(blocks);
      if (candidates.length === 0) {
        setStep({ kind: 'pick', error: NO_ARTISTS });
        return;
      }
      const matches = await matchWrappedArtists(candidates);
      const shown = matches.filter(match => match.artist || match.candidate.listed);
      if (shown.length === 0) {
        setStep({ kind: 'pick', error: NO_ARTISTS });
        return;
      }
      setSelected(new Set(shown.flatMap(match => (match.artist ? [match.artist.subject_id] : []))));
      setStep({ kind: 'review', matches: shown });
    } catch {
      setStep({ kind: 'pick', error: 'No hemos podido leer la imagen. Comprueba tu conexión e inténtalo otra vez.' });
    }
  };

  // Arriving from the share sheet: read the shared image straight away.
  useEffect(() => {
    if (!sharedImage || authLoading || !user || startedFor.current === sharedImage) return;
    startedFor.current = sharedImage;
    loadSharedImage(sharedImage)
      .then(read)
      .catch(() => setStep({ kind: 'pick', error: 'No hemos podido abrir la imagen compartida. Elígela desde la galería.' }));
  }, [sharedImage, authLoading, user]);

  const onPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void read(file);
  };

  const matched = step.kind === 'review' ? step.matches.filter(match => match.artist) : [];
  const missing = step.kind === 'review' ? step.matches.filter(match => !match.artist) : [];
  const toFollow = matched
    .map(match => match.artist!.subject_id)
    .filter(id => selected.has(id) && !isFollowing(id));
  const alreadyFollowed = matched.filter(match => isFollowing(match.artist!.subject_id)).length;

  const toggle = (subjectId: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(subjectId)) next.delete(subjectId);
      else next.add(subjectId);
      return next;
    });

  const follow = async () => {
    if (step.kind !== 'review') return;
    if (!canFollow) {
      navigate('/welcome');
      return;
    }
    setFollowing(true);
    const result = await followMany(toFollow);
    setFollowing(false);
    if (!result.ok) {
      presentToast({ message: 'No se pudo seguir. Inténtalo de nuevo.', duration: 2000, position: 'top' });
      return;
    }
    const followedIds = new Set(toFollow);
    setStep({
      kind: 'done',
      followed: matched
        .map(match => match.artist!)
        .filter(artist => followedIds.has(artist.subject_id) || isFollowing(artist.subject_id)),
      missing: missing.map(match => match.candidate.name),
    });
  };

  const share = async (artists: CatalogArtist[]) => {
    setSharing(true);
    try {
      const names = artists.slice(0, 5).map(artist => artist.name);
      const blob = await renderWrappedStory(names);
      const outcome = await shareWrappedStory(blob, names.length);
      if (outcome === 'downloaded') {
        presentToast({ message: 'Imagen descargada. Súbela a tu story.', duration: 2500, position: 'top' });
      }
    } catch {
      presentToast({ message: 'No se pudo crear la imagen.', duration: 2000, position: 'top' });
    } finally {
      setSharing(false);
    }
  };

  const reset = () => {
    startedFor.current = null;
    setPreview(null);
    setStep({ kind: 'pick' });
    if (sharedImage) navigate(WRAPPED_PATH, { replace: true });
  };

  const header = (
    <div className="sticky top-0 z-[1200] flex items-center gap-2 border-b border-app-line bg-app-bg/95 px-3 pb-2 pt-[calc(8px+env(safe-area-inset-top,0px))] backdrop-blur">
      <button
        type="button"
        onClick={goBack}
        aria-label="Volver"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white"
      >
        <IconChevronLeft size={22} />
      </button>
      <p className="font-display text-base font-bold text-white">Importa tu Wrapped</p>
    </div>
  );

  if (!authLoading && !user) {
    return (
      <AppShell headerProps={null}>
        {header}
        <div className="flex flex-col gap-4 p-4">
          <h1 className="font-poster text-[40px] leading-[0.9] text-white">Inicia sesión para seguir a tus artistas</h1>
          <p className="text-[15px] text-white/70">Así te avisamos cuando anuncien conciertos cerca de ti.</p>
          <Button
            size="lg"
            block
            onClick={() => {
              if (sharedImage) rememberPendingImport(wrappedPathFor(sharedImage));
              navigate('/welcome');
            }}
          >
            Iniciar sesión
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell headerProps={null}>
      {header}
      <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={onPick} />

      {(step.kind === 'pick' || step.kind === 'reading') && (
        <div className="flex flex-col gap-6 p-4 pb-[calc(120px+env(safe-area-inset-bottom,0px))]">
          <div className="space-y-3">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-app-accent">Spotify Wrapped</p>
            <h1 className="font-poster text-[44px] leading-[0.9] text-white">De tu Wrapped a primera fila</h1>
            <p className="text-[15px] leading-relaxed text-white/70">
              Sube la tarjeta de tus artistas favoritos. Los seguimos por ti y te avisamos en cuanto anuncien fechas cerca.
            </p>
          </div>

          {step.kind === 'reading' ? (
            <div className="flex items-center gap-4 rounded-2xl border border-app-line bg-app-surface p-4">
              {preview ? <img src={preview} alt="" className="h-24 w-[54px] shrink-0 rounded-lg object-cover" /> : null}
              <div className="space-y-1">
                <p className="flex items-center gap-2 font-display text-[15px] font-bold text-white">
                  <Spinner className="h-4 w-4" label="Leyendo" /> Leyendo tu Wrapped…
                </p>
                <p className="text-[13px] text-white/55">
                  {usesNativeOcr() ? 'Se lee en tu móvil: la imagen no se sube.' : 'La primera vez tarda un poco más. La imagen no se sube.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {step.error ? <p className="text-sm text-rose-400" role="alert">{step.error}</p> : null}
              <Button size="lg" block onClick={() => fileInput.current?.click()}>
                Elegir captura del Wrapped
              </Button>
            </div>
          )}

          <ol className="space-y-3 rounded-2xl border border-app-line p-4 text-[14px] text-white/75">
            <li className="flex gap-3">
              <span className="font-mono text-app-accent">01</span>
              En Spotify, abre tu Wrapped y ve a la tarjeta de artistas favoritos (o el resumen final).
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-app-accent">02</span>
              Pulsa Compartir y elige Live Space, o guarda la captura y elígela aquí.
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-app-accent">03</span>
              Revisa la lista y sigue a todos de un toque.
            </li>
          </ol>
        </div>
      )}

      {step.kind === 'review' && (
        <div className="flex flex-col gap-6 p-4 pb-[calc(120px+env(safe-area-inset-bottom,0px))]">
          <div className="space-y-2">
            <h1 className="font-poster text-[40px] leading-[0.9] text-white">
              {matched.length > 0 ? `${matched.length} de tu Wrapped en Live Space` : 'Aún no tenemos a tus artistas'}
            </h1>
            {matched.length > 0 ? (
              <p className="text-[15px] text-white/70">Síguelos y te avisamos cuando anuncien conciertos cerca de ti.</p>
            ) : null}
          </div>

          {matched.length > 0 ? (
            <section className="space-y-2">
              <ul className="divide-y divide-app-line overflow-hidden rounded-2xl border border-app-line bg-app-surface">
                {matched.map(({ artist, candidate }) => {
                  const subjectId = artist!.subject_id;
                  const already = isFollowing(subjectId);
                  const on = already || selected.has(subjectId);
                  return (
                    <li key={subjectId} className="flex items-center gap-3 px-3 py-2.5">
                      <span className="w-5 shrink-0 text-center font-mono text-[12px] text-white/45">{candidate.rank ?? ''}</span>
                      <Avatar name={artist!.name} src={artist!.avatar_url} kind="artist" className="h-11 w-11 shrink-0" />
                      <Link to={`/tabs/artist/${artist!.id}`} className="min-w-0 flex-1 truncate font-display text-[15px] font-bold text-white">
                        {artist!.name}
                      </Link>
                      <button
                        type="button"
                        disabled={already}
                        aria-pressed={on}
                        aria-label={`${on ? 'No seguir' : 'Seguir'} a ${artist!.name}`}
                        onClick={() => toggle(subjectId)}
                        className={`min-h-11 shrink-0 rounded-full px-3.5 font-mono text-[11px] font-medium uppercase ${
                          on ? 'bg-app-accent/15 text-app-accent' : 'border border-app-line text-white/60'
                        } disabled:opacity-70`}
                      >
                        {already ? 'Ya lo sigues' : on ? '✓ Seguir' : '+ Seguir'}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <Button size="lg" block disabled={following || (toFollow.length === 0 && alreadyFollowed === 0)} onClick={follow}>
                {following ? <Spinner label="Siguiendo" className="h-4 w-4" /> : null}
                {toFollow.length === 0
                  ? 'Continuar'
                  : toFollow.length === matched.length
                    ? `Seguir a todos (${toFollow.length})`
                    : `Seguir a ${toFollow.length}`}
              </Button>
            </section>
          ) : null}

          {missing.length > 0 ? (
            <section className="space-y-2">
              <h2 className="font-display text-lg font-bold text-white">Aún no están en Live Space</h2>
              <ul className="flex flex-wrap gap-2">
                {missing.map(({ candidate }) => (
                  <li key={candidate.key} className="rounded-full border border-app-line px-3 py-1.5 text-[13px] text-white/65">
                    {candidate.name}
                  </li>
                ))}
              </ul>
              <p className="text-[13px] text-white/50">Cuando lleguen sus conciertos, los verás en Explorar.</p>
            </section>
          ) : null}

          <div className="flex flex-col gap-2">
            <Button variant="secondary" onClick={() => navigate('/tabs/discover')}>¿Falta alguno? Búscalo en Explorar</Button>
            <Button variant="ghost" onClick={reset}>Probar con otra captura</Button>
          </div>
        </div>
      )}

      {step.kind === 'done' && (
        <div className="flex flex-col gap-6 p-4 pb-[calc(120px+env(safe-area-inset-bottom,0px))]">
          <div className="space-y-3">
            <IconCheckCircle size={40} className="text-app-accent" />
            <h1 className="font-poster text-[44px] leading-[0.9] text-white">
              {step.followed.length === 1 ? 'Ya sigues a tu Nº1' : `Ya sigues a tus ${step.followed.length}`}
            </h1>
            <p className="text-[15px] text-white/70">
              Te avisaremos cuando {step.followed.length === 1 ? 'anuncie' : 'anuncien'} fechas cerca de ti.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {step.followed.map(artist => (
              <span key={artist.subject_id} className="flex items-center gap-2 rounded-full border border-app-line bg-app-surface py-1 pl-1 pr-3 text-[13px] text-white">
                <Avatar name={artist.name} src={artist.avatar_url} kind="artist" className="h-7 w-7 text-[11px]" />
                {artist.name}
              </span>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <Button size="lg" block disabled={sharing || step.followed.length === 0} onClick={() => share(step.followed)} icon={<IconShare className="h-4 w-4" />}>
              {sharing ? 'Preparando la imagen…' : 'Compartir en stories'}
            </Button>
            <Button variant="secondary" block onClick={() => navigate('/tabs/events')}>Ver conciertos</Button>
          </div>
        </div>
      )}
    </AppShell>
  );
};

export default Wrapped;
