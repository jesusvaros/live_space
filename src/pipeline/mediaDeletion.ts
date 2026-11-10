// Draining media_deletion_queue: files of deleted accounts that still sit in
// R2 or Cloudinary (Postgres cannot reach either). Pure logic; the script
// (src/scripts/drainMediaDeletions.ts) plugs in the real deleters and writes
// the outcome back with the service role.

export type DeletionProvider = 'r2' | 'cloudinary';

export type QueueRow = {
  id: number;
  provider: DeletionProvider;
  object_key: string;
  resource_type: 'image' | 'video' | null;
  attempts: number;
};

export type QueueUpdate =
  | { id: number; outcome: 'deleted'; attempts: number }
  | { id: number; outcome: 'failed'; attempts: number; error: string }
  | { id: number; outcome: 'skipped'; reason: string };

export type Deleters = Partial<Record<DeletionProvider, (row: QueueRow) => Promise<void>>>;

/** After this many failed attempts a row stays in the queue for a human. */
export const MAX_ATTEMPTS = 8;

// Only keys of the shapes we create: a row can never make the worker touch
// posters (posters/…) or anything outside the fan media.
const R2_KEY = /^v\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.[a-z0-9]{2,5}$/;
const CLOUDINARY_ID = /^[A-Za-z0-9_\-/.]{1,300}$/;

export const isDeletableKey = (row: Pick<QueueRow, 'provider' | 'object_key'>) =>
  row.provider === 'r2'
    ? R2_KEY.test(row.object_key)
    : CLOUDINARY_ID.test(row.object_key) && !row.object_key.includes('..');

const message = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 300);

/**
 * Deletes each row's file with the deleter of its provider, one at a time.
 * Rows whose provider has no deleter configured, or that already failed
 * MAX_ATTEMPTS times, are skipped and stay pending.
 */
export const drainQueue = async (rows: readonly QueueRow[], deleters: Deleters): Promise<QueueUpdate[]> => {
  const updates: QueueUpdate[] = [];
  for (const row of rows) {
    if (row.attempts >= MAX_ATTEMPTS) {
      updates.push({ id: row.id, outcome: 'skipped', reason: 'too many attempts' });
      continue;
    }
    const remove = deleters[row.provider];
    if (!remove) {
      updates.push({ id: row.id, outcome: 'skipped', reason: `${row.provider} not configured` });
      continue;
    }
    if (!isDeletableKey(row)) {
      updates.push({ id: row.id, outcome: 'failed', attempts: MAX_ATTEMPTS, error: 'unexpected key shape' });
      continue;
    }
    try {
      await remove(row);
      updates.push({ id: row.id, outcome: 'deleted', attempts: row.attempts + 1 });
    } catch (error) {
      updates.push({ id: row.id, outcome: 'failed', attempts: row.attempts + 1, error: message(error) });
    }
  }
  return updates;
};

export const summarize = (updates: readonly QueueUpdate[]) => ({
  deleted: updates.filter(update => update.outcome === 'deleted').length,
  failed: updates.filter(update => update.outcome === 'failed').length,
  skipped: updates.filter(update => update.outcome === 'skipped').length,
});

export type CloudinaryConfig = { cloudName: string; apiKey: string; apiSecret: string };

export const readCloudinaryConfig = (source: NodeJS.ProcessEnv = process.env): CloudinaryConfig | null => {
  const cloudName = source.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = source.CLOUDINARY_API_KEY?.trim();
  const apiSecret = source.CLOUDINARY_API_SECRET?.trim();
  return cloudName && apiKey && apiSecret ? { cloudName, apiKey, apiSecret } : null;
};

/**
 * Cloudinary Admin API: DELETE /resources/<type>/upload?public_ids[]=<id>.
 * "not_found" counts as deleted.
 */
export const createCloudinaryDeleter = (config: CloudinaryConfig, fetchImpl: typeof fetch = fetch) =>
  async (row: QueueRow) => {
    const type = row.resource_type === 'video' ? 'video' : 'image';
    const url = new URL(`https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/resources/${type}/upload`);
    url.searchParams.append('public_ids[]', row.object_key);
    url.searchParams.set('invalidate', 'true');
    const response = await fetchImpl(url, {
      method: 'DELETE',
      headers: { authorization: `Basic ${Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString('base64')}` },
    });
    if (!response.ok) throw new Error(`Cloudinary DELETE failed with ${response.status}`);
    const body = (await response.json().catch(() => ({}))) as { deleted?: Record<string, string> };
    const result = body.deleted?.[row.object_key];
    if (result !== 'deleted' && result !== 'not_found') throw new Error(`Cloudinary answered ${result ?? 'nothing'}`);
  };
