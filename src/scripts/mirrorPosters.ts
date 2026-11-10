// Mirrors the posters of upcoming concerts into R2 as small WebP renditions
// (events.poster_thumb_url / events.poster_url). See docs/media.md, "Portadas
// de concierto en R2".
//
//   npm run posters:mirror                         → dry run: what would be downloaded, by host
//   npm run posters:mirror -- --out /tmp/posters   → dry run that downloads and writes the
//                                                    renditions to that folder (no DB, no R2)
//   npm run posters:mirror -- --apply              → downloads, uploads to R2, records poster_mirrors
//
// Options: --limit N (distinct URLs per run, default 300), --concurrency N
// (default 3), --delay-ms N (pause per worker between downloads, default 300),
// --days-back N (also concerts that started up to N days ago, default 1).
//
// Resumable and idempotent: progress lives in poster_mirrors, keyed by the
// source URL. A URL already mirrored is never downloaded again; a failed one
// is retried after 1, 2, 4, 8 days and given up after five attempts. With
// --apply and no R2 secrets it logs a warning and exits 0, so the daily
// workflow step is harmless until the secrets exist.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { env } from '../config/env.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import {
  fitsStorageCap,
  planPosterMirrors,
  posterErrorMessage,
  posterObjectKey,
  posterPublicUrl,
  posterSourceHash,
  POSTER_RENDITIONS,
  type PosterEvent,
  type PosterMirrorRow,
} from '../pipeline/posterMirror.js';
import { downloadPoster, renderPoster, type RenderedPoster } from '../pipeline/posterRender.js';
import { createR2Uploader, maxStoredBytes, r2StoredBytes, readR2Config } from '../pipeline/r2Storage.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger(env.logLevel, { script: 'mirrorPosters' });
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string, fallback: number) => {
  const index = args.indexOf(name);
  const value = index >= 0 ? Number(args[index + 1]) : NaN;
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};
const stringOption = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? null : null;
};

const apply = flag('--apply');
const outDir = stringOption('--out');
const limit = option('--limit', 300);
const concurrency = Math.max(1, Math.min(option('--concurrency', 3), 8));
const delayMs = option('--delay-ms', 300);
const daysBack = option('--days-back', 1);
const PAGE_SIZE = 1000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const supabase = getSupabaseAdmin();

const fetchUpcomingEvents = async (fromIso: string): Promise<PosterEvent[]> => {
  const events: PosterEvent[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('events')
      .select('id,image_url')
      .eq('status', 'published')
      .not('image_url', 'is', null)
      .gte('starts_at', fromIso)
      .order('starts_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as PosterEvent[];
    events.push(...page);
    if (page.length < PAGE_SIZE) return events;
  }
};

// Before the migration exists (a dry run against production), no rows.
const isMissingRelation = (error: { code?: string } | null) =>
  Boolean(error && ['42P01', 'PGRST205', 'PGRST202'].includes(error.code ?? ''));

const fetchMirrors = async (hashes: string[]): Promise<Map<string, PosterMirrorRow>> => {
  const rows = new Map<string, PosterMirrorRow>();
  for (let index = 0; index < hashes.length; index += 200) {
    const { data, error } = await supabase
      .from('poster_mirrors')
      .select('source_hash,status,attempts,checked_at')
      .in('source_hash', hashes.slice(index, index + 200));
    if (error) {
      if (!apply && isMissingRelation(error)) {
        logger.warn('poster_mirrors does not exist yet; treating every poster as new (dry run)');
        return rows;
      }
      throw error;
    }
    for (const row of (data ?? []) as PosterMirrorRow[]) rows.set(row.source_hash, row);
  }
  return rows;
};

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return 'invalid';
  }
};

type Outcome =
  | { kind: 'ok'; originalBytes: number; storedBytes: number; rendered: RenderedPoster }
  | { kind: 'failed'; error: string }
  | { kind: 'skipped'; reason: string };

const run = async () => {
  const r2 = readR2Config();
  if (apply && !r2) {
    logger.warn('R2 secrets are not set (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL); posters not mirrored');
    return;
  }

  const now = new Date();
  const fromIso = new Date(now.getTime() - daysBack * 86_400_000).toISOString();
  const events = await fetchUpcomingEvents(fromIso);
  const hashes = [...new Set(events.map((event) => posterSourceHash(event.image_url as string)))];
  const mirrors = await fetchMirrors(hashes);
  const plan = planPosterMirrors(events, mirrors, now);
  const batch = plan.toMirror.slice(0, limit);

  const hosts = new Map<string, number>();
  for (const item of plan.toMirror) hosts.set(hostOf(item.sourceUrl), (hosts.get(hostOf(item.sourceUrl)) ?? 0) + 1);
  logger.info('Poster mirror plan', {
    apply,
    download: apply || Boolean(outDir),
    events: events.length,
    distinctUrls: hashes.length,
    ...plan.counts,
    thisRun: batch.length,
    topHosts: Object.fromEntries([...hosts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)),
  });
  if (!apply && !outDir) return;

  const uploader = apply && r2 ? createR2Uploader(r2) : null;
  const cap = maxStoredBytes();
  let stored = 0;
  if (apply) {
    const usage = await r2StoredBytes(supabase, now);
    stored = usage.videos + usage.posters;
    logger.info('R2 usage before mirroring', { ...usage, cap });
  }
  if (outDir) await mkdir(outDir, { recursive: true });

  let stopReason: string | null = null;
  let consecutiveR2Errors = 0;
  const totals = { ok: 0, failed: 0, skipped: 0, originalBytes: 0, storedBytes: 0 };

  const recordFailure = async (item: (typeof batch)[number], error: string) => {
    if (!apply) return;
    const { error: upsertError } = await supabase.from('poster_mirrors').upsert({
      source_hash: item.hash,
      source_url: item.sourceUrl,
      status: 'failed',
      attempts: item.attempts + 1,
      last_error: error,
      checked_at: new Date().toISOString(),
    });
    if (upsertError) throw upsertError;
  };

  const processItem = async (item: (typeof batch)[number]): Promise<Outcome> => {
    let originalBytes = 0;
    let rendered: RenderedPoster;
    let contentType = '';
    try {
      const downloaded = await downloadPoster(item.sourceUrl);
      originalBytes = downloaded.bytes.length;
      contentType = downloaded.contentType;
      rendered = await renderPoster(downloaded.bytes);
    } catch (error) {
      const message = posterErrorMessage(error);
      await recordFailure(item, message);
      return { kind: 'failed', error: message };
    }
    const storedBytes = rendered.renditions.reduce((sum, rendition) => sum + rendition.bytes.length, 0);

    if (outDir) {
      for (const rendition of rendered.renditions) {
        const spec = POSTER_RENDITIONS.find((entry) => entry.name === rendition.name)!;
        await writeFile(path.join(outDir, posterObjectKey(item.sourceUrl, spec).split('/').slice(2).join('-')), rendition.bytes);
      }
    }
    if (!uploader || !r2) return { kind: 'ok', originalBytes, storedBytes, rendered };

    // Reserve the bytes before uploading so concurrent workers cannot all slip under the cap.
    if (!fitsStorageCap(stored, storedBytes, cap)) {
      stopReason = 'R2 storage cap reached';
      return { kind: 'skipped', reason: stopReason };
    }
    stored += storedBytes;
    const urls: Record<string, string> = {};
    try {
      for (const rendition of rendered.renditions) {
        const spec = POSTER_RENDITIONS.find((entry) => entry.name === rendition.name)!;
        const key = posterObjectKey(item.sourceUrl, spec);
        await uploader.put(key, rendition.bytes, 'image/webp');
        urls[rendition.name] = posterPublicUrl(r2.publicBaseUrl, key);
      }
      consecutiveR2Errors = 0;
    } catch (error) {
      // Our side, not the source's: no attempt is counted; the next run retries.
      consecutiveR2Errors += 1;
      if (consecutiveR2Errors >= 3) stopReason = 'R2 uploads failing';
      return { kind: 'skipped', reason: posterErrorMessage(error) };
    }

    const card = rendered.renditions.find((rendition) => rendition.name === 'card')!;
    const { error: upsertError } = await supabase.from('poster_mirrors').upsert({
      source_hash: item.hash,
      source_url: item.sourceUrl,
      status: 'ok',
      thumb_url: urls.thumb,
      card_url: urls.card,
      bytes: storedBytes,
      original_bytes: originalBytes,
      original_type: contentType || `image/${rendered.format}`,
      width: card.width,
      height: card.height,
      attempts: item.attempts,
      last_error: null,
      checked_at: new Date().toISOString(),
    });
    if (upsertError) throw upsertError;
    return { kind: 'ok', originalBytes, storedBytes, rendered };
  };

  let next = 0;
  const worker = async () => {
    while (next < batch.length && !stopReason) {
      const item = batch[next++];
      const outcome = await processItem(item);
      totals[outcome.kind] += 1;
      if (outcome.kind === 'ok') {
        totals.originalBytes += outcome.originalBytes;
        totals.storedBytes += outcome.storedBytes;
        logger.info(apply ? 'Poster mirrored' : 'Poster rendered (dry run)', {
          host: hostOf(item.sourceUrl),
          events: item.eventIds.length,
          original: `${outcome.rendered.format} ${outcome.rendered.width}x${outcome.rendered.height} ${outcome.originalBytes} B`,
          renditions: outcome.rendered.renditions.map((r) => `${r.name} ${r.width}x${r.height} q${r.quality} ${r.bytes.length} B`),
        });
      } else if (outcome.kind === 'failed') {
        logger.warn('Poster download failed', { host: hostOf(item.sourceUrl), url: item.sourceUrl, error: outcome.error, attempt: item.attempts + 1 });
      } else {
        logger.warn('Poster skipped', { host: hostOf(item.sourceUrl), reason: outcome.reason });
      }
      if (delayMs) await sleep(delayMs);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));

  logger.info('Poster mirror finished', {
    apply,
    ...totals,
    averageStoredBytes: totals.ok ? Math.round(totals.storedBytes / totals.ok) : 0,
    remaining: plan.toMirror.length - batch.length,
    stopReason,
  });
};

run().catch((error) => {
  logger.error('Poster mirror failed', error);
  process.exitCode = 1;
});
