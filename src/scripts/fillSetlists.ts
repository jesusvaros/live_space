import { env } from '../config/env.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { fillSetlistsFromSetlistFm } from '../pipeline/setlistFmFallback.js';
import { Logger } from '../utils/logger.js';

// setlist.fm fallback for concerts of the last three days without a setlist.
// Writes by default; `-- --dry-run` only logs. Needs SETLISTFM_API_KEY; without
// it the step logs a line and exits cleanly.
const args = process.argv.slice(2);
const logger = new Logger(env.logLevel, { script: 'fillSetlists' });

fillSetlistsFromSetlistFm(
  getSupabaseAdmin(),
  {
    apiKey: process.env.SETLISTFM_API_KEY?.trim() || undefined,
    dryRun: args.includes('--dry-run'),
  },
  logger,
).catch((error) => {
  logger.error('setlist.fm fallback failed', error);
  process.exitCode = 1;
});
