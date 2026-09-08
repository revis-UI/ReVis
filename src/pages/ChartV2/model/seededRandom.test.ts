import { describe, expect, it } from 'vitest';
import { createSeededRandom } from './seededRandom.ts';

describe('seeded random', () => {
  it('produces the same values for the same seed', () => {
    const first = createSeededRandom('chart-1');
    const second = createSeededRandom('chart-1');

    expect(Array.from({ length: 10 }, () => first.integer(0, 100))).toEqual(
      Array.from({ length: 10 }, () => second.integer(0, 100)),
    );
  });

  it('forks and shuffles deterministically without mutating input', () => {
    const values = [1, 2, 3, 4, 5];
    const first = createSeededRandom('root').fork('marks').shuffle(values);
    const second = createSeededRandom('root').fork('marks').shuffle(values);

    expect(first).toEqual(second);
    expect(values).toEqual([1, 2, 3, 4, 5]);
  });
});
