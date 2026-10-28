// Any <img> in the app that fails to load (dead poster link, expired CDN
// URL, hotlink block) shows a neutral placeholder instead of the browser's
// broken-image icon. Installed once at startup; components that already
// have their own fallback (Avatar, ExternalMomentCard) never reach it.

const PLACEHOLDER = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" preserveAspectRatio="xMidYMid slice">` +
    `<rect width="120" height="120" fill="#1c1d23"/>` +
    `<g fill="none" stroke="#4a4b55" stroke-width="3" stroke-linejoin="round">` +
    `<rect x="38" y="42" width="44" height="36" rx="5"/>` +
    `<path d="M40 74l13-14 10 10 7-7 10 11"/></g>` +
    `<circle cx="70" cy="53" r="4" fill="#4a4b55"/></svg>`,
)}`;

const handleError = (event: Event) => {
  const target = event.target;
  if (!(target instanceof HTMLImageElement)) return;
  // The placeholder itself failing must not loop.
  if (target.src === PLACEHOLDER) return;
  target.removeAttribute('srcset');
  target.src = PLACEHOLDER;
};

export const installImageFallback = () => {
  // Image errors don't bubble; capture catches them for the whole document.
  document.addEventListener('error', handleError, true);
};
