import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// The concert poster at full screen: tap the poster on the concert page,
// tap anywhere or X to close. Tries each URL in order (original first) and
// falls back to the next when one fails.

type PosterViewerProps = {
  sources: string[];
  alt: string;
  onClose: () => void;
};

const PosterViewer: React.FC<PosterViewerProps> = ({ sources, alt, onClose }) => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const src = sources[index];
  if (!src) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]"
    >
      <img
        src={src}
        alt={alt}
        onError={() => setIndex(current => current + 1)}
        className="max-h-full max-w-full object-contain"
        style={{ touchAction: 'pinch-zoom' }}
      />
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute right-3 top-[calc(12px+env(safe-area-inset-top,0px))] flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </div>,
    document.body,
  );
};

export default PosterViewer;
