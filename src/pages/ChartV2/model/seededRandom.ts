export type RandomSeed = number | string;

export interface SeededRandom {
  /** Returns a value in the half-open interval [0, 1). */
  next: () => number;
  /** Returns a value in the half-open interval [min, max). */
  float: (min?: number, max?: number) => number;
  /** Returns an integer in the inclusive interval [min, max]. */
  integer: (min: number, max: number) => number;
  pick: <T>(values: readonly T[]) => T | undefined;
  shuffle: <T>(values: readonly T[]) => T[];
  /** Creates a deterministic independent stream derived from this seed. */
  fork: (namespace: RandomSeed) => SeededRandom;
  readonly seed: string;
}

export const SEEDED_RANDOM_ALGORITHM_VERSION = 'mulberry32-fnv1a-v1';

let fallbackSeedCounter = 0;

const normalizeSeed = (seed: RandomSeed): string => String(seed);

/**
 * FNV-1a over UTF-16 code units. Math.imul makes the result identical in every
 * modern JavaScript runtime.
 */
export const hashRandomSeed = (seed: RandomSeed): number => {
  const input = normalizeSeed(seed);
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

const assertFinite = (value: number, name: string) => {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number`);
  }
};

/**
 * Creates a small deterministic PRNG suitable for reproducible chart fixture
 * generation. It is not a cryptographic random-number generator.
 */
export const createSeededRandom = (seed: RandomSeed): SeededRandom => {
  const normalizedSeed = normalizeSeed(seed);
  let state = hashRandomSeed(normalizedSeed);

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };

  const float = (min = 0, max = 1) => {
    assertFinite(min, 'min');
    assertFinite(max, 'max');
    if (max < min) {
      throw new RangeError('max must be greater than or equal to min');
    }
    if (max === min) {
      return min;
    }
    return min + next() * (max - min);
  };

  const integer = (min: number, max: number) => {
    assertFinite(min, 'min');
    assertFinite(max, 'max');
    const lower = Math.ceil(min);
    const upper = Math.floor(max);
    if (upper < lower) {
      throw new RangeError('The inclusive integer range is empty');
    }
    return lower + Math.floor(next() * (upper - lower + 1));
  };

  const pick = <T>(values: readonly T[]): T | undefined =>
    values.length === 0 ? undefined : values[integer(0, values.length - 1)];

  const shuffle = <T>(values: readonly T[]): T[] => {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = integer(0, index);
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  };

  return {
    float,
    fork: (namespace) =>
      createSeededRandom(`${normalizedSeed}\u0000${normalizeSeed(namespace)}`),
    integer,
    next,
    pick,
    seed: normalizedSeed,
    shuffle,
  };
};

/**
 * Creates a persistent seed. Cryptographic APIs are preferred when present,
 * but determinism only depends on saving the returned string, not on how the
 * initial seed was produced.
 */
export const createGenerationSeed = (): string => {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) {
    return cryptoApi.randomUUID();
  }
  if (cryptoApi?.getRandomValues) {
    const values = new Uint32Array(4);
    cryptoApi.getRandomValues(values);
    return Array.from(values, (value) => value.toString(16).padStart(8, '0')).join('');
  }

  fallbackSeedCounter += 1;
  return `${Date.now().toString(36)}-${fallbackSeedCounter.toString(36)}`;
};
