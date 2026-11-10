// The legal texts are Markdown files in docs/legal/ (one source for the
// docs site, the app and the public web). This is just enough Markdown for
// them: # / ## / ### headings, paragraphs, "- " lists, "> " notes, **bold**
// and [links](url). No imports: the Node prerender (buildPublicSite) uses it
// too.

export type InlinePart =
  | { type: 'text'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'link'; text: string; href: string };

export type LegalBlock =
  | { type: 'h1' | 'h2' | 'h3' | 'p' | 'note'; text: string }
  | { type: 'ul' | 'ol'; items: string[] };

export const parseLegalMarkdown = (markdown: string): LegalBlock[] => {
  const blocks: LegalBlock[] = [];
  for (const chunk of markdown.replace(/\r\n/g, '\n').split(/\n\s*\n/)) {
    const lines = chunk.split('\n').map(line => line.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    const [first] = lines;
    if (first.startsWith('### ')) blocks.push({ type: 'h3', text: first.slice(4) });
    else if (first.startsWith('## ')) blocks.push({ type: 'h2', text: first.slice(3) });
    else if (first.startsWith('# ')) blocks.push({ type: 'h1', text: first.slice(2) });
    else if (first.startsWith('>')) blocks.push({ type: 'note', text: lines.map(line => line.replace(/^>\s?/, '')).join(' ') });
    else if (first.startsWith('- ') || /^\d+\.\s/.test(first)) {
      const ordered = !first.startsWith('- ');
      const marker = ordered ? /^\d+\.\s+/ : /^- /;
      const items: string[] = [];
      lines.forEach(line => {
        if (marker.test(line)) items.push(line.replace(marker, ''));
        else if (items.length > 0) items[items.length - 1] += ` ${line}`;
      });
      blocks.push({ type: ordered ? 'ol' : 'ul', items });
    } else blocks.push({ type: 'p', text: lines.join(' ') });
    // A heading line followed by text in the same chunk.
    const last = blocks[blocks.length - 1];
    if ((last.type === 'h1' || last.type === 'h2' || last.type === 'h3') && lines.length > 1) {
      blocks.push({ type: 'p', text: lines.slice(1).join(' ') });
    }
  }
  return blocks;
};

const INLINE = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g;

export const parseInline = (text: string): InlinePart[] =>
  text
    .split(INLINE)
    .filter(part => part !== '')
    .map((part): InlinePart => {
      if (part.startsWith('**') && part.endsWith('**')) return { type: 'bold', text: part.slice(2, -2) };
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
      if (link) return { type: 'link', text: link[1], href: link[2] };
      return { type: 'text', text: part };
    });

/** Only site paths, https and mailto links survive; anything else renders as text. */
export const isSafeHref = (href: string) => /^(\/(?!\/)|https:\/\/|mailto:)/.test(href);

export type LegalPlaceholders = { contactEmail: string; owner: string };

/**
 * {{EMAIL}} and {{TITULAR}} in the texts become the configured values, or the
 * visible placeholders «[EMAIL DE CONTACTO]» / «[TITULAR]» while unset.
 */
export const fillLegalPlaceholders = (markdown: string, values: LegalPlaceholders) =>
  markdown
    .replace(/\{\{EMAIL\}\}/g, values.contactEmail || '[EMAIL DE CONTACTO]')
    .replace(/\{\{TITULAR\}\}/g, values.owner || '[TITULAR]');

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const inlineHtml = (text: string) =>
  parseInline(text)
    .map(part => {
      if (part.type === 'bold') return `<strong>${escapeHtml(part.text)}</strong>`;
      if (part.type === 'link' && isSafeHref(part.href)) return `<a href="${escapeHtml(part.href)}">${escapeHtml(part.text)}</a>`;
      return escapeHtml(part.text);
    })
    .join('');

/** Static HTML for the prerendered web pages (no JavaScript needed to read them). */
export const legalBlocksToHtml = (blocks: readonly LegalBlock[]) =>
  blocks
    .map(block => {
      if ('items' in block) {
        return `<${block.type}>${block.items.map(item => `<li>${inlineHtml(item)}</li>`).join('')}</${block.type}>`;
      }
      if (block.type === 'note') return `<p class="note">${inlineHtml(block.text)}</p>`;
      return `<${block.type}>${inlineHtml(block.text)}</${block.type}>`;
    })
    .join('\n');
