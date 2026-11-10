import React, { useState } from 'react';
import { uniqueImageUrls } from '../../lib/eventCover';

type CoverImageProps = {
  /** Tried in order; http:// and empty values are dropped. */
  sources: ReadonlyArray<string | null | undefined>;
  /** Shown when there is no URL or every one failed (usually <GeneratedPoster>). */
  fallback: React.ReactNode;
  className?: string;
  alt?: string;
  /** Above the fold: load right away. */
  eager?: boolean;
};

// A cover that walks its fallback chain on load errors: R2 thumbnail → R2 card
// → original → generated poster. data-own-fallback keeps the global broken
// image handler (lib/imageFallback.ts) from swapping in its placeholder.
const CoverImage: React.FC<CoverImageProps> = ({ sources, fallback, className, alt = '', eager = false }) => {
  const urls = uniqueImageUrls(sources);
  const chainKey = urls.join('\n');
  const [failed, setFailed] = useState<{ chain: string; count: number }>({ chain: chainKey, count: 0 });
  // A new chain (another event, or a poster that just got mirrored) starts over.
  const index = failed.chain === chainKey ? failed.count : 0;
  const src = urls[index];
  if (!src) return <>{fallback}</>;
  return (
    <img
      key={src}
      src={src}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      data-own-fallback=""
      onError={() => setFailed({ chain: chainKey, count: index + 1 })}
      className={className}
    />
  );
};

export default CoverImage;
