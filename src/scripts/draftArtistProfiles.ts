import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  bioDraft,
  groupBindings,
  linksFor,
  sparqlFor,
  stylesFor,
  type WikidataArtist,
  type WikidataBinding,
} from '../pipeline/wikidataProfiles.js';

// Proposes a short bio, styles and links for artists from Wikidata (CC0),
// matched by the MusicBrainz id we already store. READ-ONLY: it reads with
// the anon key and writes, for a person to review first:
//   borradores-artistas.csv     one row per artist with something to add
//   aplicar-bios.sql            bios (review the CSV before running it)
//   aplicar-estilos-enlaces.sql styles and missing links
// Every UPDATE only fills what is still empty, so a manager's own text or
// links are never overwritten. Artists with concerts in the next 60 days first.
//
//   npm run profiles:drafts -- out-dir   (needs SUPABASE_URL + SUPABASE_ANON_KEY)

const outDir = process.argv[2] ?? '.';
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('Faltan SUPABASE_URL y SUPABASE_ANON_KEY');
  process.exit(1);
}

const PAGE = 1000;
const BATCH = 80;
const UA = 'LiveSpaceProfileDrafts/1.0 (revisión manual de perfiles de artistas)';

type Artist = {
  id: string;
  name: string;
  bio: string | null;
  genres: string[] | null;
  external_ids: Record<string, unknown> | null;
  external_links: Record<string, string> | null;
};

const getAll = async <T>(query: string): Promise<T[]> => {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${url}/rest/v1/${query}`, {
      headers: { apikey: key, authorization: `Bearer ${key}`, range: `${from}-${from + PAGE - 1}` },
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const page = (await res.json()) as T[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const main = async () => {
  const now = new Date();
  const until = new Date(now.getTime() + 60 * 86_400_000);
  const [artists, events] = await Promise.all([
    getAll<Artist>('artists?select=id,name,bio,genres,external_ids,external_links&external_ids->>musicbrainz=not.is.null'),
    getAll<{ event_artists: { artist_id: string }[] | null }>(
      `events?select=event_artists(artist_id)&status=eq.published&starts_at=gte.${now.toISOString()}&starts_at=lt.${until.toISOString()}`,
    ),
  ]);
  const upcoming = new Map<string, number>();
  for (const event of events) for (const { artist_id: id } of event.event_artists ?? []) upcoming.set(id, (upcoming.get(id) ?? 0) + 1);

  const byMbid = new Map(artists.map((artist) => [String(artist.external_ids?.musicbrainz), artist]));
  const mbids = [...byMbid.keys()];
  const facts = new Map<string, WikidataArtist>();
  for (let index = 0; index < mbids.length; index += BATCH) {
    const ask = () =>
      fetch('https://query.wikidata.org/sparql', {
        method: 'POST',
        headers: { 'user-agent': UA, accept: 'application/sparql-results+json', 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ query: sparqlFor(mbids.slice(index, index + BATCH)) }),
      });
    let res = await ask();
    // The public endpoint drops a query now and then (502/429): one retry.
    if (!res.ok) {
      await sleep(5000);
      res = await ask();
    }
    if (!res.ok) {
      console.warn(`Wikidata ${res.status} en el lote ${index / BATCH + 1}; se salta`);
    } else {
      const json = (await res.json()) as { results: { bindings: WikidataBinding[] } };
      for (const [mbid, artist] of groupBindings(json.results.bindings)) facts.set(mbid, artist);
    }
    process.stdout.write(`Wikidata ${Math.min(index + BATCH, mbids.length)}/${mbids.length}\r`);
    await sleep(1200);
  }

  const quote = (cell: unknown) => `"${String(cell ?? '').replace(/"/g, '""')}"`;
  const sqlText = (text: string) => `'${text.replace(/'/g, "''")}'`;
  const rows: string[][] = [];
  const bioSql: string[] = [];
  const restSql: string[] = [];
  let bios = 0;
  let styled = 0;
  let linked = 0;

  const ordered = [...facts.values()]
    .map((fact) => ({ fact, artist: byMbid.get(fact.mbid)! }))
    .sort((a, b) => (upcoming.get(b.artist.id) ?? 0) - (upcoming.get(a.artist.id) ?? 0) || a.artist.name.localeCompare(b.artist.name));

  for (const { fact, artist } of ordered) {
    const bio = artist.bio?.trim() ? null : bioDraft(fact);
    const styles = artist.genres?.length ? [] : stylesFor(fact);
    const current = artist.external_links ?? {};
    const links = Object.fromEntries(Object.entries(linksFor(fact)).filter(([name]) => !current[name]));
    if (!bio && !styles.length && !Object.keys(links).length) continue;

    rows.push([
      artist.id,
      artist.name,
      String(upcoming.get(artist.id) ?? 0),
      bio ?? '',
      styles.join(' · '),
      Object.entries(links).map(([name, link]) => `${name}: ${link}`).join(' | '),
      fact.item,
      fact.eswiki ?? '',
    ]);
    if (bio) {
      bios += 1;
      bioSql.push(`update public.artists set bio = ${sqlText(bio)} where id = '${artist.id}' and coalesce(bio, '') = ''; -- ${artist.name.replace(/\n/g, ' ')}`);
    }
    if (styles.length) {
      styled += 1;
      restSql.push(
        `update public.artists set genres = array[${styles.map(sqlText).join(', ')}] where id = '${artist.id}' and coalesce(array_length(genres, 1), 0) = 0;`,
      );
    }
    if (Object.keys(links).length) {
      linked += 1;
      // Existing keys win (right side of ||), so nothing a manager wrote is replaced.
      restSql.push(
        `update public.artists set external_links = ${sqlText(JSON.stringify(links))}::jsonb || coalesce(external_links, '{}'::jsonb) where id = '${artist.id}';`,
      );
    }
  }

  mkdirSync(outDir, { recursive: true });
  const header = ['artist_id', 'artista', 'conciertos_60d', 'bio_borrador', 'estilos', 'enlaces_nuevos', 'wikidata', 'wikipedia_es'];
  writeFileSync(join(outDir, 'borradores-artistas.csv'), [header, ...rows].map((row) => row.map(quote).join(',')).join('\n') + '\n');
  const wrap = (lines: string[]) => `-- Generado por npm run profiles:drafts (Wikidata, CC0). Revisa el CSV antes.\nbegin;\n${lines.join('\n')}\ncommit;\n`;
  writeFileSync(join(outDir, 'aplicar-bios.sql'), wrap(bioSql));
  writeFileSync(join(outDir, 'aplicar-estilos-enlaces.sql'), wrap(restSql));

  console.log(
    `\nCon MusicBrainz ${mbids.length} · en Wikidata ${facts.size} · bios ${bios} · estilos ${styled} · enlaces ${linked} → ${outDir}`,
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
