import { describe, expect, it } from 'vitest';

import {
  commitDocument,
  migrateDocument,
  undoDocument,
} from './document.ts';
import { createDocumentVersionDiff } from './versionDiff.ts';

const createDocument = () =>
  migrateDocument(
    {
      components: null,
      container_id: '0',
      coordinate: 'cartesian',
      coordinate_system: { x1: '0', x2: '100', y1: '0', y2: '100' },
      data_specification: null,
      description: 'original',
      if_leaf: true,
      legacy_note: 'remove me',
      mark_type: 'rectangle',
      template_data_specification: null,
    },
    {
      now: '2026-01-01T00:00:00.000Z',
      viewData: {
        cache: {
          anchor_point: {},
          link_nodes: {},
          non_property: {},
          size_range: {},
        },
        containers: {
          '0': {
            container_id: '0',
            if_leaf: true,
          },
        },
        marks: {
          '0': [{ id: '0__0' }],
        },
      },
    },
  );

describe('document version diff', () => {
  it('reconstructs the immediate previous version and reports semantic changes', () => {
    const initial = createDocument();
    const next = structuredClone(initial);
    next.description = 'updated';
    next.extra = { enabled: true };
    delete next.legacy_note;

    const committed = commitDocument(initial, next, {
      id: 'entry-1',
      now: '2026-01-02T00:00:00.000Z',
      source: 'form',
    });
    const result = createDocumentVersionDiff(committed.document);

    expect(result).toMatchObject({
      currentCursor: 1,
      previousCursor: 0,
      entry: { id: 'entry-1', source: 'form' },
    });
    expect(result?.changes).toEqual(
      expect.arrayContaining([
        {
          after: 'updated',
          before: 'original',
          operation: 'replace',
          path: '/description',
        },
        {
          after: { enabled: true },
          operation: 'add',
          path: '/extra',
        },
        {
          before: 'remove me',
          operation: 'remove',
          path: '/legacy_note',
        },
      ]),
    );
    expect(result?.changes.some(({ path }) => path.startsWith('/history'))).toBe(
      false,
    );
    expect(result?.changes).not.toContainEqual(
      expect.objectContaining({ path: '/metadata/updated_at' }),
    );
  });

  it('treats cursor zero as having no previous version, even with redo entries', () => {
    const initial = createDocument();
    const committed = commitDocument(
      initial,
      { ...initial, description: 'updated' },
      {
        now: '2026-01-02T00:00:00.000Z',
        source: 'json',
      },
    );
    const undone = undoDocument(committed.document, {
      now: '2026-01-03T00:00:00.000Z',
    });

    expect(undone.document.history.entries).toHaveLength(1);
    expect(undone.document.history.cursor).toBe(0);
    expect(createDocumentVersionDiff(undone.document)).toBeNull();
  });

  it('uses the entry immediately before an interior history cursor', () => {
    const initial = createDocument();
    const first = commitDocument(
      initial,
      { ...initial, description: 'first' },
      { id: 'entry-1', now: '2026-01-02T00:00:00.000Z', source: 'form' },
    );
    const second = commitDocument(
      first.document,
      { ...first.document, description: 'second' },
      { id: 'entry-2', now: '2026-01-03T00:00:00.000Z', source: 'json' },
    );
    const third = commitDocument(
      second.document,
      { ...second.document, description: 'third' },
      { id: 'entry-3', now: '2026-01-04T00:00:00.000Z', source: 'ai' },
    );
    const interior = undoDocument(third.document, {
      now: '2026-01-05T00:00:00.000Z',
    }).document;

    expect(interior.history).toMatchObject({ cursor: 2 });
    expect(interior.history.entries).toHaveLength(3);
    expect(createDocumentVersionDiff(interior)).toMatchObject({
      currentCursor: 2,
      previousCursor: 1,
      entry: { id: 'entry-2' },
      changes: expect.arrayContaining([
        {
          after: 'second',
          before: 'first',
          operation: 'replace',
          path: '/description',
        },
      ]),
    });
  });

  it('reads escaped object keys and removed array values from the previous JSON', () => {
    const initial = createDocument();
    initial.custom = {
      'a/b': 'old',
      items: ['zero', 'one'],
    };
    const next = structuredClone(initial);
    const custom = next.custom as {
      'a/b': string;
      items: string[];
    };
    custom['a/b'] = 'new';
    custom.items.pop();

    const committed = commitDocument(initial, next, {
      now: '2026-01-02T00:00:00.000Z',
      source: 'data-control',
    });
    expect(createDocumentVersionDiff(committed.document)?.changes).toEqual(
      expect.arrayContaining([
        {
          after: 'new',
          before: 'old',
          operation: 'replace',
          path: '/custom/a~1b',
        },
        {
          before: 'one',
          operation: 'remove',
          path: '/custom/items/1',
        },
      ]),
    );
  });

  it('fails closed when the previous version cannot be reconstructed', () => {
    const initial = createDocument();
    const committed = commitDocument(
      initial,
      { ...initial, description: 'updated' },
      {
        now: '2026-01-02T00:00:00.000Z',
        source: 'ai',
      },
    );
    committed.document.history.entries[0].inverse_patch = [
      { op: 'replace', path: '/missing', value: 'unavailable' },
    ];

    expect(() => createDocumentVersionDiff(committed.document)).toThrow(
      /does not exist/i,
    );
  });

  it('fails closed when an applicable inverse patch reconstructs invalid JSON DSL', () => {
    const initial = createDocument();
    const committed = commitDocument(
      initial,
      { ...initial, description: 'updated' },
      {
        now: '2026-01-02T00:00:00.000Z',
        source: 'ai',
      },
    );
    committed.document.history.entries[0].inverse_patch = [
      { op: 'replace', path: '/coordinate', value: 'invalid' },
    ];

    expect(() => createDocumentVersionDiff(committed.document)).toThrow(
      /coordinate must be/i,
    );
  });
});
