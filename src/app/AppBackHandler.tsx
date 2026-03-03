import { useEffect, useRef } from 'react';
import { useIonRouter } from '@ionic/react';
import { useHistory, useLocation } from 'react-router-dom';

const HOME_PATHS = ['/tabs/events', '/tabs/mySpace'];
const DEFAULT_HOME_PATH = '/tabs/events';

const AppBackHandler = () => {
  const router = useIonRouter();
  const history = useHistory();
  const location = useLocation();
  const pathRef = useRef(location.pathname);
  const searchRef = useRef(location.search);

  useEffect(() => {
    pathRef.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    searchRef.current = location.search;
  }, [location.search]);

  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent;
      customEvent.detail?.register(10000, () => {
        const currentPath = pathRef.current;
        const currentSearch = searchRef.current;

        if (currentPath === '/tabs/profile' && currentSearch.includes('edit=')) {
          history.replace('/tabs/profile');
          return;
        }

        if (router.canGoBack()) {
          router.goBack();
          return;
        }

        if (currentPath.startsWith('/admin')) {
          router.push(DEFAULT_HOME_PATH, 'root', 'replace');
          return;
        }

        if (currentPath.startsWith('/tabs/') && !HOME_PATHS.includes(currentPath)) {
          router.push(DEFAULT_HOME_PATH, 'root', 'replace');
          return;
        }

        if (currentPath !== '/welcome' && !HOME_PATHS.includes(currentPath)) {
          router.push(DEFAULT_HOME_PATH, 'root', 'replace');
        }
      });
    };

    document.addEventListener('ionBackButton', handler);
    return () => {
      document.removeEventListener('ionBackButton', handler);
    };
  }, [history, router]);

  return null;
};

export default AppBackHandler;
