import { useEffect, useRef } from 'react';
import { useIonRouter } from '@ionic/react';
import { useLocation } from 'react-router-dom';

const HOME_PATH = '/tabs/events';

const AppBackHandler = () => {
  const router = useIonRouter();
  const location = useLocation();
  const pathRef = useRef(location.pathname);

  useEffect(() => {
    pathRef.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent;
      customEvent.detail?.register(10, () => {
        if (router.canGoBack()) {
          router.goBack();
          return;
        }

        if (pathRef.current !== HOME_PATH) {
          router.push(HOME_PATH, 'root', 'replace');
        }
      });
    };

    document.addEventListener('ionBackButton', handler);
    return () => {
      document.removeEventListener('ionBackButton', handler);
    };
  }, [router]);

  return null;
};

export default AppBackHandler;
