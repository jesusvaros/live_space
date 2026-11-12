// A 1×1 transparent GIF. Android WebView paints a big grey "play" icon on a
// <video> without a poster until its first frame shows; a transparent poster
// lets whatever is behind the video (a blurred backdrop, a gradient) show
// through instead.
export const BLANK_POSTER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/** Poster for a <video>: the first usable image, else the transparent one. */
export const videoPoster = (...candidates: (string | null | undefined)[]): string =>
  candidates.find((url): url is string => typeof url === 'string' && url.trim() !== '') ?? BLANK_POSTER;
