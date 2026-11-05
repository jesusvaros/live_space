import { env } from '../config/env.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { enrichGenres } from '../pipeline/enrichGenres.js';
import { Logger } from '../utils/logger.js';

// Styles for artists (Deezer albums, then the nights they lead) and upcoming
// concerts (venue tags + artists). Writes by default; `-- --dry-run` only logs.
//   --dry-run          log what would change
//   --artist-limit=N   artists looked up on Deezer per run (default 600)
const args = process.argv.slice(2);
const numberArg = (name: string, fallback: number): number => {
  const value = Number(args.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};

const logger = new Logger(env.logLevel, { script: 'enrichGenres' });

enrichGenres(
  getSupabaseAdmin(),
  { dryRun: args.includes('--dry-run'), artistLimit: numberArg('artist-limit', 600) },
  logger,
).catch((error) => {
  logger.error('Genre enrichment failed', error);
  process.exitCode = 1;
});
