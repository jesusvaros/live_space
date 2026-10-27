import React, { useRef } from 'react';
import AppShell from '../components/AppShell';
import DetailHeader from '../components/ui/DetailHeader';
// Single source: the same Markdown is published in the docs site.
import licenceMarkdown from '../../docs/legal/licencia-momentos.md?raw';

type Block =
  | { type: 'h1' | 'h2' | 'p' | 'note'; text: string }
  | { type: 'ul'; items: string[] };

// Enough Markdown for this document: headings, paragraphs, a list and a
// blockquote with **bold**.
const parse = (markdown: string): Block[] => {
  const blocks: Block[] = [];
  for (const chunk of markdown.split(/\n\s*\n/)) {
    const lines = chunk.split('\n').map(line => line.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    if (lines[0].startsWith('# ')) blocks.push({ type: 'h1', text: lines[0].slice(2) });
    else if (lines[0].startsWith('## ')) blocks.push({ type: 'h2', text: lines[0].slice(3) });
    else if (lines[0].startsWith('>')) blocks.push({ type: 'note', text: lines.map(line => line.replace(/^>\s?/, '')).join(' ') });
    else if (lines[0].startsWith('- ')) {
      const items: string[] = [];
      lines.forEach(line => {
        if (line.startsWith('- ')) items.push(line.slice(2));
        else items[items.length - 1] += ` ${line}`;
      });
      blocks.push({ type: 'ul', items });
    } else blocks.push({ type: 'p', text: lines.join(' ') });
  }
  return blocks;
};

const inline = (text: string) =>
  text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith('**') ? <strong key={index} className="text-app-ink">{part.slice(2, -2)}</strong> : part,
  );

const blocks = parse(licenceMarkdown);

const LicenciaMomentos: React.FC = () => {
  const contentRef = useRef<HTMLElement | null>(null);
  return (
    <AppShell headerProps={null} contentRef={contentRef}>
      <DetailHeader title="Licencia de los momentos" scrollRef={contentRef} fallbackHref="/tabs/upload" />
      <article className="mx-auto max-w-2xl px-4 pb-[calc(40px+env(safe-area-inset-bottom,0px))] pt-[calc(64px+env(safe-area-inset-top,0px))]">
        {blocks.map((block, index) => {
          switch (block.type) {
            case 'h1':
              return <h1 key={index} className="m-0 font-poster text-[36px] leading-[0.95] text-app-ink">{block.text}</h1>;
            case 'h2':
              return <h2 key={index} className="m-0 mt-7 font-display text-lg font-bold text-app-ink">{block.text}</h2>;
            case 'note':
              return (
                <p key={index} className="m-0 mt-4 rounded-2xl border border-app-accent/40 bg-app-accent/10 p-3 text-sm leading-relaxed text-white/80">
                  {inline(block.text)}
                </p>
              );
            case 'ul':
              return (
                <ul key={index} className="m-0 mt-3 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-white/75 marker:text-app-accent">
                  {block.items.map(item => <li key={item}>{inline(item)}</li>)}
                </ul>
              );
            default:
              return <p key={index} className="m-0 mt-3 text-sm leading-relaxed text-white/75">{inline(block.text)}</p>;
          }
        })}
      </article>
    </AppShell>
  );
};

export default LicenciaMomentos;
