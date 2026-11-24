import React from 'react';
import Avatar from '../../components/ui/Avatar';
import { IconSettings } from '../../components/icons';

export type PassportLink = { key: string; label: string; icon: React.ReactNode; onSelect: () => void };

type PassportHeaderProps = {
  name: string;
  subline: string;
  avatarUrl?: string | null;
  /** A managed artist or venue: square photo with its mic/pin. */
  entityKind?: 'artist' | 'venue' | null;
  links?: PassportLink[];
  onSettings: () => void;
};

// The top of the profile: who you are and two shortcuts. No counters: the
// concert history lives in the «Conciertos» tab. Flow layout; the stage light
// is decoration only.
const PassportHeader: React.FC<PassportHeaderProps> = ({
  name,
  subline,
  avatarUrl,
  entityKind = null,
  links = [],
  onSettings,
}) => {
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


      {links.length > 0 ? (
        <div className="relative mt-4 flex gap-2">
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
