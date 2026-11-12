import { useEffect, useRef } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { canGoBack, trackNavigation } from './useGoBack';
import { settingsParentPath } from '../features/settings/settingsPaths';

const OVERLAY_SELECTOR = '[data-app-overlay]';

type AppBackHandlerProps = {
  mainTabPath?: string;
};

// Android's back button/gesture: close the open sheet, then step out of Ajustes,
// then go to the previous page in the real history. With nothing behind,
// go home, and from home leave the app.
const AppBackHandler: React.FC<AppBackHandlerProps> = ({ mainTabPath = '/tabs/events' }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const locationRef = useRef(location);
  const lastHandledAtRef = useRef(0);

  const navigationType = useNavigationType();

  // Keep the in-app history that canGoBack() reads (web and native alike).
  useEffect(() => {
    locationRef.current = location;
    trackNavigation(navigationType, location.key);
  }, [location, navigationType]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;

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
      // Ajustes: a section goes back to its list, the list to the profile.
      const settingsParent = settingsParentPath(current.pathname);
      if (settingsParent) {
        navigate(settingsParent, { replace: true });
        return;
      }

      if (canGoBack()) {
        navigate(-1);
      } else if (current.pathname !== mainTabPath) {
        navigate(mainTabPath, { replace: true });
      } else {
        void CapacitorApp.exitApp();
      }
    };

    // MainActivity forwards every back press as a `backbutton` DOM event.
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
