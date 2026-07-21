import { env } from '../config/env.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { Logger } from '../utils/logger.js';
import {
  buildOverpassQuery,
  candidateSnapshotHash,
  parseOsmCandidates,
  type OsmElement,
  type BoundingBox,
  type VenueCandidate,
} from '../venues/discovery.js';

const logger = new Logger(env.logLevel, { script: 'discoverVenues' });
const supabase = getSupabaseAdmin();
const endpoints = (process.env.OVERPASS_API_URLS || 'https://maps.mail.ru/osm/tools/overpass/api/interpreter,https://overpass.kumi.systems/api/interpreter,https://overpass-api.de/api/interpreter')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const scopes = (process.env.VENUE_DISCOVERY_SCOPES || 'Madrid,Barcelona')
  .split(',')
  .map((scope) => scope.trim())
  .filter(Boolean);

const pilotBoundingBoxes: Record<string, BoundingBox> = {
  Madrid: [40.312, -3.889, 40.643, -3.518],
  Barcelona: [41.32, 2.052, 41.47, 2.229],
  Valencia: [39.407, -0.431, 39.522, -0.3],
};

const resolveBoundingBox = async (scope: string): Promise<BoundingBox> => {
  if (pilotBoundingBoxes[scope]) return pilotBoundingBoxes[scope];
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('city', scope);
  url.searchParams.set('countrycodes', 'es');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  const response = await fetch(url, {
    headers: { 'user-agent': 'LiveSpaceVenueDiscovery/0.1 (catalogue maintenance)' },
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));
  if (!response.ok) throw new Error(`Nominatim returned HTTP ${response.status} for ${scope}`);
  const matches = (await response.json()) as Array<{ boundingbox?: [string, string, string, string] }>;
  const box = matches[0]?.boundingbox;
  if (!box) throw new Error(`No geographic boundary found for ${scope}`);
  return [Number(box[0]), Number(box[2]), Number(box[1]), Number(box[3])];
};

const fetchCandidates = async (scope: string): Promise<VenueCandidate[]> => {
  const boundingBox = await resolveBoundingBox(scope);
  let lastError: unknown;
  for (const endpoint of endpoints) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'user-agent': 'LiveSpaceVenueDiscovery/0.1 (catalogue maintenance)',
        },
        body: new URLSearchParams({ data: buildOverpassQuery(scope, boundingBox) }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`${endpoint} returned HTTP ${response.status}`);
      const payload = (await response.json()) as { elements?: OsmElement[] };
      return parseOsmCandidates(scope, payload.elements || []);
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError || new Error('No Overpass endpoint is configured');
};

const promoteStrongCandidate = async (candidate: VenueCandidate, candidateId: string) => {
  if (candidate.confidence < 0.95) return false;

  const { data: osmMatch, error: osmError } = await supabase
    .from('venue_places')
    .select('id,external_ids,status')
    .contains('external_ids', { openstreetmap: candidate.provider_id })
    .limit(1)
    .maybeSingle();
  if (osmError) throw osmError;

  let venue = osmMatch;
  if (!venue) {
    const { data: nameMatch, error: nameError } = await supabase
      .from('venue_places')
      .select('id,external_ids,status')
      .eq('normalized_name', candidate.normalized_name)
      .eq('city', candidate.city)
      .eq('country_code', 'ES')
      .neq('status', 'archived')
      .limit(1)
      .maybeSingle();
    if (nameError) throw nameError;
    venue = nameMatch;
  }

  if (venue) {
    const { error } = await supabase
      .from('venue_places')
      .update({
        city: candidate.city,
        address: candidate.address || undefined,
        website_url: candidate.website_url || undefined,
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        external_ids: { ...(venue.external_ids || {}), openstreetmap: candidate.provider_id },
      })
      .eq('id', venue.id);
    if (error) throw error;
  } else {
    const { data, error } = await supabase
      .from('venue_places')
      .insert({
        name: candidate.name,
        normalized_name: candidate.normalized_name,
        city: candidate.city,
        country_code: 'ES',
        address: candidate.address,
        website_url: candidate.website_url,
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        venue_type: 'music_venue',
        external_ids: { openstreetmap: candidate.provider_id },
        status: 'published',
      })
      .select('id,external_ids,status')
      .single();
    if (error) throw error;
    venue = data;
  }

  const { error: candidateError } = await supabase
    .from('venue_discovery_candidates')
    .update({ promoted_venue_place_id: venue.id, lifecycle_status: 'active' })
    .eq('id', candidateId);
  if (candidateError) throw candidateError;

  const websiteHost = candidate.website_url ? new URL(candidate.website_url).hostname.replace(/^www\./, '') : null;
  const isSocialProfile = websiteHost
    ? ['instagram.com', 'facebook.com', 'x.com', 'twitter.com', 'tiktok.com', 'youtube.com'].includes(websiteHost)
    : false;
  if (candidate.website_url && !isSocialProfile) {
    const { data: source, error: sourceReadError } = await supabase
      .from('scrape_sources')
      .select('id')
      .eq('base_url', candidate.website_url)
      .maybeSingle();
    if (sourceReadError) throw sourceReadError;
    if (!source) {
      const { data: nameMatch, error: nameReadError } = await supabase
        .from('scrape_sources')
        .select('id')
        .eq('name', candidate.name)
        .eq('city', candidate.city)
        .limit(1)
        .maybeSingle();
      if (nameReadError) throw nameReadError;
      if (nameMatch) return true;
      const { error: sourceInsertError } = await supabase.from('scrape_sources').insert({
        source_type: 'venue',
        name: candidate.name,
        base_url: candidate.website_url,
        city: candidate.city,
        country_code: 'ES',
        parser_key: 'generic-agenda',
        frequency: 'daily',
        is_active: false,
        metadata: {
          autoDiscovered: true,
          discoveryProvider: candidate.provider,
          discoveryProviderId: candidate.provider_id,
          officialWebsite: candidate.website_url,
          termsReviewStatus: 'pending',
          fixtureVerified: false,
        },
      });
      if (sourceInsertError) throw sourceInsertError;
    }
  }
  return true;
};

const discoverScope = async (scope: string) => {
  const { data: run, error: runError } = await supabase
    .from('venue_discovery_runs')
    .insert({ provider: 'openstreetmap', scope, status: 'running' })
    .select('id')
    .single();
  if (runError) throw runError;

  try {
    const candidates = await fetchCandidates(scope);
    if (candidates.length === 0) {
      throw new Error(`Discovery returned zero candidates for ${scope}; snapshot rejected`);
    }

    const { data: previous, error: previousError } = await supabase
      .from('venue_discovery_candidates')
      .select('id,provider_id,lifecycle_status,consecutive_misses,promoted_venue_place_id')
      .eq('provider', 'openstreetmap')
      .eq('scope', scope);
    if (previousError) throw previousError;
    const priorById = new Map((previous || []).map((row) => [row.provider_id, row]));
    const seen = new Set(candidates.map((candidate) => candidate.provider_id));
    const timestamp = new Date().toISOString();
    let promotedCount = 0;

    for (const candidate of candidates) {
      const prior = priorById.get(candidate.provider_id);
      const lifecycle = prior?.lifecycle_status === 'ignored' ? 'ignored' : candidate.lifecycle_status;
      const { data, error } = await supabase
        .from('venue_discovery_candidates')
        .upsert(
          {
            ...candidate,
            lifecycle_status: prior?.lifecycle_status === 'active' ? 'active' : lifecycle,
            last_seen_at: timestamp,
            consecutive_misses: 0,
            updated_at: timestamp,
          },
          { onConflict: 'provider,provider_id' },
        )
        .select('id')
        .single();
      if (error) throw error;
      if (prior?.lifecycle_status === 'inactive_review') {
        const { error: resolutionError } = await supabase
          .from('scrape_watch_alerts')
          .update({ status: 'resolved', resolved_at: timestamp })
          .eq('candidate_id', data.id)
          .eq('alert_type', 'venue_missing')
          .eq('status', 'open');
        if (resolutionError) throw resolutionError;
      }
      if (
        lifecycle !== 'ignored' &&
        (await promoteStrongCandidate(candidate, data.id)) &&
        !prior?.promoted_venue_place_id
      ) {
        promotedCount += 1;
      }
    }

    for (const prior of previous || []) {
      if (seen.has(prior.provider_id) || prior.lifecycle_status === 'ignored') continue;
      const misses = Number(prior.consecutive_misses || 0) + 1;
      const lifecycle = misses >= 3 ? 'inactive_review' : prior.lifecycle_status;
      const { error } = await supabase
        .from('venue_discovery_candidates')
        .update({ consecutive_misses: misses, lifecycle_status: lifecycle, updated_at: timestamp })
        .eq('id', prior.id);
      if (error) throw error;
      if (misses === 3) {
        const { error: alertError } = await supabase.from('scrape_watch_alerts').insert({
          candidate_id: prior.id,
          alert_type: 'venue_missing',
          severity: 'warning',
          message: `Una sala de ${scope} falta en tres descubrimientos consecutivos; requiere revisión.`,
          details: { provider: 'openstreetmap', providerId: prior.provider_id, misses },
        });
        if (alertError && alertError.code !== '23505') throw alertError;
      }
    }

    const { error: finishError } = await supabase
      .from('venue_discovery_runs')
      .update({
        status: 'success',
        candidate_count: candidates.length,
        finished_at: timestamp,
        metrics: { promotedCount, snapshotHash: candidateSnapshotHash(candidates) },
      })
      .eq('id', run.id);
    if (finishError) throw finishError;
    logger.info('Venue discovery completed', { scope, candidateCount: candidates.length, promotedCount });
  } catch (error) {
    await supabase
      .from('venue_discovery_runs')
      .update({
        status: 'error',
        error_message: error instanceof Error ? error.message : String(error),
        finished_at: new Date().toISOString(),
      })
      .eq('id', run.id);
    throw error;
  }
};

const run = async () => {
  let errorCount = 0;
  for (const scope of scopes) {
    try {
      await discoverScope(scope);
    } catch (error) {
      errorCount += 1;
      logger.error('Venue discovery scope failed', error, { scope });
    }
  }
  if (errorCount > 0) throw new Error(`${errorCount} venue discovery scopes failed`);
};

run().catch((error) => {
  logger.error('Venue discovery failed', error);
  process.exitCode = 1;
});
