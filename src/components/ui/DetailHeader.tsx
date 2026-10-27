import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconChevronLeft } from '../icons';

type DetailHeaderProps = {
  title: string;
  actions?: React.ReactNode;
  // Element whose scroll decides when the bar turns solid and shows the title.
  scrollRef?: React.RefObject<HTMLElement | null>;
  fallbackHref?: string;
};

// Floating back bar over a detail page's hero. Solid with the title once the
// hero has scrolled away.
const DetailHeader: React.FC<DetailHeaderProps> = ({ title, actions, scrollRef, fallbackHref = '/tabs/events' }) => {
  const navigate = useNavigate();
  const [solid, setSolid] = useState(false);

  useEffect(() => {
    const node = scrollRef?.current;
    if (!node) return;
    const onScroll = () => setSolid(node.scrollTop > 180);
    onScroll();
    node.addEventListener('scroll', onScroll, { passive: true });
    return () => node.removeEventListener('scroll', onScroll);
  }, [scrollRef]);

  const goBack = () => {
    if (window.history.state && window.history.state.idx > 0) navigate(-1);
    else navigate(fallbackHref, { replace: true });
  };

  return (
    <div
      className={`absolute inset-x-0 top-0 z-[1300] flex items-center gap-2 px-3 pb-2 pt-[calc(8px+env(safe-area-inset-top,0px))] transition-colors ${
        solid ? 'border-b border-app-line bg-app-bg/95 backdrop-blur' : 'bg-gradient-to-b from-black/55 to-transparent'
      }`}
    >
      <button
        type="button"
        onClick={goBack}
        aria-label="Volver"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white backdrop-blur-md"
      >
        <IconChevronLeft size={22} />
      </button>
      <p
        className={`min-w-0 flex-1 truncate font-display text-base font-bold text-white transition-opacity ${
          solid ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {title}
      </p>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
};

export default DetailHeader;
