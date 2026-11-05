// Some listings reach the catalogue as an "artist" named after the night
// ("Clásicos Disney", "Tributo MECANO", "GMS Live IV"). They are real rows the
// event page still links to, but suggesting them as artists to follow reads as
// junk, so Explorar leaves them out.
const EVENT_LIKE = new RegExp(
  [
    ';',
    '\\bclasicos\\b',
    '\\btributo\\b',
    '\\bhomenaje\\b',
    '\\bescenarios\\b',
    '\\bconciertos?\\b',
    '\\bfiesta\\b',
    '\\baniversario\\b',
    '\\blive (session|experience)\\b',
    '\\bjam (session|&)',
    '\\bsundazed jam\\b',
    '\\blive [ivx]+$',
    '\\bvs\\.? ',
    'nochevieja',
    '\\bfest(ival)?\\b',
  ].join('|'),
);

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

export const looksLikeEventName = (name: string) => EVENT_LIKE.test(fold(name));
