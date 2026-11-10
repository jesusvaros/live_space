import React, { useRef } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import AppShell from '../components/AppShell';
import DetailHeader from '../components/ui/DetailHeader';
import LegalArticle from '../features/legal/LegalArticle';
import { isLegalSlug, LEGAL_DOCUMENTS, legalAppPath } from '../features/legal/documents';

// /legal/:doc in the app: privacy policy, terms, account deletion and the
// moments licence. Bundled with the app, so they open offline and without an
// account. Links between them stay in the app.

const toAppLink = (href: string, text: string, key: number) => {
  const slug = href.replace(/^\/|\/$/g, '');
  if (href.startsWith('/') && isLegalSlug(slug)) {
    return <Link key={key} to={legalAppPath(slug)} className="text-app-accent underline underline-offset-2">{text}</Link>;
  }
  // Anything else (mail, the public web, an authority's site) leaves the app.
  return (
    <a key={key} href={href} target="_blank" rel="noreferrer" className="text-app-accent underline underline-offset-2">
      {text}
    </a>
  );
};

const LegalPage: React.FC = () => {
  const { doc } = useParams<{ doc: string }>();
  const contentRef = useRef<HTMLElement | null>(null);
  if (!isLegalSlug(doc)) return <Navigate to="/ajustes/legal" replace />;
  const document = LEGAL_DOCUMENTS[doc];
  return (
    <AppShell headerProps={null} contentRef={contentRef}>
      <DetailHeader title={document.title} scrollRef={contentRef} fallbackHref="/tabs/events" />
      <article className="mx-auto max-w-2xl px-4 pb-[calc(40px+env(safe-area-inset-bottom,0px))] pt-[calc(64px+env(safe-area-inset-top,0px))]">
        <LegalArticle markdown={document.markdown} renderLink={toAppLink} />
      </article>
    </AppShell>
  );
};

export default LegalPage;
