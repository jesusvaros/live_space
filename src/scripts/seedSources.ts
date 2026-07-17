import { env } from '../config/env.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import type { ParserKey, ScrapeSourceMetadata, SourceType } from '../types/scrape.js';
import { Logger } from '../utils/logger.js';

type SeedSource = {
  source_type: SourceType;
  name: string;
  base_url: string;
  city: 'Madrid' | 'Barcelona';
  parser_key: ParserKey;
  metadata?: ScrapeSourceMetadata;
};

const seedSources: SeedSource[] = [
  ['WiZink Center', 'https://www.wizinkcenter.es/', 'Madrid'],
  ['La Riviera', 'https://lariviera.com/', 'Madrid'],
  ['Sala El Sol', 'https://salaelsol.com/', 'Madrid'],
  ['Sala Caracol', 'https://salacaracol.com/', 'Madrid'],
  ['Sala But', 'https://sala-b.com/', 'Madrid'],
  ['Sala Copernico', 'https://salacopernico.com/', 'Madrid'],
  ['Independance Club', 'https://independanceclub.com/', 'Madrid'],
  ['Siroco', 'https://siroco.es/', 'Madrid'],
  ['Ochoymedio Club', 'https://ochoymedio.com/', 'Madrid'],
  ['Teatro Eslava', 'https://teatroeslava.com/', 'Madrid'],
  ['Razzmatazz', 'https://salarazzmatazz.com/', 'Barcelona'],
  ['Sala Apolo', 'https://sala-apolo.com/', 'Barcelona'],
  ['Sidecar', 'https://sidecar.es/', 'Barcelona'],
  ['Upload', 'https://uploadbarcelona.com/', 'Barcelona'],
  ['La Nau', 'https://lanau.com/', 'Barcelona'],
  ['Luz de Gas', 'https://luzdegas.com/', 'Barcelona'],
  ['Jamboree', 'https://jamboreejazz.com/', 'Barcelona'],
  ['Wolf Barcelona', 'https://wolfbarcelona.com/', 'Barcelona'],
].map(([name, base_url, city]) => ({
  source_type: 'venue' as const,
  name,
  base_url,
  city: city as 'Madrid' | 'Barcelona',
  parser_key: 'generic-agenda' as const,
}));

const seed = async () => {
  const logger = new Logger(env.logLevel, { script: 'seedSources' });
  const supabase = getSupabaseAdmin();

  for (const source of seedSources) {
    const { data: existing, error: readError } = await supabase
      .from('scrape_sources')
      .select('id')
      .eq('base_url', source.base_url)
      .maybeSingle();
    if (readError) throw readError;

    const row = {
      source_type: source.source_type,
      name: source.name,
      base_url: source.base_url,
      city: source.city,
      country_code: 'ES',
      parser_key: source.parser_key,
      frequency: 'daily',
      metadata: source.metadata || {},
      is_active: true,
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
