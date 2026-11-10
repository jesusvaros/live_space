import React, { useEffect } from 'react';
import LegalArticle from '../../features/legal/LegalArticle';
import { LEGAL_DOCUMENTS, type LegalSlug } from '../../features/legal/documents';
import { LEGAL_CONTACT_EMAIL } from '../../features/legal/config';
import { LandingFooter, LandingHeader } from '../parts';

// /privacidad, /condiciones, /borrar-cuenta and /licencia-momentos on the
// public web: the same Markdown as the app (docs/legal/). The prerender also
// writes their text into the HTML, so they read without JavaScript.

const LegalLanding: React.FC<{ slug: LegalSlug }> = ({ slug }) => {
  const document = LEGAL_DOCUMENTS[slug];
  useEffect(() => {
    window.document.title = `${document.title} · Live Space`;
  }, [document.title]);

  return (
    <div className="ls-root h-dvh overflow-y-auto overflow-x-hidden text-[17px] leading-normal">
      <LandingHeader />
      <main className="mx-auto max-w-[720px] px-5 pb-16 pt-8 md:px-8">
        <LegalArticle markdown={document.markdown} />
        {slug === 'borrar-cuenta' && LEGAL_CONTACT_EMAIL ? (
          <a
            href={`mailto:${LEGAL_CONTACT_EMAIL}?subject=${encodeURIComponent('Borrar mi cuenta')}`}
            className="mt-8 inline-flex min-h-14 items-center justify-center rounded-full bg-[var(--ls-accent)] px-7 text-lg font-semibold text-[#0d0e12] no-underline"
          >
            Pedir el borrado por email
          </a>
        ) : null}
      </main>
      <LandingFooter />
    </div>
  );
};

export default LegalLanding;
