// Re-encodes fan videos stored in R2 that are too heavy for phones or that
// cannot start before they are fully downloaded (index at the end), and gives
// a cover to the ones without one. Videos uploaded through the app's native
// picker are already compressed on the phone; this catches the rest (older
// uploads, the web, any future path) so a concert never waits for 40 MB files.
//
//   npm run media:optimize                 → lists what it would do (no writes)
//   npm run media:optimize -- --apply      → re-encodes / adds covers (max 20 per run)
//   npm run media:optimize -- --apply --limit 5 --id <media_asset uuid>
//
// The original is kept as uploaded (storage_key); the light copy goes next to
// it (v/<path>.720p.mp4) and media_assets.secure_url points at it, so the app
// plays the light one. The cover goes to t/<same path>.jpg.
// drainMediaDeletions removes all three when the account is deleted. Needs ffmpeg and the
// R2_* secrets; without the secrets it logs a warning and exits 0. Logs carry
// asset id prefixes and sizes only.
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { env } from '../config/env.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { createR2Uploader, readR2Config } from '../pipeline/r2Storage.js';
import { coverArgs, coverKeyFor, encodeArgs, isFastStart, isOptimizedUrl, MAX_MBPS, megabitsPerSecond, optimizedKeyFor, planVideo, type StoredVideo } from '../pipeline/videoOptimize.js';
import { Logger } from '../utils/logger.js';

const run = promisify(execFile);
const logger = new Logger(env.logLevel, { script: 'optimizeVideos' });
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const argValue = (flag: string) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const limit = Math.min(Math.max(Number(argValue('--limit')) || 20, 1), 200);
const onlyId = argValue('--id');

type Row = StoredVideo & { secure_url: string | null; width: number | null; height: number | null };

const short = (id: string) => id.slice(0, 8);

/** First 256 KB of the file: enough to see whether moov comes before mdat. */
const readHead = async (url: string): Promise<Uint8Array | null> => {
  try {
    const response = await fetch(url, { headers: { range: 'bytes=0-262143' } });
    if (!response.ok) return null;
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
};

const probe = async (file: string) => {
  const { stdout } = await run('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height:format=duration',
    '-of', 'json', file,
  ]);
  const parsed = JSON.parse(stdout) as { streams?: { width?: number; height?: number }[]; format?: { duration?: string } };
  return {
    width: parsed.streams?.[0]?.width ?? null,
    height: parsed.streams?.[0]?.height ?? null,
    duration: parsed.format?.duration ? Math.round(Number(parsed.format.duration) * 1000) / 1000 : null,
  };
};

const main = async () => {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('media_assets')
    .select('id,storage_key,secure_url,bytes,duration_seconds,thumbnail_url,width,height')
    .eq('resource_type', 'video')
    .eq('storage_provider', 'r2')
    .not('storage_key', 'is', null)
    .order('created_at', { ascending: false })
    .limit(500);
  if (onlyId) query = query.eq('id', onlyId);
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as Row[];

  const todo: { row: Row; reasons: string[]; encode: boolean; cover: boolean }[] = [];
  for (const row of rows) {
    if (!row.secure_url || !row.storage_key) continue;
    const heavy = (megabitsPerSecond(row.bytes, row.duration_seconds) ?? 0) > MAX_MBPS;
    // Heavy or already-light files need no head check.
    const fastStart = heavy || isOptimizedUrl(row.secure_url) ? null : isFastStart((await readHead(row.secure_url)) ?? new Uint8Array());
    const plan = planVideo(row, fastStart);
    if (plan.encode || plan.cover) todo.push({ row, ...plan });
    if (todo.length >= limit) break;
  }
  logger.info('Videos to optimize', {
    checked: rows.length,
    todo: todo.length,
    apply,
    items: todo.map(({ row, reasons }) => `${short(row.id)}: ${reasons.join(', ')}`),
  });
  if (!apply || todo.length === 0) return;

  const r2 = readR2Config();
  if (!r2) {
    logger.warn('R2 secrets are not set; videos not optimized');
    return;
  }
  const uploader = createR2Uploader(r2);
  let saved = 0;
  let done = 0;
  for (const item of todo) {
    const { row } = item;
    const dir = await mkdtemp(path.join(tmpdir(), 'ls-video-'));
    try {
      const input = path.join(dir, 'in.mp4');
      const response = await fetch(row.secure_url as string);
      if (!response.ok) throw new Error(`download failed with ${response.status}`);
      await writeFile(input, new Uint8Array(await response.arrayBuffer()));
      const patch: Record<string, unknown> = {};

      let source = input;
      if (item.encode) {
        const output = path.join(dir, 'out.mp4');
        await run('ffmpeg', encodeArgs(input, output), { timeout: 10 * 60_000, maxBuffer: 16 * 1024 * 1024 });
        const before = (await stat(input)).size;
        const after = (await stat(output)).size;
        const lightKey = optimizedKeyFor(row.storage_key as string);
        // Only worth serving if lighter (or if only the index had to move).
        if (lightKey && (after < before || item.reasons.includes('moov at the end'))) {
          await uploader.put(lightKey, await readFile(output), 'video/mp4');
          const meta = await probe(output);
          Object.assign(patch, {
            secure_url: `${r2.publicBaseUrl}/${lightKey}`,
            bytes: after,
            width: meta.width,
            height: meta.height,
            ...(meta.duration ? { duration_seconds: meta.duration } : {}),
          });
          saved += before - after;
          source = output;
          logger.info('Re-encoded', { id: short(row.id), mbBefore: +(before / 1e6).toFixed(1), mbAfter: +(after / 1e6).toFixed(1) });
        } else {
          logger.info('Re-encode not smaller; kept the original', { id: short(row.id) });
        }
      }

      if (item.cover) {
        const key = coverKeyFor(row.storage_key as string);
        if (key) {
          const cover = path.join(dir, 'cover.jpg');
          await run('ffmpeg', coverArgs(source, cover, row.duration_seconds), { timeout: 60_000 });
          await uploader.put(key, await readFile(cover), 'image/jpeg');
          patch.thumbnail_url = `${r2.publicBaseUrl}/${key}`;
          logger.info('Cover added', { id: short(row.id) });
        }
      }

      if (Object.keys(patch).length) {
        const { error: updateError } = await supabase.from('media_assets').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', row.id);
        if (updateError) throw updateError;
        done += 1;
      }
    } catch (itemError) {
      logger.warn('Could not optimize', { id: short(row.id), error: itemError instanceof Error ? itemError.message : String(itemError) });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
  logger.info('Video optimization finished', { done, of: todo.length, mbSaved: +(saved / 1e6).toFixed(1) });
};

main().catch((error) => {
  logger.error('Video optimization failed', error);
  process.exitCode = 1;
});
