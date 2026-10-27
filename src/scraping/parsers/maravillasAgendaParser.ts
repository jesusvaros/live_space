import type { RawScrapedEvent, VenueParser } from '../../types/scrape.js';
import { lineupFromTitle, htmlToText, madridDateText, madridToday } from './shared.js';

type WordPressPost = {
  id?: number;
  link?: string;
  title?: { rendered?: string };
  content?: { rendered?: string };
  _embedded?: { 'wp:featuredmedia'?: Array<{ source_url?: string }> };
};

const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

// Maravillas Club publishes each concert as a WordPress post in the
// "conciertos" category. The post opens with
// "Jueves 5 de noviembre de 2026 • Matraca + Martwice y Faél Cleofé • precio"
// and names the show time ("concierto 21:30h"); the post title sometimes
// carries only the headliner, so the line-up comes from that header.
export const maravillasAgendaParser: VenueParser = {
  key: 'maravillas-agenda',
  canHandle: (_url, html) => html.includes('maravillasclub.com') && html.includes('wp-json'),
  parseListPage: async (page, source) => {
    const request = page.context().request;
    const categories = (await (await request.get(
      new URL('/wp-json/wp/v2/categories?slug=conciertos&_fields=id', source.base_url).toString(),
    )).json()) as Array<{ id?: number }>;
    const categoryId = categories[0]?.id;
    if (!categoryId) throw new Error('Maravillas: category "conciertos" not found');

    const posts: WordPressPost[] = [];
    for (let pageNumber = 1; pageNumber <= 2; pageNumber += 1) {
      const endpoint = new URL('/wp-json/wp/v2/posts', source.base_url);
      endpoint.search = new URLSearchParams({
        categories: String(categoryId),
        per_page: '50',
        page: String(pageNumber),
        _fields: 'id,link,title,content,_links,_embedded',
        _embed: 'wp:featuredmedia',
      }).toString();
      const response = await request.get(endpoint.toString());
      if (!response.ok()) break;
      posts.push(...((await response.json()) as WordPressPost[]));
    }

    const today = madridToday();
    return posts.flatMap((post): RawScrapedEvent[] => {
      const title = htmlToText(post.title?.rendered);
      const text = htmlToText(post.content?.rendered).replace(/\s+/g, ' ');
      const date = text.match(/(\d{1,2}) de ([a-zé]+)(?: de)? (\d{4})/i);
      const month = date ? MONTHS[date[2].toLowerCase()] : undefined;
      if (!post.id || !post.link || !title || !date || !month) return [];
      const iso = `${date[3]}-${String(month).padStart(2, '0')}-${date[1].padStart(2, '0')}`;
      if (iso < today) return [];
      const time = text.match(/conciertos?:? (\d{1,2})(?:[:.](\d{2}))?\s*h/i)
        ?? text.match(/puertas:? (\d{1,2})(?:[:.](\d{2}))?\s*h/i);
      const lineup = text.split('•')[1]?.trim();

      return [{
        sourceUrl: source.base_url,
        sourceEventUrl: post.link,
        sourceEventId: String(post.id),
        title,
        dateText: madridDateText(Number(date[3]), month, Number(date[1]), time ? `${time[1]}:${time[2] || '00'}` : '21:00'),
        venueName: source.name,
        city: source.city || undefined,
        artistNames: lineupFromTitle(lineup || title),
        imageUrl: post._embedded?.['wp:featuredmedia']?.[0]?.source_url,
        rawPayload: { id: post.id, link: post.link, title, lineup, text: text.slice(0, 2_000) },
      }];
    });
  },
};
