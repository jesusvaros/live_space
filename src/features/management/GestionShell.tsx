import React from 'react';
import { useNavigate } from 'react-router-dom';
import { IconChevronLeft } from '../../components/icons';
import { canGoBack } from '../../app/useGoBack';

// Full-screen page inside /gestion: back button, a short kicker + title, the
// content scrolling under it and an optional bar pinned to the bottom.
const GestionShell: React.FC<{
  kicker?: string;
  title: string;
  backTo?: string;
  footer?: React.ReactNode;
  /** The content pins its own bar to the bottom (no bottom padding). */
  flushBottom?: boolean;
  children: React.ReactNode;
}> = ({ kicker, title, backTo = '/gestion', footer, flushBottom = false, children }) => {
  const navigate = useNavigate();
  const goBack = () => {
    if (canGoBack()) navigate(-1);
    else navigate(backTo, { replace: true });
  };
  return (
    <div className="flex h-dvh flex-col bg-app-bg text-app-ink">
      <header className="flex items-center gap-3 px-3 pb-2 pt-[calc(10px+env(safe-area-inset-top,0px))]">
        <button
          type="button"
          onClick={goBack}
          aria-label="Volver"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-app-line bg-app-surface text-app-ink"
        >
          <IconChevronLeft size={22} />
        </button>
        <div className="min-w-0 flex-1">
          {kicker ? <p className="truncate font-mono text-[11px] font-semibold uppercase text-white/50">{kicker}</p> : null}
          <h1 className="truncate font-display text-xl font-bold leading-tight text-app-ink">{title}</h1>
        </div>
      </header>
      <main
        className={`min-h-0 flex-1 overflow-y-auto px-4 ${flushBottom ? '' : 'pb-[calc(24px+env(safe-area-inset-bottom,0px))]'}`}
      >
        {children}
      </main>
      {footer ? (
        <div className="border-t border-app-line bg-app-bg/95 px-4 pb-[calc(12px+env(safe-area-inset-bottom,0px))] pt-3 backdrop-blur">
          {footer}
        </div>
      ) : null}
    </div>
  );
};

export default GestionShell;
