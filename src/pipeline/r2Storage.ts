import type { SupabaseClient } from '@supabase/supabase-js';
import { AwsClient } from 'aws4fetch';

// R2 from the scraper (Node). Same secrets and the same storage cap as the
// media-r2-* Edge Functions (supabase/functions/_shared/r2.ts): the bucket
// must never hold more than R2_MAX_STORED_BYTES (default 9 GB, under the
// 10 GB free tier), counting fan videos and mirrored posters together.

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
  jurisdiction: string | null;
};

export const DEFAULT_MAX_STORED_BYTES = 9_000_000_000;

/** R2 settings from the environment, or null when any secret is missing. */
export const readR2Config = (source: NodeJS.ProcessEnv = process.env): R2Config | null => {
  const accountId = source.R2_ACCOUNT_ID?.trim();
  const accessKeyId = source.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = source.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = source.R2_BUCKET?.trim();
  const publicBaseUrl = source.R2_PUBLIC_BASE_URL?.trim();
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) return null;
  if (!publicBaseUrl.startsWith('https://')) return null;
  const jurisdiction = source.R2_JURISDICTION?.trim().toLowerCase() || null;
  if (jurisdiction && !/^[a-z]+$/.test(jurisdiction)) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl: publicBaseUrl.replace(/\/+$/, ''), jurisdiction };
};

export const maxStoredBytes = (source: NodeJS.ProcessEnv = process.env) => {
  const fromEnv = Number(source.R2_MAX_STORED_BYTES);
  return Number.isSafeInteger(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_MAX_STORED_BYTES;
};

const objectUrl = (config: R2Config, key: string) =>
  `https://${config.accountId}.${config.jurisdiction ? `${config.jurisdiction}.` : ''}r2.cloudflarestorage.com/${encodeURIComponent(
    config.bucket,
  )}/${key}`;

export const createR2Uploader = (config: R2Config) => {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: 's3',
    region: 'auto',
    retries: 2,
  });
  return {
    /** PUT one object; keys are immutable, so the CDN may cache it for a year. */
    async put(key: string, body: Buffer, contentType: string) {
      const response = await client.fetch(objectUrl(config, key), {
        method: 'PUT',
        headers: {
          'content-type': contentType,
          'content-length': String(body.byteLength),
          'cache-control': 'public, max-age=31536000, immutable',
        },
        body: new Uint8Array(body).buffer,
      });
      const text = await response.text();
      if (!response.ok || text.includes('<Error>')) throw new Error(`R2 PUT failed with ${response.status}`);
    },
  };
};

const PAGE_SIZE = 1000;

/**
 * Bytes R2 holds or is about to hold: the same reservation count the Edge
 * Function uses for videos (completed uploads plus the last 48 h in flight)
 * plus every mirrored poster. Over-counts on purpose: nothing is assumed
 * deleted.
 */
export const r2StoredBytes = async (supabase: SupabaseClient, now = new Date()): Promise<{ videos: number; posters: number }> => {
  const inFlightSince = new Date(now.getTime() - 2 * 86_400_000).toISOString();
  let videos = 0;
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('media_upload_reservations')
      .select('expected_bytes')
      .eq('storage_provider', 'r2')
      .is('rejected_reason', null)
      .or(`consumed_at.not.is.null,created_at.gte.${inFlightSince}`)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data ?? []) as Array<{ expected_bytes: number | null }>;
    for (const row of rows) videos += Number(row.expected_bytes ?? 0);
    if (rows.length < PAGE_SIZE) break;
  }
  const { data: posterBytes, error: posterError } = await supabase.rpc('r2_poster_stored_bytes');
  if (posterError) throw posterError;
  return { videos, posters: Number(posterBytes ?? 0) };
};
