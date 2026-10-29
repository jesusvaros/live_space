import React, { useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { reportPost } from '../importPost';
import { embedUrlFor, SOURCE_LABEL, type SocialSource } from '../socialUrl';
import PlatformIcon from './PlatformIcon';

// Any row that describes an imported clip: v_post_cards / v_event_posts_with_setlist
// rows, or the preview built on /importar before saving.
export type ExternalMomentPost = {
  id?: string | null;
  source?: string | null;
  external_url?: string | null;
  media_url?: string | null;
  external_id?: string | null;
  external_author_handle?: string | null;
  external_author_name?: string | null;
  thumbnail_url?: string | null;
  external_thumbnail_url?: string | null;
  caption?: string | null;
  status?: string | null;
  resolved_song_title?: string | null;
  song_title?: string | null;
};

const SOURCES: SocialSource[] = ['instagram', 'tiktok', 'youtube'];

export const isExternalPost = (post: { source?: string | null } | null | undefined): boolean =>
  !!post && SOURCES.includes(post.source as SocialSource);

const FALLBACK_BACKGROUND: Record<SocialSource, string> = {
  instagram: 'bg-[radial-gradient(120%_90%_at_10%_100%,rgba(253,176,69,0.35),transparent_55%),radial-gradient(120%_90%_at_90%_0%,rgba(131,58,180,0.45),transparent_60%)]',
  tiktok: 'bg-[radial-gradient(110%_80%_at_0%_0%,rgba(37,244,238,0.28),transparent_55%),radial-gradient(110%_80%_at_100%_100%,rgba(254,44,85,0.32),transparent_55%)]',
  youtube: 'bg-[radial-gradient(120%_90%_at_50%_0%,rgba(255,0,51,0.35),transparent_60%)]',
};

// Hands off to the platform's app when installed (App Links / Universal Links).
const openOriginal = (url: string) => {
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
};

type ExternalMomentCardProps = {
  post: ExternalMomentPost;
  // card: media + credit footer (post page). fill: fills its parent with
  // credit and link overlaid. media: fills its parent with only the play
  // button, label and credit centred, for screens that draw their own overlays
  // (full-screen Momentos, the concert's song player).
  variant?: 'card' | 'fill' | 'media';
  className?: string;
  // Hide "Reportar" (e.g. the import preview, before the post exists).
  hideReport?: boolean;
};

// An imported Instagram/TikTok/YouTube clip. Shows the platform's thumbnail and
// plays the original in the platform's own player on tap; never a copy.
const ExternalMomentCard: React.FC<ExternalMomentCardProps> = ({ post, variant = 'card', className, hideReport }) => {
  const { user } = useAuth();
  const [playing, setPlaying] = useState(false);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const [reportState, setReportState] = useState<'idle' | 'confirm' | 'sending' | 'sent' | 'error'>('idle');

  // An unknown source must never fall back to another platform's player.
  const knownSource = SOURCES.includes(post.source as SocialSource);
  const source = (knownSource ? post.source : 'youtube') as SocialSource;
  const label = SOURCE_LABEL[source];
  const url = post.external_url || post.media_url || '';
  const thumbnail = thumbnailFailed ? null : post.external_thumbnail_url || post.thumbnail_url || null;
  const handle = post.external_author_handle?.replace(/^@/, '') || null;
  // Link-only Instagram cards (no Meta token) know no author: the platform shows it.
  const author = handle ? `@${handle}` : post.external_author_name || null;
  const credit = author ?? `Clip de ${label}`;
  const song = post.resolved_song_title || post.song_title || null;
  const canEmbed = knownSource && !!post.external_id;
  const fill = variant === 'fill' || variant === 'media';
  const bare = variant === 'media';

  const handleReport = async () => {
    if (!post.id || !user) return;
    setReportState('sending');
    try {
      await reportPost(post.id, user.id, 'external_clip');
      setReportState('sent');
    } catch {
      setReportState('error');
    }
  };

  const viewButton = (compact: boolean) => (
    <button
      type="button"
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white font-semibold text-[#14151a] ${
        compact ? 'min-h-9 px-3 text-xs' : 'min-h-11 px-4 text-[13px]'
      }`}
      onClick={() => openOriginal(url)}
    >
      <PlatformIcon source={source} size={compact ? 13 : 15} />
      Ver en {label}
    </button>
  );

  const media = (
    <div className={`relative overflow-hidden bg-black ${fill ? 'h-full w-full' : 'aspect-[4/5] w-full'}`}>
      {playing && canEmbed ? (
        <iframe
          src={embedUrlFor(source, post.external_id as string)}
          title={`Clip de ${label} de ${credit}`}
          className="absolute inset-0 h-full w-full border-0 bg-black"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        />
      ) : (
        <>
          {thumbnail ? (
            <img
              src={thumbnail}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className="absolute inset-0 h-full w-full object-cover"
              onError={() => setThumbnailFailed(true)}
            />
          ) : (
            <div className={`absolute inset-0 bg-app-surface ${FALLBACK_BACKGROUND[source]}`} />
          )}
          <div className={`absolute inset-0 ${bare ? 'bg-black/25' : fill ? 'bg-gradient-to-t from-black/85 via-black/20 to-black/30' : 'bg-gradient-to-b from-black/40 via-transparent to-black/25'}`} />
          {bare ? (
            <div className="absolute inset-x-6 top-1/2 flex -translate-y-1/2 flex-col items-center gap-3 text-center">
              <button
                type="button"
                aria-label={canEmbed ? `Reproducir el clip de ${label}` : `Ver en ${label}`}
                onClick={() => (canEmbed ? setPlaying(true) : openOriginal(url))}
                className="flex h-[60px] w-[60px] items-center justify-center rounded-full bg-app-ink/90 text-app-bg"
              >
                <svg viewBox="0 0 24 24" width={24} height={24} fill="currentColor" aria-hidden>
                  <path d="M8 5.5v13l10.5-6.5z" />
                </svg>
              </button>
              {viewButton(true)}
              <p className="max-w-full truncate rounded-full bg-black/45 px-2.5 py-1 text-[12px] text-white/85">
                {author ? `Vídeo de ${author} en ${label}` : `Vídeo publicado en ${label}`}
              </p>
            </div>
          ) : (
          <button
            type="button"
            className="absolute inset-0 flex items-center justify-center"
            aria-label={canEmbed ? `Reproducir el clip de ${label}` : `Ver en ${label}`}
            onClick={() => (canEmbed ? setPlaying(true) : openOriginal(url))}
          >
            <span
              className={`flex items-center justify-center rounded-full border border-white/25 bg-black/50 text-white backdrop-blur-md ${
                fill ? 'h-12 w-12' : 'h-16 w-16'
              }`}
            >
              <svg viewBox="0 0 24 24" width={fill ? 20 : 26} height={fill ? 20 : 26} fill="currentColor" aria-hidden>
                <path d="M8 5.5v13l10.5-6.5z" />
              </svg>
            </span>
          </button>
          )}
        </>
      )}

      {bare && playing ? (
        <div className="absolute left-1/2 top-3 -translate-x-1/2">{viewButton(true)}</div>
      ) : null}

      {!bare ? (
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-md">
          <PlatformIcon source={source} size={13} />
          {label}
        </span>
        {post.status === 'review' ? (
          <span className="rounded-full bg-[#f3bf4a] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#14151a]">
            En revisión
          </span>
        ) : null}
        {fill && playing ? <span className="pointer-events-auto">{viewButton(true)}</span> : null}
      </div>
      ) : null}

      {fill && !bare && !playing ? (
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3">
          <div className="pointer-events-none min-w-0">
            {song ? (
              <span className="mb-1.5 inline-flex rounded-full border border-white/20 bg-black/45 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/85">
                {song}
              </span>
            ) : null}
            <p className="truncate font-display text-base font-bold text-white">{credit}</p>
          </div>
          {viewButton(true)}
        </div>
      ) : null}
    </div>
  );

  if (fill) {
    return (
      <article className={`relative h-full w-full text-white ${className || ''}`} aria-label={`Clip de ${label} de ${credit}`}>
        {media}
      </article>
    );
  }

  return (
    <article className={`overflow-hidden bg-app-surface text-white ${className || ''}`} aria-label={`Clip de ${label} de ${credit}`}>
      {media}
      <div className="flex flex-col gap-3 p-4">
        <div className="min-w-0">
          {song ? (
            <p className="mb-1 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-app-accent">{song}</p>
          ) : null}
          <p className="text-[13px] text-white/65">
            {author ? (
              <>
                Vídeo de <span className="font-semibold text-white">{author}</span> en {label}
              </>
            ) : (
              `Vídeo publicado en ${label}; la autoría se ve en el original.`
            )}
          </p>
          {post.caption ? <p className="mt-1.5 line-clamp-2 text-[15px] leading-snug text-white/90">{post.caption}</p> : null}
        </div>
        <div className="flex items-center justify-between gap-2">
          {!hideReport && post.id && user ? (
            reportState === 'confirm' ? (
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  className="min-h-11 rounded-full bg-rose-500/90 px-3 text-xs font-semibold text-white"
                  onClick={handleReport}
                >
                  Reportar clip
                </button>
                <button
                  type="button"
                  className="min-h-11 rounded-full px-3 text-xs font-semibold text-white/60"
                  onClick={() => setReportState('idle')}
                >
                  Cancelar
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="min-h-11 rounded-full px-1 text-xs font-semibold text-white/55 disabled:opacity-60"
                disabled={reportState === 'sending' || reportState === 'sent'}
                onClick={() => setReportState('confirm')}
              >
                {reportState === 'sent' ? 'Reportado, gracias' : reportState === 'error' ? 'No se pudo reportar · Reintentar' : 'Reportar'}
              </button>
            )
          ) : (
            <span />
          )}
          {viewButton(false)}
        </div>
      </div>
    </article>
  );
};

export default ExternalMomentCard;
