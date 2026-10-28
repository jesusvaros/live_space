import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { handleAuthCallbackUrl } from '../auth/nativeAuth';
import { readReturnTo } from '../auth/returnTo';
import { merchDeepLinkPath, uploadDeepLinkPath } from '../lib/uploadQr';

// Catches com.livespace.app://auth/callback links (Google/Apple sign-in,
// email confirmation, password reset) whether they wake the app or start it.
const AuthDeepLinks: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;

    const handle = async (url: string | undefined) => {
      if (!url) return;
      const upload = uploadDeepLinkPath(url);
      if (upload) {
        navigate(upload);
        return;
      }
      const merch = merchDeepLinkPath(url);
      if (merch) {
        void Browser.close().catch(() => undefined);
        navigate(merch);
        return;
      }
      const result = await handleAuthCallbackUrl(url);
      if (result.kind === 'recovery') navigate('/reset', { replace: true });
      else if (result.kind === 'signed-in') navigate(readReturnTo(), { replace: true });
      else if (result.kind === 'error') navigate(`/welcome?error=${encodeURIComponent(result.message)}`, { replace: true });
    };

    App.getLaunchUrl().then((launch) => handle(launch?.url)).catch(() => undefined);
    const listener = App.addListener('appUrlOpen', ({ url }) => {
      handle(url).catch(() => undefined);
    });
    return () => {
      listener.then((handleRef) => handleRef.remove()).catch(() => undefined);
    };
  }, [navigate]);

  return null;
};

export default AuthDeepLinks;
