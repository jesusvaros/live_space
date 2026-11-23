import React from 'react';

// Each home section is told apart by its icon's shape (ticket, heart, bell,
// flag, calendar) and a short line above the title, all in the app's
// neutral colours: no per-section colour, so the home stays clean. Plain flow
// layout: nothing absolute, nothing to clip.
type HomeSectionHeaderProps = {
  id?: string;
  title: string;
  kicker: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
};

const HomeSectionHeader: React.FC<HomeSectionHeaderProps> = ({ id, title, kicker, icon, action }) => (
  <div className="flex items-center justify-between gap-3">
    <div className="flex min-w-0 items-center gap-3">
      <span
        aria-hidden="true"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-app-line bg-app-surface text-app-ink"
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="font-mono text-[10px] font-semibold uppercase leading-none tracking-[0.12em] text-white/45">{kicker}</p>
        <h2 id={id} className="mt-1 truncate font-display text-[26px] font-bold leading-[1.1] text-app-ink">
          {title}
        </h2>
      </div>
    </div>
    {action}
  </div>
);

export default HomeSectionHeader;
