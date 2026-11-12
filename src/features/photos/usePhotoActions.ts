import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/ui/AppPrimitives';
import type { TimelineMoment } from '../moments/concertTimeline';
import { deleteMyPost, setPostHidden, setPostSaved, useSavedPostIds } from './postCollections';
import type { PhotoActionHandlers } from './PhotoActions';

const UNDO_MS = 6000;

/**
 * Save / hide / delete for photo screens. Signed-out people are sent to sign
 * in. A hidden photo can be brought back from the undo bar for a few seconds.
 */
export const usePhotoActions = (options: { onDeleted?: (postId: string) => void } = {}) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { presentToast } = useToast();
  const savedIds = useSavedPostIds();
  const userId = user?.id ?? null;
  const onDeletedRef = useRef(options.onDeleted);
  onDeletedRef.current = options.onDeleted;
  const [undo, setUndo] = useState<TimelineMoment | null>(null);
  const undoTimer = useRef(0);

  useEffect(() => () => window.clearTimeout(undoTimer.current), []);

  const onToggleSave = useCallback((photo: TimelineMoment) => {
    if (!userId) {
      navigate('/welcome');
      return;
    }
    setPostSaved(userId, photo.id, !savedIds.has(photo.id)).catch(() =>
      presentToast({ message: 'No se ha podido guardar. Inténtalo otra vez.', position: 'bottom' }));
  }, [userId, savedIds, navigate, presentToast]);

  const onHide = useCallback((photo: TimelineMoment) => {
    if (!userId) {
      navigate('/welcome');
      return;
    }
    setPostHidden(userId, photo.id, true).catch(() =>
      presentToast({ message: 'No se ha podido ocultar. Inténtalo otra vez.', position: 'bottom' }));
    window.clearTimeout(undoTimer.current);
    setUndo(photo);
    undoTimer.current = window.setTimeout(() => setUndo(null), UNDO_MS);
  }, [userId, navigate, presentToast]);

  const undoHide = useCallback(() => {
    if (!userId || !undo) return;
    window.clearTimeout(undoTimer.current);
    void setPostHidden(userId, undo.id, false).catch(() => undefined);
    setUndo(null);
  }, [userId, undo]);

  const onDelete = useCallback(async (photo: TimelineMoment) => {
    try {
      await deleteMyPost(photo.id);
      onDeletedRef.current?.(photo.id);
      presentToast({ message: 'Foto eliminada.', position: 'bottom' });
    } catch {
      presentToast({ message: 'No se ha podido eliminar. Inténtalo otra vez.', position: 'bottom' });
    }
  }, [presentToast]);

  const handlers: PhotoActionHandlers = { currentUserId: userId, savedIds, onToggleSave, onHide, onDelete };
  return { handlers, undo, undoHide };
};
