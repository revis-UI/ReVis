import { describe, expect, it } from 'vitest';

import { createAIChangeSummary } from './changeSummary';
import type { DocumentHistoryEntry } from './document';

const createEntry = (
  forwardPatch: DocumentHistoryEntry['forward_patch'],
): DocumentHistoryEntry => ({
  affected_paths: [],
  forward_patch: forwardPatch,
  id: 'history-ai-1',
  inverse_patch: [],
  source: 'ai',
  timestamp: '2026-08-01T10:00:00.000Z',
});

describe('AI change summary', () => {
  it('summarizes the final saved operations by kind and document scope', () => {
    const summary = createAIChangeSummary(createEntry([
      { op: 'replace', path: '/description', value: 'Updated chart' },
      { op: 'add', path: '/view_data/marks/label', value: { x: 12 } },
      { op: 'remove', path: '/view_data/cache/obsolete' },
      {
        op: 'replace',
        path: '/metadata/updated_at',
        value: '2026-08-01T10:00:00.000Z',
      },
    ]));

    expect(summary).toEqual({
      counts: { added: 1, changed: 1, removed: 1 },
      entryId: 'history-ai-1',
      items: [
        { operation: 'changed', path: '/description' },
        { operation: 'added', path: '/view_data/marks/label' },
        { operation: 'removed', path: '/view_data/cache/obsolete' },
      ],
      scopes: { dsl: 1, viewData: 2 },
      semantic: {
        title: 'Updated chart definition and view data',
        overview:
          'The validated update changes the chart DSL and synchronizes its persisted view data.',
        changes: [
          { area: 'dsl', description: 'Updated the chart description.' },
          { area: 'viewData', description: 'Added the persisted mark data.' },
          {
            area: 'viewData',
            description: 'Removed the persisted rendering cache.',
          },
        ],
      },
      timestamp: '2026-08-01T10:00:00.000Z',
      total: 3,
    });
  });

  it('ignores bookkeeping and test operations without reading patch values', () => {
    const value = Object.defineProperty({}, 'secret', {
      enumerable: true,
      get: () => {
        throw new Error('Patch values must not be read');
      },
    });
    const summary = createAIChangeSummary(createEntry([
      { op: 'test', path: '/description', value: 'Before' },
      { op: 'replace', path: '/history', value: {} },
      { op: 'add', path: '/metadata/updated_at/value', value: 'ignored' },
      { op: 'add', path: '/title', value },
    ]));

    expect(summary.items).toEqual([
      { operation: 'added', path: '/title' },
    ]);
    expect(summary.total).toBe(1);
  });

  it('keeps counts complete while bounding representative paths', () => {
    const summary = createAIChangeSummary(createEntry(
      Array.from({ length: 8 }, (_, index) => ({
        op: 'replace' as const,
        path: `/specification/${index}`,
        value: index,
      })),
    ));

    expect(summary.total).toBe(8);
    expect(summary.counts.changed).toBe(8);
    expect(summary.scopes.dsl).toBe(8);
    expect(summary.items).toHaveLength(5);
    expect(summary.items.at(-1)?.path).toBe('/specification/4');
  });

  it('uses a valid model summary while keeping saved Patch facts authoritative', () => {
    const summary = createAIChangeSummary(
      createEntry([
        { op: 'replace', path: '/description', value: 'Updated chart' },
        { op: 'add', path: '/view_data/marks/label', value: { x: 12 } },
      ]),
      {
        title: '  Made labels easier to read  ',
        overview: 'Improved\nspacing and\u0000 contrast.',
        changes: [
          { area: 'dsl', description: '  Clarified the chart wording.  ' },
          { area: 'viewData', description: 'Aligned the rendered labels.' },
        ],
      },
    );

    expect(summary.semantic).toEqual({
      title: 'Made labels easier to read',
      overview: 'Improved spacing and contrast.',
      changes: [
        { area: 'dsl', description: 'Clarified the chart wording.' },
        { area: 'viewData', description: 'Aligned the rendered labels.' },
      ],
    });
    expect(summary.counts).toEqual({ added: 1, changed: 1, removed: 0 });
    expect(summary.scopes).toEqual({ dsl: 1, viewData: 1 });
    expect(summary.total).toBe(2);
  });

  it('falls back when model areas omit or invent a canonical saved scope', () => {
    const missingViewData = createAIChangeSummary(
      createEntry([
        { op: 'replace', path: '/description', value: 'Updated chart' },
        { op: 'add', path: '/view_data/marks/label', value: { x: 12 } },
      ]),
      {
        title: 'Model omitted the view-data scope',
        overview: 'This model explanation only covers the DSL.',
        changes: [
          { area: 'dsl', description: 'Updated the chart wording.' },
        ],
      },
    );

    expect(missingViewData.semantic).toEqual({
      title: 'Updated chart definition and view data',
      overview:
        'The validated update changes the chart DSL and synchronizes its persisted view data.',
      changes: [
        { area: 'dsl', description: 'Updated the chart description.' },
        { area: 'viewData', description: 'Added the persisted mark data.' },
      ],
    });

    const inventedViewData = createAIChangeSummary(
      createEntry([
        { op: 'replace', path: '/description', value: 'Updated chart' },
      ]),
      {
        title: 'Model invented a view-data scope',
        overview: 'This explanation claims a scope that was not saved.',
        changes: [
          { area: 'dsl', description: 'Updated the chart wording.' },
          { area: 'viewData', description: 'Changed rendered marks.' },
        ],
      },
    );

    expect(inventedViewData.semantic).toEqual({
      title: 'Updated chart definition',
      overview: 'The validated update changes the chart DSL.',
      changes: [
        { area: 'dsl', description: 'Updated the chart description.' },
      ],
    });
  });

  it('bounds semantic text and falls back when no valid model change remains', () => {
    const entry = createEntry([
      { op: 'replace', path: '/title', value: 'Updated title' },
    ]);
    const bounded = createAIChangeSummary(entry, {
      title: `Title ${'x'.repeat(200)}`,
      overview: `Overview ${'y'.repeat(700)}`,
      changes: Array.from({ length: 8 }, (_, index) => ({
        area: 'dsl',
        description: `Change ${index} ${'z'.repeat(260)}`,
      })),
    });

    expect(bounded.semantic.title).toHaveLength(120);
    expect(bounded.semantic.overview).toHaveLength(600);
    expect(bounded.semantic.changes).toHaveLength(6);
    expect(bounded.semantic.changes[0]?.description).toHaveLength(240);

    const fallback = createAIChangeSummary(entry, {
      title: 'Model title',
      overview: 'Model overview',
      changes: [{ area: 'other', description: 'Not a valid area' }],
    });
    expect(fallback.semantic).toEqual({
      title: 'Updated chart definition',
      overview: 'The validated update changes the chart DSL.',
      changes: [
        { area: 'dsl', description: 'Updated the chart title.' },
      ],
    });
  });
});
