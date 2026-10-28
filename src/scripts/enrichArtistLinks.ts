import { env } from '../config/env.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { enrichArtistLinks } from '../pipeline/enrichArtistLinks.js';
import { Logger } from '../utils/logger.js';

// Spotify, Instagram, YouTube, TikTok, Bandcamp, Apple Music and website of
// each artist from MusicBrainz (CC0). Only fills empty links. Writes by
// default; `-- --dry-run` only logs.
//   --dry-run   log what would change
//   --limit=N   artists looked up per run (default 200, ~1-3 requests each)
const args = process.argv.slice(2);
const limit = Number(args.find((arg) => arg.startsWith('--limit='))?.split('=')[1]);

const logger = new Logger(env.logLevel, { script: 'enrichArtistLinks' });

enrichArtistLinks(
  getSupabaseAdmin(),
  { dryRun: args.includes('--dry-run'), limit: Number.isFinite(limit) && limit > 0 ? limit : 200 },
  logger,
).catch((error) => {
  logger.error('Artist links enrichment failed', error);
  process.exitCode = 1;
});
