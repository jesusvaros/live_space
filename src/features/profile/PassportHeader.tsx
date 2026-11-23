import React from 'react';
import Avatar from '../../components/ui/Avatar';
import { IconMap, IconMic, IconSettings, IconTicket } from '../../components/icons';

export type PassportStats = { concerts: number; venues: number; artists: number };

export type PassportLink = { key: string; label: string; icon: React.ReactNode; onSelect: () => void };

type PassportHeaderProps = {
  name: string;
  subline: string;
  avatarUrl?: string | null;
  /** A managed artist or venue: square photo with its mic/pin, no stats. */
  entityKind?: 'artist' | 'venue' | null;
  /** The fan's collected concerts, venues and artists; hidden when null or 0. */
  stats?: PassportStats | null;
  links?: PassportLink[];
  onSettings: () => void;
  onStatSelect?: () => void;
};

// The top of the profile as a concert passport: who you are, then how many
// concerts, venues and artists you have collected (ticket, pin, mic), then
// two shortcuts. Flow layout; the stage light is decoration only.
const PassportHeader: React.FC<PassportHeaderProps> = ({
  name,
  subline,
  avatarUrl,
  entityKind = null,
  stats = null,
  links = [],
  onSettings,
  onStatSelect,
}) => {
  const statItems = stats
    ? [
        { key: 'concerts', value: stats.concerts, label: stats.concerts === 1 ? 'concierto' : 'conciertos', icon: <IconTicket size={16} /> },
        { key: 'venues', value: stats.venues, label: stats.venues === 1 ? 'sala' : 'salas', icon: <IconMap size={16} /> },
        { key: 'artists', value: stats.artists, label: stats.artists === 1 ? 'artista' : 'artistas', icon: <IconMic size={16} /> },
      ]
    : [];

  return (
    <header className="relative overflow-hidden px-4 pb-2 pt-[calc(16px+env(safe-area-inset-top,0px))]">
      <span
        aria-hidden
        className="pointer-events-none absolute -top-28 left-[-10%] h-64 w-[120%] rounded-[50%] bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--app-accent)_26%,transparent),transparent)]"
      />
      <div className="relative flex items-center gap-3.5">
        {entityKind ? (
          <Avatar name={name} src={avatarUrl} kind={entityKind} badge className="h-[72px] w-[72px] text-[24px]" />
        ) : (
          <span className="shrink-0 rounded-full p-[3px] ring-2 ring-app-accent">
            {avatarUrl ? (
              <Avatar name={name} src={avatarUrl} className="h-[66px] w-[66px] text-[24px]" />
            ) : (
              <span className="flex h-[66px] w-[66px] items-center justify-center rounded-full bg-app-accent font-poster text-[26px] text-[#14151a]">
                Tú
              </span>
            )}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-[26px] font-bold leading-tight text-app-ink">{name}</h1>
          <p className="mt-0.5 truncate text-sm text-white/55">{subline}</p>
        </div>
        <button
          type="button"
          aria-label="Ajustes"
          onClick={onSettings}
          className="flex h-11 w-11 shrink-0 items-center justify-center self-start rounded-full border border-app-line bg-app-surface/80 text-app-ink backdrop-blur"
        >
          <IconSettings size={20} />
        </button>
      </div>

      {stats && stats.concerts > 0 ? (
        <div className="relative mt-5 grid grid-cols-3 gap-2">
          {statItems.map(stat => (
            <button
              key={stat.key}
              type="button"
              onClick={onStatSelect}
              className="flex flex-col items-start rounded-2xl border border-app-line bg-app-surface/70 px-3 py-2.5 text-left transition-transform active:scale-95 motion-reduce:transition-none"
            >
              <span aria-hidden className="text-white/45">{stat.icon}</span>
              <span className="mt-1.5 font-poster text-[30px] leading-none text-app-ink">{stat.value}</span>
              <span className="mt-1 text-[11px] text-white/55">{stat.label}</span>
            </button>
          ))}
        </div>
      ) : null}

      {links.length > 0 ? (
        <div className="relative mt-3 flex gap-2">
          {links.map(link => (
            <button
              key={link.key}
              type="button"
              onClick={link.onSelect}
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-app-line bg-app-surface/70 px-3.5 text-[13px] font-semibold text-app-ink transition-transform active:scale-95 motion-reduce:transition-none"
            >
              <span aria-hidden className="text-app-accent">{link.icon}</span>
              {link.label}
            </button>
          ))}
        </div>
      ) : null}
    </header>
  );
};

export default PassportHeader;
