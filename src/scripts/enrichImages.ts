import { env } from '../config/env.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { enrichImages } from '../pipeline/enrichImages.js';
import { Logger } from '../utils/logger.js';

// Event posters (staging backfill + og:image of upcoming events) and Deezer
// artist photos. Writes by default; `-- --dry-run` only logs.
//   --dry-run         log what would change
//   --events-only     skip artists
//   --artists-only    skip events
//   --page-limit=N    upcoming event pages fetched for og:image (default 120)
//   --artist-limit=N  artists looked up on Deezer per run (default 400)
const args = process.argv.slice(2);
const numberArg = (name: string, fallback: number): number => {
  const value = Number(args.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};

const logger = new Logger(env.logLevel, { script: 'enrichImages' });

enrichImages(
  getSupabaseAdmin(),
  {
    dryRun: args.includes('--dry-run'),
    events: !args.includes('--artists-only'),
    artists: !args.includes('--events-only'),
    pageFetchLimit: numberArg('page-limit', 120),
    artistLimit: numberArg('artist-limit', 400),
  },
  logger,
).catch((error) => {
  logger.error('Image enrichment failed', error);
  process.exitCode = 1;
});
