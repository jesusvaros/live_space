import { useEffect, useRef } from 'react';
import { useIonRouter } from '@ionic/react';
import { useHistory, useLocation } from 'react-router-dom';

const MAX_HISTORY_DEPTH = 80;
const MAIN_TAB_PATH = '/tabs/events';
const OVERLAY_SELECTOR = 'ion-modal, ion-alert, ion-action-sheet, ion-popover, ion-picker, ion-loading';

const AppBackHandler = () => {
  const router = useIonRouter();
  const history = useHistory();
  const location = useLocation();
  const pathRef = useRef(location.pathname);
  const searchRef = useRef(location.search);
  const hashRef = useRef(location.hash);
  const routeStackRef = useRef<string[]>([]);
  const lastHandledAtRef = useRef(0);

  useEffect(() => {
    pathRef.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    searchRef.current = location.search;
  }, [location.search]);

  useEffect(() => {
    hashRef.current = location.hash;
  }, [location.hash]);

  useEffect(() => {
    const currentRoute = `${location.pathname}${location.search}${location.hash}`;
    const stack = routeStackRef.current;
    const last = stack[stack.length - 1];
    const previous = stack[stack.length - 2];

    if (!last) {
      stack.push(currentRoute);
      return;
    }

    if (last === currentRoute) {
      return;
    }

    // If navigation already moved back one step, keep the stack aligned.
    if (previous === currentRoute) {
      stack.pop();
      return;
    }

    stack.push(currentRoute);
    if (stack.length > MAX_HISTORY_DEPTH) {
      stack.splice(0, stack.length - MAX_HISTORY_DEPTH);
    }
  }, [location.hash, location.pathname, location.search]);

  useEffect(() => {
    const handleBackAction = () => {
      const now = Date.now();
      if (now - lastHandledAtRef.current < 200) {
        return;
      }
      lastHandledAtRef.current = now;

      const currentPath = pathRef.current;
      const currentSearch = searchRef.current;
      const currentRoute = `${pathRef.current}${searchRef.current}${hashRef.current}`;
      const stack = routeStackRef.current;
      const last = stack[stack.length - 1];
      if (last !== currentRoute) {
        stack.push(currentRoute);
      }

      const visibleOverlays = Array.from(document.querySelectorAll(OVERLAY_SELECTOR))
        .reverse()
        .find(overlay => !overlay.classList.contains('overlay-hidden')) as
        | (Element & { dismiss?: () => Promise<boolean> })
        | undefined;

      if (visibleOverlays?.dismiss) {
        void visibleOverlays.dismiss();
        return;
      }

      if (currentSearch.includes('edit=')) {
        const params = new URLSearchParams(currentSearch);
        params.delete('edit');
        const nextSearch = params.toString();
        const nextRoute = `${currentPath}${nextSearch ? `?${nextSearch}` : ''}${hashRef.current}`;
        stack[stack.length - 1] = nextRoute;
        history.replace(nextRoute);
        return;
      }

      if (currentPath.startsWith('/tabs/') && currentPath !== MAIN_TAB_PATH) {
        routeStackRef.current = [MAIN_TAB_PATH];
        history.replace(MAIN_TAB_PATH);
        return;
      }

      if (stack.length > 1) {
        stack.pop();
        history.replace(stack[stack.length - 1]);
        return;
      }

      if (router.canGoBack()) {
        router.goBack();
        return;
      }

      if (currentPath !== MAIN_TAB_PATH) {
        history.replace(MAIN_TAB_PATH);
      }
    };

    const ionicBackHandler = (event: Event) => {
      const customEvent = event as CustomEvent;
      customEvent.detail?.register(10000, () => {
        handleBackAction();
      });
    };

    const nativeBackHandler = (event: Event) => {
      event.preventDefault();
      handleBackAction();
    };

    document.addEventListener('ionBackButton', ionicBackHandler);
    document.addEventListener('backbutton', nativeBackHandler);
    return () => {
      document.removeEventListener('ionBackButton', ionicBackHandler);
      document.removeEventListener('backbutton', nativeBackHandler);
    };
  }, [history, router]);

  return null;
};

export default AppBackHandler;
