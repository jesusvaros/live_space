import { supabase } from '../../lib/supabase';
import { clearUserPersisted } from '../../lib/persistentCache';

// Account deletion: one call to delete_my_account() (migration
// 20261110040100), which deletes everything tied to the caller and queues
// their files for removal from R2/Cloudinary. See docs/seguridad.md.

export const DELETE_CONFIRMATION_WORD = 'ELIMINAR';

/** The confirm button only works once the person typed the word (any case, spaces ignored). */
export const isDeleteConfirmed = (typed: string) => typed.trim().toUpperCase() === DELETE_CONFIRMATION_WORD;

export type DeleteAccountResult =
  | { ok: true }
  // The backend does not have the function yet (migration not live): the
  // screen offers the request by email instead.
  | { ok: false; reason: 'unavailable' | 'failed' };

const isMissingFunction = (error: { code?: string; message?: string } | null) =>
  Boolean(error) && (error?.code === 'PGRST202' || error?.code === '42883' || /could not find the function/i.test(error?.message ?? ''));

export const deleteMyAccount = async (): Promise<DeleteAccountResult> => {
  const { data, error } = await supabase.rpc('delete_my_account');
  if (error) return { ok: false, reason: isMissingFunction(error) ? 'unavailable' : 'failed' };
  const result = data as { deleted?: boolean; reason?: string } | null;
  // A second tap after the first one went through: already deleted.
  if (result?.deleted || result?.reason === 'already_deleted') {
    // Nothing of the deleted account stays in the saved screens (sign-out
    // clears them too; this does not wait for it).
    await clearUserPersisted().catch(() => undefined);
    return { ok: true };
  }
  return { ok: false, reason: 'failed' };
};
