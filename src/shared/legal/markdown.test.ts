import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fillLegalPlaceholders, legalBlocksToHtml, parseInline, parseLegalMarkdown } from './markdown';

describe('parseLegalMarkdown', () => {
  it('reads headings, paragraphs, lists and notes', () => {
    const blocks = parseLegalMarkdown('# Título\n\n> **Ojo** aviso\n\n## Uno\n\nTexto\nseguido.\n\n- a\n- b\n  sigue\n\n1. primero\n2. segundo');
    expect(blocks).toEqual([
      { type: 'h1', text: 'Título' },
      { type: 'note', text: '**Ojo** aviso' },
      { type: 'h2', text: 'Uno' },
      { type: 'p', text: 'Texto seguido.' },
      { type: 'ul', items: ['a', 'b sigue'] },
      { type: 'ol', items: ['primero', 'segundo'] },
    ]);
  });
});

describe('inline and HTML', () => {
  it('splits bold and links', () => {
    expect(parseInline('Ver **esto** y [aquí](/privacidad).')).toEqual([
      { type: 'text', text: 'Ver ' },
      { type: 'bold', text: 'esto' },
      { type: 'text', text: ' y ' },
      { type: 'link', text: 'aquí', href: '/privacidad' },
      { type: 'text', text: '.' },
    ]);
  });

  it('escapes text and drops unsafe links', () => {
    const html = legalBlocksToHtml(parseLegalMarkdown('<b>x</b> [mal](javascript:alert) [bien](https://www.aepd.es)'));
    expect(html).toBe('<p>&lt;b&gt;x&lt;/b&gt; mal <a href="https://www.aepd.es">bien</a></p>');
  });
});

describe('fillLegalPlaceholders', () => {
  it('shows visible placeholders until the owner sets them', () => {
    expect(fillLegalPlaceholders('{{TITULAR}} · {{EMAIL}}', { contactEmail: '', owner: '' })).toBe('[TITULAR] · [EMAIL DE CONTACTO]');
    expect(fillLegalPlaceholders('{{EMAIL}}', { contactEmail: 'hola@x.es', owner: '' })).toBe('hola@x.es');
  });
});

describe('docs/legal', () => {
  const read = (name: string) => readFileSync(path.resolve(__dirname, '../../../docs/legal', name), 'utf8');

  it.each(['privacidad.md', 'condiciones.md', 'borrar-cuenta.md', 'licencia-momentos.md'])('%s starts with a title and only links to safe places', name => {
    const blocks = parseLegalMarkdown(read(name));
    expect(blocks[0].type).toBe('h1');
    const links = blocks
      .flatMap(block => ('items' in block ? block.items : [block.text]))
      .flatMap(text => parseInline(text))
      .filter(part => part.type === 'link');
    for (const link of links) expect(link.type === 'link' && /^(\/[a-z-]+|https:\/\/)/.test(link.href)).toBe(true);
  });

  it('the privacy policy links to the deletion page and the AEPD', () => {
    const text = read('privacidad.md');
    expect(text).toContain('(/borrar-cuenta)');
    expect(text).toContain('https://www.aepd.es');
  });
});
