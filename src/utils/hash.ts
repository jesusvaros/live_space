import { createHash } from 'node:crypto';

const normalizeValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = normalizeValue((value as Record<string, unknown>)[key]);
        return accumulator;
      }, {});
  }

  return value;
};

export const createDeterministicHash = (value: unknown): string => {
  const stableValue = JSON.stringify(normalizeValue(value));
  return createHash('sha256').update(stableValue).digest('hex');
};
