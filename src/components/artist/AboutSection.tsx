import React from 'react';
import { ArtistProfileArtist } from './types';
import { IconMap } from '../icons';
import { LINK_LABELS, SocialIcon, type SocialKey } from './ArtistHero';

type AboutSectionProps = {
  artist: ArtistProfileArtist;
  isManager: boolean;
  externalLinks: { key: string; value: string }[];
  pastCount: number;
  onShowConcerts: () => void;
  onCreateShow: () => void;
  onEditLinks: () => void;
  onOpenMap: () => void;
};

// What a fan wants from a band besides the dates: where to listen and follow.
// "@name" for profiles, the bare domain for anything else.
const linkDetail = (key: string, url: string) => {
  try {
    const parsed = new URL(url);
    const first = parsed.pathname.split('/').filter(Boolean)[0];
    if ((key === 'instagram' || key === 'youtube') && first) return first.startsWith('@') ? first : `@${first}`;
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

const AboutSection: React.FC<AboutSectionProps> = ({
  artist,
  isManager,
  externalLinks,
  pastCount,
  onShowConcerts,
  onCreateShow,
  onEditLinks,
  onOpenMap,
}) => (
  <section className="flex flex-col gap-5">
    {artist.bio ? <p className="text-[15px] leading-relaxed text-[#e4e0d8]">{artist.bio}</p> : null}

    <div>
      <h2 className="mb-1 font-display text-lg font-bold text-app-ink">Escúchalo y síguelo</h2>
      {externalLinks.length ? (
        <ul className="divide-y divide-app-line">
          {externalLinks.map(link => {
            const key = link.key as SocialKey;
            return (
              <li key={key}>
                <a href={link.value} target="_blank" rel="noreferrer" className="flex min-h-[56px] items-center gap-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-app-accent/15 text-app-accent">
                    <SocialIcon name={key} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-app-ink">{LINK_LABELS[key]}</span>
                    <span className="block truncate text-[13px] text-[#a9a59d]">{linkDetail(key, link.value)}</span>
                  </span>
                  <span aria-hidden className="text-lg text-white/40">↗</span>
                </a>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-white/60">
          Aún no ha añadido sus redes.
          {isManager ? (
            <button type="button" onClick={onEditLinks} className="ml-1 font-semibold text-app-accent">
              Añadir enlaces
            </button>
          ) : null}
        </p>
      )}
    </div>

    {pastCount > 0 ? (
      <button type="button" onClick={onShowConcerts} className="flex items-baseline gap-2 text-left">
        <span className="font-poster text-4xl leading-none text-app-ink">{pastCount}</span>
        <span className="text-[15px] text-[#c9c5bd]">
          {pastCount === 1 ? 'concierto' : 'conciertos'} en Live Space · <span className="font-semibold text-app-accent">ver historial</span>
        </span>
      </button>
    ) : null}

    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={onOpenMap}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-app-line px-4 text-sm font-semibold text-app-ink"
      >
        <IconMap size={16} />
        Ver en el mapa
      </button>
      {isManager ? (
        <button
          type="button"
          onClick={onCreateShow}
          className="inline-flex min-h-11 items-center rounded-full border border-app-line px-4 text-sm font-semibold text-app-ink"
        >
          Crear concierto
        </button>
      ) : null}
    </div>
  </section>
);

export default AboutSection;
