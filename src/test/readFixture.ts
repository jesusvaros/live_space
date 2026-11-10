import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Saved snapshots of venue agendas for the scraper parser tests (scripts,
// styles and inline images stripped). Paths are relative to the repository
// root, which is where vitest runs.
export const readFixture = (name: string): string =>
  readFileSync(join(process.cwd(), 'src/scraping/parsers/__fixtures__', name), 'utf8');
