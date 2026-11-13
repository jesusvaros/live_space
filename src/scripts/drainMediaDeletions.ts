// Deletes from R2 (and Cloudinary, if its secrets are set) the files of
// deleted accounts, queued in media_deletion_queue by delete_my_account().
// See docs/seguridad.md, "Borrar la cuenta".
//
//   npm run media:drain-deletions               → dry run: counts what is pending, by provider
//   npm run media:drain-deletions -- --apply    → deletes and records the outcome
//
// Options: --limit N (rows per run, default 500).
//
// Idempotent: a deleted row is never picked again and deleting a missing
// object counts as done. A failure adds an attempt and is retried on the
// next run, up to 8 attempts. Without the secrets of a provider its rows are
// left pending (the daily workflow step stays harmless until they exist).
// While the migration is not live the table does not exist: it says so and
// exits 0.

import { env } from '../config/env.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import {
  createCloudinaryDeleter,
  drainQueue,
  MAX_ATTEMPTS,
  readCloudinaryConfig,
  summarize,
  type Deleters,
  type QueueRow,
} from '../pipeline/mediaDeletion.js';
import { createR2Uploader, readR2Config } from '../pipeline/r2Storage.js';
import { coverKeyFor, optimizedKeyFor } from '../pipeline/videoOptimize.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger(env.logLevel, { script: 'drainMediaDeletions' });
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const limitIndex = args.indexOf('--limit');
const limitArg = limitIndex >= 0 ? Number(args[limitIndex + 1]) : NaN;
const limit = Number.isFinite(limitArg) && limitArg > 0 ? Math.min(limitArg, 5000) : 500;

const run = async () => {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('media_deletion_queue')
    .select('id,provider,object_key,resource_type,attempts')
    .is('deleted_at', null)
    .lt('attempts', MAX_ATTEMPTS)
    .order('requested_at', { ascending: true })
    .limit(limit);
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') {
      logger.warn('media_deletion_queue does not exist yet (migration 20261110040100 not applied); nothing to do');
      return;
    }
    throw error;
  }
  const rows = (data ?? []) as QueueRow[];
  const byProvider = rows.reduce<Record<string, number>>((counts, row) => {
    counts[row.provider] = (counts[row.provider] ?? 0) + 1;
    return counts;
  }, {});
  logger.info('Media deletion queue', { pending: rows.length, byProvider, apply });
  if (!apply || rows.length === 0) return;

  const deleters: Deleters = {};
  const r2 = readR2Config();
  if (r2) {
    const client = createR2Uploader(r2);
    deleters.r2 = async (row) => {
      await client.remove(row.object_key);
      // optimizeVideos keeps a light copy and a cover next to the original.
      for (const extra of [optimizedKeyFor(row.object_key), coverKeyFor(row.object_key)]) {
        if (extra) await client.remove(extra);
      }
    };
  } else {
    logger.warn('R2 secrets are not set; R2 files stay queued');
  }
  const cloudinary = readCloudinaryConfig();
  if (cloudinary) deleters.cloudinary = createCloudinaryDeleter(cloudinary);
  else if (byProvider.cloudinary) logger.warn('Cloudinary secrets are not set; Cloudinary files stay queued');

  const updates = await drainQueue(rows, deleters);
  const now = new Date().toISOString();
  for (const update of updates) {
    if (update.outcome === 'skipped') continue;
    const patch = update.outcome === 'deleted'
      ? { deleted_at: now, attempts: update.attempts, last_attempt_at: now, last_error: null }
      : { attempts: update.attempts, last_attempt_at: now, last_error: update.error };
    const { error: updateError } = await supabase.from('media_deletion_queue').update(patch).eq('id', update.id);
    if (updateError) logger.warn('Could not record the outcome', { id: update.id, error: updateError.message });
    // Keys and ids only: the queue never holds who the file belonged to.
    if (update.outcome === 'failed') logger.warn('Delete failed', { id: update.id, error: update.error, attempt: update.attempts });
  }
  logger.info('Media deletion finished', summarize(updates));
};

run().catch((error) => {
  logger.error('Media deletion failed', error);
  process.exitCode = 1;
});
