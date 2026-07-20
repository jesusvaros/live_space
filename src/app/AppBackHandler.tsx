import { useEffect, useRef } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';

const MAX_HISTORY_DEPTH = 80;
const OVERLAY_SELECTOR = '[data-app-overlay]';

type AppBackHandlerProps = {
  mainTabPath?: string;
};

const AppBackHandler: React.FC<AppBackHandlerProps> = ({ mainTabPath = '/tabs/events' }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();
  const locationRef = useRef(location);
  const routeStackRef = useRef<string[]>([]);
  const lastHandledAtRef = useRef(0);
  const iosRedirectLockRef = useRef(false);

  useEffect(() => {
    locationRef.current = location;
    const currentRoute = `${location.pathname}${location.search}${location.hash}`;
    const stack = routeStackRef.current;
    const last = stack.at(-1);
    const previous = stack.at(-2);

    if (!last) {
      stack.push(currentRoute);
      return;
    }
    if (last === currentRoute) return;
    if (previous === currentRoute) {
      stack.pop();
    } else {
      stack.push(currentRoute);
      if (stack.length > MAX_HISTORY_DEPTH) stack.splice(0, stack.length - MAX_HISTORY_DEPTH);
    }

    if (
      Capacitor.getPlatform() === 'ios' &&
      navigationType === 'POP' &&
      !iosRedirectLockRef.current &&
      location.pathname.startsWith('/tabs/') &&
      location.pathname !== mainTabPath &&
      !location.search.includes('edit=')
    ) {
      iosRedirectLockRef.current = true;
      routeStackRef.current = [mainTabPath];
      navigate(mainTabPath, { replace: true });
      window.setTimeout(() => {
        iosRedirectLockRef.current = false;
      }, 0);
    }
  }, [location, mainTabPath, navigate, navigationType]);

  useEffect(() => {
    const handleBackAction = () => {
      const now = Date.now();
      if (now - lastHandledAtRef.current < 200) return;
      lastHandledAtRef.current = now;

      const visibleOverlay = Array.from(document.querySelectorAll(OVERLAY_SELECTOR)).at(-1);
      const closeButton = visibleOverlay?.nextElementSibling?.querySelector<HTMLButtonElement>('[data-modal-close]');
      if (closeButton) {
        closeButton.click();
        return;
      }

      const current = locationRef.current;
      if (current.search.includes('edit=')) {
        const params = new URLSearchParams(current.search);
        params.delete('edit');
        navigate(
          { pathname: current.pathname, search: params.toString(), hash: current.hash },
          { replace: true },
        );
        return;
      }

      if (current.pathname.startsWith('/tabs/') && current.pathname !== mainTabPath) {
        routeStackRef.current = [mainTabPath];
        navigate(mainTabPath, { replace: true });
        return;
      }

      const stack = routeStackRef.current;
      if (stack.length > 1) {
        stack.pop();
        navigate(stack.at(-1) ?? mainTabPath, { replace: true });
        return;
      }

      if (window.history.length > 1) {
        navigate(-1);
      } else if (current.pathname !== mainTabPath) {
        navigate(mainTabPath, { replace: true });
      }
    };

    const nativeBackHandler = (event: Event) => {
      event.preventDefault();
      handleBackAction();
    };

    document.addEventListener('backbutton', nativeBackHandler);
    return () => document.removeEventListener('backbutton', nativeBackHandler);
  }, [mainTabPath, navigate]);

  return null;
};

export default AppBackHandler;
