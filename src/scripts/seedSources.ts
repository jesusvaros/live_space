import { env } from '../config/env.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { seedSources } from '../pipeline/sourceCatalog.js';
import { Logger } from '../utils/logger.js';

const seed = async () => {
  const logger = new Logger(env.logLevel, { script: 'seedSources' });
  const supabase = getSupabaseAdmin();

  for (const source of seedSources) {
    const { data: urlMatch, error: readError } = await supabase
      .from('scrape_sources')
      .select('id,is_active,terms_reviewed_at,metadata')
      .eq('base_url', source.base_url)
      .maybeSingle();
    if (readError) throw readError;

    let existing = urlMatch;
    if (!existing) {
      const { data: nameMatch, error: nameReadError } = await supabase
        .from('scrape_sources')
        .select('id,is_active,terms_reviewed_at,metadata')
        .eq('name', source.name)
        .eq('city', source.city)
        .limit(1)
        .maybeSingle();
      if (nameReadError) throw nameReadError;
      existing = nameMatch;
    }

    const existingMetadata =
      existing?.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata)
        ? existing.metadata
        : {};
    const catalogIsReady = source.metadata.fixtureVerified === true;
    const mergedMetadata = catalogIsReady
      ? { ...existingMetadata, ...source.metadata }
      : { ...source.metadata, ...existingMetadata };
    const termsReviewedAt = existing?.terms_reviewed_at || source.terms_reviewed_at;
    const mayBeActive = Boolean(
      (existing?.is_active || source.is_active) &&
        termsReviewedAt &&
        mergedMetadata.fixtureVerified === true
    );

    const row = {
      source_type: source.source_type,
      name: source.name,
      base_url: source.base_url,
      city: source.city,
      country_code: 'ES',
      parser_key: source.parser_key,
      frequency: 'daily',
      metadata: mergedMetadata,
      terms_reviewed_at: termsReviewedAt,
      is_active: mayBeActive,
    };

    if (existing?.id) {
      const { error } = await supabase.from('scrape_sources').update(row).eq('id', existing.id);
      if (error) throw error;
      logger.info('Updated scrape source seed', { sourceUrl: source.base_url });
    } else {
      const { error } = await supabase.from('scrape_sources').insert(row);
      if (error) throw error;
      logger.info('Inserted scrape source seed', { sourceUrl: source.base_url });
    }
  }
};

seed().catch((error) => {
  const logger = new Logger(env.logLevel, { script: 'seedSources' });
  logger.error('Seed sources failed', error);
  process.exitCode = 1;
});
