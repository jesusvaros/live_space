import { env } from '../config/env.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { Logger } from '../utils/logger.js';
import { HIJACKED_WEBSITE_HOSTS, VENUE_ADDRESSES, websiteHost } from '../venues/curation.js';

// Dry-run by default: `npm run venues:curate -- --apply`.
const apply = process.argv.includes('--apply');
const logger = new Logger(env.logLevel, { script: 'curateVenues', apply });
const supabase = getSupabaseAdmin();

const run = async () => {
  const { data: venues, error } = await supabase
    .from('venue_places')
    .select('id,name,status,address,postal_code,latitude,longitude,website_url');
  if (error) throw error;

  for (const venue of venues || []) {
    const host = websiteHost(venue.website_url);
    if (!host || !(host in HIJACKED_WEBSITE_HOSTS)) continue;
    logger.info('Clearing hijacked website', { venue: venue.name, host, reason: HIJACKED_WEBSITE_HOSTS[host] });
    if (!apply) continue;
    const { error: updateError } = await supabase
      .from('venue_places')
      .update({ website_url: null, status: venue.status === 'published' ? 'review' : venue.status })
      .eq('id', venue.id);
    if (updateError) throw updateError;
  }

  const { data: sources, error: sourcesError } = await supabase
    .from('scrape_sources')
    .select('id,name,base_url,is_active,metadata');
  if (sourcesError) throw sourcesError;
  for (const source of sources || []) {
    const host = websiteHost(source.base_url);
    if (!host || !(host in HIJACKED_WEBSITE_HOSTS) || source.metadata?.hijackedDomain) continue;
    logger.info('Disabling source on hijacked domain', { source: source.name, host });
    if (!apply) continue;
    const { error: updateError } = await supabase
      .from('scrape_sources')
      .update({
        is_active: false,
        metadata: { ...(source.metadata || {}), hijackedDomain: true, hijackedReason: HIJACKED_WEBSITE_HOSTS[host] },
      })
      .eq('id', source.id);
    if (updateError) throw updateError;
  }

  const byId = new Map((venues || []).map((venue) => [venue.id, venue]));
  for (const entry of VENUE_ADDRESSES) {
    const venue = byId.get(entry.venueId);
    if (!venue) {
      logger.warn('Curated venue not found', { venue: entry.name, venueId: entry.venueId });
      continue;
    }
    const updates = {
      address: entry.address,
      postal_code: entry.postalCode,
      ...(entry.latitude !== null && entry.longitude !== null
        ? { latitude: entry.latitude, longitude: entry.longitude }
        : {}),
    };
    const changed = Object.entries(updates).filter(
      ([key, value]) => String(venue[key as keyof typeof venue] ?? '') !== String(value),
    );
    if (changed.length === 0) continue;
    logger.info('Setting venue address', {
      venue: entry.name,
      changes: Object.fromEntries(changed.map(([key, value]) => [key, [venue[key as keyof typeof venue], value]])),
    });
    if (!apply) continue;
    const { error: updateError } = await supabase.from('venue_places').update(updates).eq('id', entry.venueId);
    if (updateError) throw updateError;
  }
};

run().catch((error) => {
  logger.error('Venue curation failed', error);
  process.exitCode = 1;
});
