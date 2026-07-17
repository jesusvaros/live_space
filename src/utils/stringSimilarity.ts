const buildBigrams = (value: string): Map<string, number> => {
  const bigrams = new Map<string, number>();
  for (let index = 0; index < value.length - 1; index += 1) {
    const pair = value.slice(index, index + 2);
    bigrams.set(pair, (bigrams.get(pair) || 0) + 1);
  }
  return bigrams;
};

export const stringSimilarity = (left: string, right: string): number => {
  if (!left || !right) {
    return 0;
  }

  if (left === right) {
    return 1;
  }

  if (left.length < 2 || right.length < 2) {
    return 0;
  }

  const leftBigrams = buildBigrams(left);
  const rightBigrams = buildBigrams(right);
  let intersection = 0;

  for (const [pair, leftCount] of leftBigrams.entries()) {
    const rightCount = rightBigrams.get(pair) || 0;
    intersection += Math.min(leftCount, rightCount);
  }

  return (2 * intersection) / (left.length + right.length - 2);
};
