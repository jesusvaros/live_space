import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { resetScrollChrome, useScrollChromeCollapsed } from '../shared/hooks/useScrollChrome';

// Floating capsule like HolyCook's AsideMobile: a pill slides to the active
// tab (transform only) and the labels fold away while scrolling down.

type NavIconProps = { active: boolean };

const stroke = (active: boolean) => (active ? '#ff5b2e' : 'currentColor');

const IconInicio: React.FC<NavIconProps> = ({ active }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={stroke(active)} strokeWidth="1.75" aria-hidden="true">
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
);
const IconExplorar: React.FC<NavIconProps> = ({ active }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={stroke(active)} strokeWidth="1.75" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M15.5 8.5l-2 5-5 2 2-5z" />
  </svg>
);
const IconMapa: React.FC<NavIconProps> = ({ active }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={stroke(active)} strokeWidth="1.75" aria-hidden="true">
    <path d="M12 21s-7-6.2-7-11.5a7 7 0 0114 0C19 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </svg>
);
const IconMomentos: React.FC<NavIconProps> = ({ active }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={stroke(active)} strokeWidth="1.75" aria-hidden="true">
    <path d="M7 4l13 8-13 8z" />
  </svg>
);
const IconPerfil: React.FC<NavIconProps> = ({ active }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={stroke(active)} strokeWidth="1.75" aria-hidden="true">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
  </svg>
);

type TabKey = 'inicio' | 'explorar' | 'mapa' | 'momentos' | 'perfil';

const INDICATOR_EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const INDICATOR_MOVE = `transform 280ms ${INDICATOR_EASE}, width 280ms ${INDICATOR_EASE}, opacity 160ms ease-out`;
const INDICATOR_FADE = 'opacity 160ms ease-out';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

const tabFromPath = (pathname: string, profileTabHref: string): TabKey | null => {
  if (pathname.startsWith('/tabs/events') || /^\/(madrid|barcelona)\/conciertos/.test(pathname)) return 'inicio';
  if (pathname.startsWith('/tabs/discover')) return 'explorar';
  if (pathname.startsWith('/tabs/map')) return 'mapa';
  if (pathname.startsWith('/tabs/feed') || pathname.startsWith('/tabs/mySpace')) return 'momentos';
  if (pathname.startsWith('/tabs/profile') || pathname === profileTabHref) return 'perfil';
  return null;
};

// Detail screens bring their own back header and bottom action bar.
export const isDetailRoute = (pathname: string) =>
  /^\/tabs\/(artist|venue|upload|create-event)\b/.test(pathname) ||
  /^\/(artista|sala)\//.test(pathname) ||
  /^\/(event|concierto|post)\//.test(pathname) ||
  // Management screens (/gestion, its stats and QR, /reclamar) are full screen.
  /^\/(gestion|reclamar)(\/|$)/.test(pathname);

// Bottom padding a scrolling page needs so its end is not hidden by the bar.
export const NAV_CLEARANCE = 'pb-[calc(96px+env(safe-area-inset-bottom,0px))]';

type BottomNavProps = {
  mainTabHref: string;
  profileTabHref: string;
};

const BottomNav: React.FC<BottomNavProps> = ({ mainTabHref, profileTabHref }) => {
  const { pathname } = useLocation();
  const compact = useScrollChromeCollapsed();
  const activeKey = tabFromPath(pathname, profileTabHref);

  const tabsRef = useRef<HTMLElement | null>(null);
  const indicatorRef = useRef<HTMLSpanElement | null>(null);
  const activeKeyRef = useRef(activeKey);
  activeKeyRef.current = activeKey;
  const placedRef = useRef(false);
  const frameRef = useRef(0);

  // A new screen always starts with the full bar.
  useEffect(() => {
    resetScrollChrome();
  }, [pathname]);

  const applyIndicator = useCallback((key: TabKey | null, animate: boolean) => {
    const tabs = tabsRef.current;
    const indicator = indicatorRef.current;
    if (!tabs || !indicator) return;
    const motion = animate && !prefersReducedMotion();
    const target = key ? tabs.querySelector<HTMLElement>(`[data-nav-key="${key}"]`) : null;
    if (!target) {
      indicator.style.transition = motion ? INDICATOR_FADE : 'none';
      indicator.style.opacity = '0';
      return;
    }
    const wasHidden = indicator.style.opacity !== '1';
    indicator.style.transition = !motion ? 'none' : wasHidden ? INDICATOR_FADE : INDICATOR_MOVE;
    indicator.style.width = `${target.offsetWidth}px`;
    indicator.style.transform = `translate3d(${target.offsetLeft}px, 0, 0)`;
    indicator.style.opacity = '1';
  }, []);

  // Two frames later: the tap's frame is the expensive one (the new page
  // mounts) and a transition started in it loses its beginning.
  const placeIndicator = useCallback(
    (key: TabKey | null, animate: boolean) => {
      cancelAnimationFrame(frameRef.current);
      if (!animate || prefersReducedMotion()) {
        applyIndicator(key, false);
        return;
      }
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = requestAnimationFrame(() => applyIndicator(key, true));
      });
    },
    [applyIndicator],
  );

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  useLayoutEffect(() => {
    placeIndicator(activeKey, placedRef.current);
    placedRef.current = true;
  }, [activeKey, placeIndicator]);

  // Rotation or font load changes the tab widths: re-place without travelling.
  useEffect(() => {
    const tabs = tabsRef.current;
    if (!tabs || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => placeIndicator(activeKeyRef.current, false));
    observer.observe(tabs);
    return () => observer.disconnect();
  }, [placeIndicator]);

  const tabs: { key: TabKey; to: string; label: string; Icon: React.FC<NavIconProps> }[] = [
    { key: 'inicio', to: mainTabHref, label: 'Inicio', Icon: IconInicio },
    { key: 'explorar', to: '/tabs/discover', label: 'Explorar', Icon: IconExplorar },
    { key: 'mapa', to: '/tabs/map', label: 'Mapa', Icon: IconMapa },
    { key: 'momentos', to: '/tabs/feed', label: 'Momentos', Icon: IconMomentos },
    { key: 'perfil', to: profileTabHref, label: 'Perfil', Icon: IconPerfil },
  ];

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[2000] flex justify-center px-3 pb-[calc(10px+env(safe-area-inset-bottom,0px))] print:hidden"
    >
      <nav
        ref={tabsRef}
        aria-label="Navegación principal"
        data-testid="bottom-nav"
        data-compact={compact ? 'true' : 'false'}
        className="pointer-events-auto relative flex w-full max-w-[34rem] items-stretch gap-0.5 rounded-full border border-white/10 bg-app-surface/85 p-1 shadow-[0_8px_28px_rgba(0,0,0,0.45)] backdrop-blur-xl backdrop-saturate-150"
      >
        <span
          ref={indicatorRef}
          aria-hidden
          data-testid="bottom-nav-indicator"
          className="pointer-events-none absolute bottom-1 left-0 top-1 rounded-full bg-app-ink/[0.12] opacity-0 will-change-transform"
        />
        {tabs.map(({ key, to, label, Icon }) => {
          const active = key === activeKey;
          return (
            <NavLink
              key={key}
              to={to}
              data-nav-key={key}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              className={`relative flex min-w-0 flex-1 flex-col items-center justify-center overflow-hidden rounded-full px-0.5 transition-[padding,gap] duration-200 [transition-timing-function:cubic-bezier(0.2,0,0,1)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/40 motion-reduce:transition-none ${
                compact ? 'gap-0 py-[9px]' : 'gap-0.5 py-1.5'
              } ${active ? 'font-semibold text-app-ink' : 'font-medium text-[#a9a59d] hover:text-app-ink'}`}
            >
              <span className="relative z-10 flex h-6 w-6 items-center justify-center">
                <Icon active={active} />
              </span>
              <span
                aria-hidden
                className={`relative z-10 max-w-full truncate text-[11px] leading-[14px] transition-[max-height,opacity,transform] duration-200 [transition-timing-function:cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none ${
                  compact ? 'max-h-0 -translate-y-1 opacity-0' : 'max-h-3.5 opacity-100'
                }`}
              >
                {label}
              </span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
};

export default BottomNav;
