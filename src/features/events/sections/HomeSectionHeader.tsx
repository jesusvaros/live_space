import React from 'react';

// Each home section gets its own colour and icon, so «Voy», «Para ti», «Lo
// que sigues», «Festivales» and «Cartelera» stop looking all the same while
// scrolling. Plain flow layout: nothing absolute, nothing to clip.
export const HOME_SECTION_TONES = {
  going: '#ff5b2e',
  forYou: '#b18cff',
  following: '#3fd0c0',
  festivals: '#ffc83d',
  listings: '#ff7ab6',
} as const;

type HomeSectionHeaderProps = {
  id?: string;
  title: string;
  kicker: string;
  tone: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
};

const HomeSectionHeader: React.FC<HomeSectionHeaderProps> = ({
  id,
  title,
  kicker,
  tone,
  icon,
  action,
}) => (
  <div className='flex items-center justify-between gap-3'>
    <div className='flex min-w-0 items-center gap-3'>
      <span
        aria-hidden='true'
        className='flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border'
        style={{
          color: tone,
          backgroundColor: `color-mix(in srgb, ${tone} 16%, transparent)`,
          borderColor: `color-mix(in srgb, ${tone} 35%, transparent)`,
        }}
      >
        {icon}
      </span>
      <div className='min-w-0'>
        <p
          className='font-mono text-[10px] font-semibold uppercase leading-none tracking-[0.12em]'
          style={{ color: tone }}
        >
          {kicker}
        </p>
        <h2
          id={id}
          className='mt-1 truncate font-display text-[26px] font-bold leading-[1.1] text-app-ink'
        >
          {title}
        </h2>
      </div>
    </div>
    {action}
  </div>
);

export default HomeSectionHeader;
