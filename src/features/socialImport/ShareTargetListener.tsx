import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '../../contexts/AuthContext';
import { extractFirstUrl } from './socialUrl';

const PENDING_KEY = 'ls:pending-import';

export const importPathFor = (url: string, sharedText?: string | null) => {
  const params = new URLSearchParams({ url });
  const text = sharedText?.trim();
  if (text && text !== url) params.set('text', text.slice(0, 600));
  return `/importar?${params.toString()}`;
};

// A share that arrives before sign-in is kept until there is a session.
export const rememberPendingImport = (path: string) => {
  try {
    localStorage.setItem(PENDING_KEY, path);
  } catch {
    // Private mode: the share is simply not kept.
  }
};

export const takePendingImport = (): string | null => {
  try {
    const value = localStorage.getItem(PENDING_KEY);
    if (value) localStorage.removeItem(PENDING_KEY);
    return value?.startsWith('/importar?') ? value : null;
  } catch {
    return null;
  }
};

// Instagram/TikTok/YouTube -> Compartir -> Live Space. Android delivers the
// shared text through the ACTION_SEND intent filter on MainActivity; iOS will
// once the Share Extension exists (docs/importar-clips.md). The plugin retains
// a cold-start share until this listener registers.
const ShareTargetListener: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    let removed = false;
    let remove: (() => void) | null = null;

    import('@capgo/capacitor-share-target')
      .then(({ CapacitorShareTarget }) =>
        CapacitorShareTarget.addListener('shareReceived', event => {
          const text = [event.title, ...(event.texts ?? [])].filter(Boolean).join('\n');
          const url = extractFirstUrl(text);
          if (!url) return;
          navigate(importPathFor(url, text));
        }),
      )
      .then(handle => {
        if (removed) handle.remove().catch(() => undefined);
        else remove = () => handle.remove().catch(() => undefined);
      })
      .catch(() => undefined);

    return () => {
      removed = true;
      remove?.();
    };
  }, [navigate]);

  useEffect(() => {
    if (loading || !user) return;
    const pending = takePendingImport();
    if (pending) navigate(pending);
  }, [loading, user, navigate]);

  return null;
};

export default ShareTargetListener;
