import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { startAnalytics, track } from './analytics';
import { appScreenName } from './props';

/** In the router: app_open once per launch, then `screen { path }` on every route change. */
export const useAppAnalytics = () => {
  const { pathname } = useLocation();
  const last = useRef<string | null>(null);

  useEffect(() => {
    startAnalytics();
  }, []);

  useEffect(() => {
    const path = appScreenName(pathname);
    if (path === last.current) return;
    last.current = path;
    track('screen', { path });
  }, [pathname]);
};
