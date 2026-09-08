import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { VisualChart } from './Chart';
import { migrateDocument, validateDocument } from './document';
import { createSeededRandom } from './seededRandom';

const fixtureDirectories = [
  'src/datav3/basic_charts',
  'src/datav3/composite',
];

const fixtures = fixtureDirectories.flatMap((directory) =>
  readdirSync(resolve(process.cwd(), directory))
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({
      file: `${directory}/${file}`,
      raw: JSON.parse(
        readFileSync(resolve(process.cwd(), directory, file), 'utf8'),
      ) as object,
    })),
);

describe('canonical DSL fixtures', () => {
  it.each(fixtures)('$file generates a valid authoritative view snapshot', ({
    file,
    raw,
  }) => {
    const chart = new VisualChart();
    const seed = `fixture:${file}`;
    chart.setRandomGenerator(createSeededRandom(seed).next);
    chart.parseDSL(raw);

    const enhanced = migrateDocument(raw, {
      generationSeed: seed,
      now: '2026-01-01T00:00:00.000Z',
      viewData: chart.createViewSnapshot() as unknown as Record<string, unknown>,
    });
    const validation = validateDocument(enhanced, {
      requireEnhancedFields: true,
      validateReferences: true,
    });

    expect(validation.issues).toEqual([]);
    expect(validation.valid).toBe(true);
  });
});
