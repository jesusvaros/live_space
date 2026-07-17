import { env } from '../config/env.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import type { ParserKey, ScrapeSourceMetadata, SourceType } from '../types/scrape.js';
import { Logger } from '../utils/logger.js';

type SeedSource = {
  source_type: SourceType;
  source_name: string;
  source_url: string;
  city: string;
  parser_key: ParserKey;
  metadata?: ScrapeSourceMetadata;
};

const seedSources: SeedSource[] = [
  {
    source_type: 'venue',
    source_name: 'WiZink Center',
    source_url: 'https://www.wizinkcenter.es/',
    city: 'Madrid',
    parser_key: 'generic-agenda',
  },
  {
    source_type: 'venue',
    source_name: 'La Riviera',
    source_url: 'https://lariviera.com/',
    city: 'Madrid',
    parser_key: 'generic-agenda',
  },
  {
    source_type: 'venue',
    source_name: 'Sala El Sol',
    source_url: 'https://salaelsol.com/',
    city: 'Madrid',
    parser_key: 'generic-agenda',
  },
  {
    source_type: 'venue',
    source_name: 'Sala Caracol',
    source_url: 'https://salacaracol.com/',
    city: 'Madrid',
    parser_key: 'generic-agenda',
  },
  {
    source_type: 'venue',
    source_name: 'Sala But',
    source_url: 'https://sala-b.com/',
    city: 'Madrid',
    parser_key: 'generic-agenda',
  },
  {
    source_type: 'venue',
    source_name: 'Sala Copernico',
    source_url: 'https://salacopernico.com/',
    city: 'Madrid',
    parser_key: 'generic-agenda',
  },
  {
    source_type: 'venue',
    source_name: 'Independance Club',
    source_url: 'https://independanceclub.com/',
    city: 'Madrid',
    parser_key: 'generic-agenda',
  },
  {
    source_type: 'venue',
    source_name: 'Siroco',
    source_url: 'https://siroco.es/',
    city: 'Madrid',
    parser_key: 'generic-agenda',
  },
  {
    source_type: 'venue',
    source_name: 'Ochoymedio Club',
    source_url: 'https://ochoymedio.com/',
    city: 'Madrid',
    parser_key: 'generic-agenda',
  },
  {
    source_type: 'venue',
    source_name: 'Teatro Eslava',
    source_url: 'https://teatroeslava.com/',
    city: 'Madrid',
    parser_key: 'generic-agenda',
  },
  {
    source_type: 'venue',
    source_name: 'Razzmatazz',
    source_url: 'https://salarazzmatazz.com/',
    city: 'Barcelona',
    parser_key: 'generic-agenda',
  },
  {
    source_type: 'venue',
    source_name: 'Sala Apolo',
    source_url: 'https://sala-apolo.com/',
    city: 'Barcelona',
    parser_key: 'generic-agenda',
  },
  {
    source_type: 'venue',
    source_name: 'Sidecar',
    source_url: 'https://sidecar.es/',
    city: 'Barcelona',
    parser_key: 'generic-agenda',
  },
  {
    source_type: 'venue',
    source_name: 'Upload',
    source_url: 'https://uploadbarcelona.com/',
    city: 'Barcelona',
    parser_key: 'generic-agenda',
  },
  {
    source_type: 'venue',
    source_name: 'La Nau',
    source_url: 'https://lanau.com/',
    city: 'Barcelona',
    parser_key: 'generic-agenda',
  },
  {
    source_type: 'venue',
    source_name: 'Luz de Gas',
    source_url: 'https://luzdegas.com/',
    city: 'Barcelona',
    parser_key: 'generic-agenda',
  },
  {
    source_type: 'venue',
    source_name: 'Jamboree',
    source_url: 'https://jamboreejazz.com/',
    city: 'Barcelona',
    parser_key: 'generic-agenda',
  },
  {
    source_type: 'venue',
    source_name: 'Wolf Barcelona',
    source_url: 'https://wolfbarcelona.com/',
    city: 'Barcelona',
    parser_key: 'generic-agenda',
  },
  {
    source_type: 'venue',
    source_name: 'Sala Custom',
    source_url: 'https://www.salacustom.com/',
    city: 'Sevilla',
    parser_key: 'generic-agenda',
  },
  {
    source_type: 'venue',
    source_name: 'Sala X',
    source_url: 'https://lasalax.com/',
    city: 'Sevilla',
    parser_key: 'generic-agenda',
  },
  {
    source_type: 'venue',
    source_name: 'Sala Malandar',
    source_url: 'https://salamalandar.com/',
    city: 'Sevilla',
    parser_key: 'generic-agenda',
  },
  {
    source_type: 'venue',
    source_name: 'Fun Club',
    source_url: 'https://funclubsevilla.com/',
    city: 'Sevilla',
    parser_key: 'generic-agenda',
  },
  {
    source_type: 'venue',
    source_name: 'Sala Even',
    source_url: 'https://salaeven.com/',
    city: 'Sevilla',
    parser_key: 'generic-agenda',
  },
  {
    source_type: 'venue',
    source_name: 'Sala Moon',
    source_url: 'https://salamoon.es/',
    city: 'Valencia',
    parser_key: 'generic-agenda',
  },
  {
    source_type: 'venue',
    source_name: 'Loco Club',
    source_url: 'https://lococlub.org/',
    city: 'Valencia',
    parser_key: 'generic-agenda',
  },
  {
    source_type: 'venue',
    source_name: '16 Toneladas',
    source_url: 'https://16toneladas.com/',
    city: 'Valencia',
    parser_key: 'generic-agenda',
  },
  {
    source_type: 'venue',
    source_name: 'Jerusalem Club',
    source_url: 'https://jerusalemclub.com/',
    city: 'Valencia',
    parser_key: 'generic-agenda',
  },
  {
    source_type: 'venue',
    source_name: 'Kafe Antzokia',
    source_url: 'https://bilbaokafeantzokia.eus/',
    city: 'Bilbao',
    parser_key: 'generic-agenda',
  },
  {
    source_type: 'venue',
    source_name: 'Santana 27',
    source_url: 'https://santana27.com/',
    city: 'Bilbao',
    parser_key: 'generic-agenda',
  },
  {
    source_type: 'venue',
    source_name: 'Stage Live',
    source_url: 'https://stagelivebilbao.com/',
    city: 'Bilbao',
    parser_key: 'generic-agenda',
  },
  {
    source_type: 'venue',
    source_name: 'Sala Paris 15',
    source_url: 'https://paris15.es/',
    city: 'Malaga',
    parser_key: 'generic-agenda',
  },
  {
    source_type: 'venue',
    source_name: 'Sala Trinchera',
    source_url: 'https://salatrinchera.com/',
    city: 'Malaga',
    parser_key: 'generic-agenda',
  },
  {
    source_type: 'venue',
    source_name: 'La Casa del Loco',
    source_url: 'https://lacasadelloco.com/',
    city: 'Zaragoza',
    parser_key: 'generic-agenda',
  },
  {
    source_type: 'venue',
    source_name: 'Sala Lopez',
    source_url: 'https://salalopez.com/',
    city: 'Zaragoza',
    parser_key: 'generic-agenda',
  },
  {
    source_type: 'venue',
    source_name: 'Industrial Copera',
    source_url: 'https://industrialcopera.net/',
    city: 'Granada',
    parser_key: 'generic-agenda',
  },
  {
    source_type: 'venue',
    source_name: 'Sala Planta Baja',
    source_url: 'https://plantabaja.net/',
    city: 'Granada',
    parser_key: 'generic-agenda',
  },
  {
    source_type: 'venue',
    source_name: 'Sala REM',
    source_url: 'https://salarem.es/',
    city: 'Murcia',
    parser_key: 'generic-agenda',
  },
  {
    source_type: 'venue',
    source_name: 'Garaje Beat Club',
    source_url: 'https://garajebeatclub.com/',
    city: 'Murcia',
    parser_key: 'generic-agenda',
  },
];

const seed = async () => {
  const logger = new Logger(env.logLevel, { script: 'seedSources' });
  const supabase = getSupabaseAdmin();

  for (const source of seedSources) {
    const { data: existing, error: readError } = await supabase
      .from('scrape_sources')
      .select('id')
      .eq('source_url', source.source_url)
      .maybeSingle();

    if (readError) {
      throw readError;
    }

    if (existing?.id) {
      const { error: updateError } = await supabase
        .from('scrape_sources')
        .update({
          source_type: source.source_type,
          source_name: source.source_name,
          city: source.city,
          parser_key: source.parser_key,
          metadata: source.metadata || {},
          is_active: true,
        })
        .eq('id', existing.id);

      if (updateError) {
        throw updateError;
      }

      logger.info('Updated scrape source seed', {
        sourceUrl: source.source_url,
      });
      continue;
    }

    const { error: insertError } = await supabase.from('scrape_sources').insert({
      ...source,
      country: 'ES',
      scrape_frequency: 'weekly',
      is_active: true,
      metadata: source.metadata || {},
    });

    if (insertError) {
      throw insertError;
    }

    logger.info('Inserted scrape source seed', {
      sourceUrl: source.source_url,
    });
  }
};

seed().catch((error) => {
  const logger = new Logger(env.logLevel, { script: 'seedSources' });
  logger.error('Seed sources failed', error);
  process.exitCode = 1;
});
