export function makeSeededRng(seed: string): () => number {
  let h = 0x811c9dc5;
  for (let index = 0; index < seed.length; index++) {
    h ^= seed.charCodeAt(index);
    h = Math.imul(h, 0x01000193);
  }
  let state = h >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value =
      (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(
  values: readonly T[],
  rng: () => number,
): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const target = Math.floor(rng() * (index + 1));
    [result[index], result[target]] = [result[target]!, result[index]!];
  }
  return result;
}
