// Ticket links sent from «¿No encuentras un concierto?» → concerts
// (docs/scraping.md, "Sugerencias de usuarios"). Run daily by
// .github/workflows/scrape-weekly.yml after the scrape.
//
//   npm run suggestions:import                 → dry run: fetches and reads the
//                                                pending links, writes nothing
//   npm run suggestions:import -- --apply      → stages, processes, updates statuses
//
// Options:
//   --limit=<n>   at most n pending suggestions this run (default 50)

import { env } from '../config/env.js';
import { DEFAULT_LIMIT, importEventSuggestions } from '../pipeline/importEventSuggestions.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger(env.logLevel, { script: 'importEventSuggestions' });

const flags = process.argv.slice(2);
const apply = flags.includes('--apply') && !flags.includes('--dry-run');
const limitFlag = flags.find(flag => flag.startsWith('--limit='));
const limitArg = limitFlag ? Number(limitFlag.slice('--limit='.length)) : NaN;
const limit = Number.isInteger(limitArg) && limitArg > 0 ? Math.min(limitArg, 500) : DEFAULT_LIMIT;

importEventSuggestions({ apply, limit, logger })
  .then(summary => {
    if (!apply) logger.info('Dry run: nothing written. Use --apply to stage and update.', summary);
  })
  .catch(error => {
    logger.error('importEventSuggestions failed', { message: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  });
