const DEFAULT_STOP_WORDS = [
  'concierto',
  'en directo',
  'live',
  'gira',
  'tour',
  'entradas',
  'tickets',
  'sala',
  'presentacion',
  'presentación',
  'aniversario',
];

export const collapseWhitespace = (value: string | undefined | null): string =>
  (value || '').replace(/\s+/g, ' ').trim();

export const removeEmojis = (value: string): string =>
  value.replace(
    /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{27BF}]/gu,
    ''
  );

export const removeRedundantPunctuation = (value: string): string =>
  value
    .replace(/[|•·]+/g, ' ')
    .replace(/[!?,;:]{2,}/g, ' ')
    .replace(/[()[\]{}]+/g, ' ')
    .replace(/\s*-\s*/g, ' - ');

export const toAsciiFold = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss');

export const cleanupDisplayText = (value: string | undefined | null): string => {
  const cleaned = collapseWhitespace(removeRedundantPunctuation(removeEmojis(value || '')));
  return cleaned.trim();
};

export const normalizeForMatching = (
  value: string | undefined | null,
  extraStopWords: string[] = []
): string => {
  const cleaned = cleanupDisplayText(value);
  if (!cleaned) {
    return '';
  }

  const stopWords = [...DEFAULT_STOP_WORDS, ...extraStopWords];
  const withoutAccents = toAsciiFold(cleaned.toLowerCase());
  const withoutStopWords = stopWords.reduce((accumulator, word) => {
    const normalizedWord = toAsciiFold(word.toLowerCase());
    return accumulator.replace(new RegExp(`\\b${normalizedWord}\\b`, 'gi'), ' ');
  }, withoutAccents);

  return collapseWhitespace(withoutStopWords.replace(/[^a-z0-9+/& -]+/g, ' ').replace(/[+/&-]+/g, ' '));
};

export const hasExcessiveNoise = (value: string | undefined | null): boolean => {
  const normalized = normalizeForMatching(value);
  if (!normalized) {
    return true;
  }

  return (
    /comprar|ticket|promo|apertura|puertas|aforo|anticipada|taquilla/.test(normalized) ||
    normalized.split(' ').length > 12
  );
};
