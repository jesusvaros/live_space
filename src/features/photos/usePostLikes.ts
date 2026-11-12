import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { rememberReturnTo } from '../../auth/returnTo';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/ui/AppPrimitives';
import { setPostSaved, useSavedPostIds, useSavedPostIdsReady } from './postCollections';

/**
 * ♥ on a moment (post_likes): the same shared set as «Guardar» in the photos,
 * so the player, the albums and «Guardadas» agree. Optimistic; a failure rolls
 * back with a toast. Signed out: sign in first and come back to this page.
 */
export const usePostLikes = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { presentToast } = useToast();
  const likedIds = useSavedPostIds();
  // The set reflects the server (not a load still in flight).
  const ready = useSavedPostIdsReady();
  const userId = user?.id ?? null;

  /** Returns false when the person has to sign in first. */
  const setLiked = useCallback((postId: string, on: boolean) => {
    if (!userId) {
      rememberReturnTo(`${location.pathname}${location.search}`);
      navigate('/welcome');
      return false;
    }
    setPostSaved(userId, postId, on).catch(() =>
      presentToast({ message: 'No se ha podido guardar el me gusta. Inténtalo otra vez.', position: 'bottom' }));
    return true;
  }, [userId, location.pathname, location.search, navigate, presentToast]);

  return { likedIds, ready, signedIn: Boolean(userId), setLiked };
};
