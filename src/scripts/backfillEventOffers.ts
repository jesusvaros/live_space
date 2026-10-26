import { env } from '../config/env.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { extractOffer } from '../normalize/extractOffer.js';
import { offerUpdates } from '../pipeline/upsertEvents.js';
import type { NormalizedEvent } from '../types/domain.js';
import { Logger } from '../utils/logger.js';

// Fills ticket link, prices and end time of published events from the newest
// staging row behind each one. Dry-run by default: `-- --apply` writes.
const apply = process.argv.includes('--apply');
const logger = new Logger(env.logLevel, { script: 'backfillEventOffers', apply });
const supabase = getSupabaseAdmin();

const run = async () => {
  const { data: events, error } = await supabase
    .from('events')
    .select('id,name,starts_at,ticket_url,price_tiers,is_free,ends_at')
    .gte('starts_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
  if (error) throw error;

  let changedCount = 0;
  for (const event of events || []) {
    const { data: rows, error: rowsError } = await supabase
      .from('staging_events')
      .select('raw_payload,source_url')
      .eq('published_event_id', event.id)
      .order('created_at', { ascending: false })
      .limit(1);
    if (rowsError) throw rowsError;
    const row = rows?.[0];
    if (!row) continue;

    const offer = extractOffer(row.raw_payload, row.source_url, event.starts_at);
    const updates = Object.fromEntries(
      Object.entries(offerUpdates({ offer } as NormalizedEvent)).filter(
        ([key, value]) =>
          key === 'ends_at'
            ? !event.ends_at || new Date(event.ends_at).getTime() !== new Date(String(value)).getTime()
            : JSON.stringify(event[key as keyof typeof event]) !== JSON.stringify(value),
      ),
    );
    if (Object.keys(updates).length === 0) continue;
    changedCount += 1;
    logger.info('Event offer', { event: event.name, updates });
    if (!apply) continue;
    const { error: updateError } = await supabase.from('events').update(updates).eq('id', event.id);
    if (updateError) throw updateError;
  }
  logger.info('Backfill finished', { scanned: events?.length || 0, changedCount });
};

run().catch((error) => {
  logger.error('Event offer backfill failed', error);
  process.exitCode = 1;
});
