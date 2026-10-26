import { useParams } from 'react-router-dom';

import { idFromSlug } from '../seo/slug';

// Entity pages are reachable as /tabs/venue/:id and as /sala/:slug.
export const useRouteEntityId = (): string | undefined => {
  const { id, slug } = useParams<{ id?: string; slug?: string }>();
  return id || idFromSlug(slug) || undefined;
};
