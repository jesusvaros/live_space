import React, { useMemo } from 'react';
import { fillLegalPlaceholders, isSafeHref, parseInline, parseLegalMarkdown } from '../../shared/legal/markdown';
import { LEGAL_CONTACT_EMAIL, LEGAL_OWNER } from './config';

type LegalArticleProps = {
  markdown: string;
  // Turns a site path of the texts ("/privacidad") into a link of the host:
  // the app keeps them in-app (/legal/privacidad), the web leaves them.
  renderLink?: (href: string, text: string, key: number) => React.ReactNode;
};

const defaultLink = (href: string, text: string, key: number) => (
  <a key={key} href={href} className="text-[#ff8a66] underline underline-offset-2">{text}</a>
);

/** A legal text from docs/legal/, same look in the app and on the web. */
const LegalArticle: React.FC<LegalArticleProps> = ({ markdown, renderLink = defaultLink }) => {
  const blocks = useMemo(
    () => parseLegalMarkdown(fillLegalPlaceholders(markdown, { contactEmail: LEGAL_CONTACT_EMAIL, owner: LEGAL_OWNER })),
    [markdown],
  );

  const inline = (text: string) =>
    parseInline(text).map((part, index) => {
      if (part.type === 'bold') return <strong key={index} className="font-semibold text-white">{part.text}</strong>;
      if (part.type === 'link') return isSafeHref(part.href) ? renderLink(part.href, part.text, index) : part.text;
      return <React.Fragment key={index}>{part.text}</React.Fragment>;
    });

  return (
    <>
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'h1':
            return <h1 key={index} className="m-0 font-display text-[34px] font-bold leading-[1] text-white">{block.text}</h1>;
          case 'h2':
            return <h2 key={index} className="m-0 mt-8 font-display text-lg font-bold text-white">{block.text}</h2>;
          case 'h3':
            return <h3 key={index} className="m-0 mt-5 text-[15px] font-semibold text-white">{block.text}</h3>;
          case 'note':
            return (
              <p key={index} className="m-0 mt-4 rounded-2xl border border-[#ff5b2e]/40 bg-[#ff5b2e]/10 p-3 text-sm leading-relaxed text-white/80">
                {inline(block.text)}
              </p>
            );
          case 'ul':
            return (
              <ul key={index} className="m-0 mt-3 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-white/75 marker:text-[#ff5b2e]">
                {block.items.map((item, itemIndex) => <li key={itemIndex}>{inline(item)}</li>)}
              </ul>
            );
          case 'ol':
            return (
              <ol key={index} className="m-0 mt-3 flex list-decimal flex-col gap-1.5 pl-5 text-sm leading-relaxed text-white/75 marker:text-[#ff5b2e]">
                {block.items.map((item, itemIndex) => <li key={itemIndex}>{inline(item)}</li>)}
              </ol>
            );
          default:
            return <p key={index} className="m-0 mt-3 text-sm leading-relaxed text-white/75">{inline(block.text)}</p>;
        }
      })}
    </>
  );
};

export default LegalArticle;
