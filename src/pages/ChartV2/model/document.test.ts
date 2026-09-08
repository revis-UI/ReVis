import { describe, expect, it } from 'vitest';
import {
  commitDocument,
  commitDocumentPatch,
  DocumentValidationError,
  jumpToHistory,
  MAX_HISTORY_ENTRIES,
  migrateDocument,
  redoDocument,
  undoDocument,
  validateAIPatchPaths,
  validateDocument,
  type ChartDocument,
} from './document.ts';

const createLegacyDocument = () => ({
  components: null,
  container_id: '0',
  coordinate: 'cartesian',
  coordinate_system: { x1: '0', x2: '100', y1: '0', y2: '100' },
  data_specification: null,
  description: 'original',
  if_leaf: true,
  mark_type: 'rectangle',
  template_data_specification: null,
});

const createCompleteViewData = () => ({
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
    '0': [
      [{ id: '0__0' }],
      [[{ id: '0__1' }]],
    ],
  },
});

describe('enhanced chart document', () => {
  it('lazily migrates legacy DSL and identifies marks-only view data as incomplete', () => {
    const legacy = createLegacyDocument();
    const migrated = migrateDocument(
      legacy,
      { '0': [{ id: '0__0', x1: 0, x2: 1, y1: 0, y2: 1 }] },
    );

    expect(migrated.description).toBe('original');
    expect(migrated.view_data.marks).toEqual({
      '0': [{ id: '0__0', x1: 0, x2: 1, y1: 0, y2: 1 }],
    });
    expect(migrated.view_data.containers).toEqual({});
    expect(migrated.history).toEqual({ cursor: 0, entries: [] });
    expect(validateDocument(migrated)).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_reference',
          path: '/view_data/marks/0',
        }),
      ]),
    });
    expect('metadata' in legacy).toBe(false);
  });

  it('validates recursive mark arrays and cross-checks leaf containers', () => {
    const complete = migrateDocument(createLegacyDocument(), {
      viewData: createCompleteViewData(),
    });
    expect(validateDocument(complete).valid).toBe(true);

    const invalidMark = structuredClone(complete);
    invalidMark.view_data.marks['0'] = [
      [{ id: 'valid' }],
      [[{ id: '' }]],
      42,
    ];
    expect(validateDocument(invalidMark)).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_view_data',
          path: '/view_data/marks/0/1/0/0/id',
        }),
        expect.objectContaining({
          code: 'invalid_view_data',
          path: '/view_data/marks/0/2',
        }),
      ]),
    });

    const orphanMarks = structuredClone(complete);
    orphanMarks.view_data.marks.ghost = [{ id: 'ghost__0' }];
    expect(validateDocument(orphanMarks)).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_reference',
          path: '/view_data/marks/ghost',
        }),
      ]),
    });

    const missingMarks = structuredClone(complete);
    delete missingMarks.view_data.marks['0'];
    expect(validateDocument(missingMarks)).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_reference',
          path: '/view_data/containers/0',
        }),
      ]),
    });

    const nonLeafMarks = structuredClone(complete);
    nonLeafMarks.view_data.containers['0'].if_leaf = false;
    expect(validateDocument(nonLeafMarks)).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_reference',
          path: '/view_data/marks/0',
        }),
      ]),
    });
  });

  it('commits, undoes, redoes, jumps, and truncates a linear branch', () => {
    const initial = migrateDocument(createLegacyDocument(), {
      now: '2026-01-01T00:00:00.000Z',
      viewData: {},
    });
    const changed = { ...initial, description: 'first' };
    const firstCommit = commitDocument(initial, changed, {
      now: '2026-01-01T00:00:01.000Z',
      source: 'form',
    });

    expect(firstCommit.changed).toBe(true);
    expect(firstCommit.document.history.cursor).toBe(1);
    expect(firstCommit.entry?.affected_paths).toContain('/description');

    const undone = undoDocument(firstCommit.document, {
      now: '2026-01-01T00:00:02.000Z',
    });
    expect(undone.document.description).toBe('original');
    expect(undone.document.history.cursor).toBe(0);

    const redone = redoDocument(undone.document, {
      now: '2026-01-01T00:00:03.000Z',
    });
    expect(redone.document.description).toBe('first');
    expect(redone.document.history.cursor).toBe(1);

    const jumped = jumpToHistory(redone.document, 0);
    expect(jumped.document.description).toBe('original');

    const branched = commitDocument(
      jumped.document,
      { ...jumped.document, description: 'branch' },
      'json',
    );
    expect(branched.document.history.entries).toHaveLength(1);
    expect(branched.document.description).toBe('branch');
    expect(redoDocument(branched.document).changed).toBe(false);
  });

  it('keeps only the latest twenty reversible entries', () => {
    let document: ChartDocument = migrateDocument(createLegacyDocument());
    for (let index = 0; index < MAX_HISTORY_ENTRIES + 3; index += 1) {
      document = commitDocument(
        document,
        { ...document, description: `change-${index}` },
        { id: `entry-${index}`, source: 'form' },
      ).document;
    }

    expect(document.history.entries).toHaveLength(MAX_HISTORY_ENTRIES);
    expect(document.history.cursor).toBe(MAX_HISTORY_ENTRIES);
    expect(document.history.entries[0].id).toBe('entry-3');
  });

  it('rejects malformed persisted history instead of silently dropping it', () => {
    const initial = migrateDocument(createLegacyDocument(), {
      now: '2026-01-01T00:00:00.000Z',
    });
    const first = commitDocument(
      initial,
      { ...initial, description: 'first' },
      {
        id: 'first-entry',
        now: '2026-01-01T00:00:01.000Z',
        source: 'form',
      },
    ).document;
    const second = commitDocument(
      first,
      { ...first, description: 'second' },
      {
        id: 'second-entry',
        now: '2026-01-01T00:00:02.000Z',
        source: 'form',
      },
    ).document;

    const invalidCursor = structuredClone(second);
    invalidCursor.history.cursor = 99;
    expect(() => migrateDocument(invalidCursor)).toThrowError(
      DocumentValidationError,
    );
    expect(() => migrateDocument(invalidCursor)).toThrow(
      /\/history\/cursor/,
    );

    const invalidAppliedEntry = structuredClone(second);
    invalidAppliedEntry.history.entries[0].forward_patch = [
      { op: 'remove', path: '/history' },
    ];
    expect(() => migrateDocument(invalidAppliedEntry)).toThrow(
      /\/history\/entries\/0/,
    );

    const invalidRedoEntry = structuredClone(second);
    invalidRedoEntry.history.cursor = 1;
    invalidRedoEntry.history.entries[1].inverse_patch = [
      { op: 'remove', path: '/history' },
    ];
    expect(() => migrateDocument(invalidRedoEntry)).toThrow(
      /\/history\/entries\/1/,
    );

    const invalidSource = structuredClone(second);
    invalidSource.history.entries[0].source = 'undo' as 'form';
    expect(() => migrateDocument(invalidSource)).toThrow(
      /\/history\/entries\/0/,
    );

    const explicitInvalidHistory = {
      ...createLegacyDocument(),
      history: null,
    };
    expect(() => migrateDocument(explicitInvalidHistory)).toThrow(
      /\/history/,
    );

    const legacyWithoutHistory = migrateDocument(createLegacyDocument());
    expect(legacyWithoutHistory.history).toEqual({ cursor: 0, entries: [] });
  });

  it('validates all entries before trimming oversized legal history', () => {
    const initial = migrateDocument(createLegacyDocument());
    const committed = commitDocument(
      initial,
      { ...initial, description: 'changed' },
      {
        id: 'template-entry',
        source: 'form',
      },
    );
    const templateEntry = committed.entry!;
    const entries = Array.from(
      { length: MAX_HISTORY_ENTRIES + 3 },
      (_, index) => ({
        ...structuredClone(templateEntry),
        id: `oversized-${index}`,
      }),
    );
    const migrated = migrateDocument({
      ...committed.document,
      history: {
        cursor: entries.length,
        entries,
      },
    });

    expect(migrated.history.entries).toHaveLength(MAX_HISTORY_ENTRIES);
    expect(migrated.history.cursor).toBe(MAX_HISTORY_ENTRIES);
    expect(migrated.history.entries[0].id).toBe('oversized-3');

    const invalidBeforeTrim = {
      ...committed.document,
      history: {
        cursor: entries.length,
        entries: entries.map((entry, index) =>
          index === 0
            ? { ...entry, forward_patch: [{ op: 'remove', path: '/history' }] }
            : entry,
        ),
      },
    };
    expect(() => migrateDocument(invalidBeforeTrim)).toThrow(
      /\/history\/entries\/0/,
    );
  });

  it('allows AI patches to edit DSL and view data but not history or versions', () => {
    expect(validateAIPatchPaths([
      { op: 'replace', path: '/description', value: 'changed' },
      { op: 'add', path: '/view_data/marks/0', value: [] },
    ]).valid).toBe(true);
    expect(validateAIPatchPaths([
      { op: 'replace', path: '/metadata/schema_version', value: '999' },
    ]).valid).toBe(false);
    expect(validateAIPatchPaths([
      { op: 'remove', path: '/history/entries/0' },
    ]).valid).toBe(false);
  });

  it('validates the isolated AI candidate before recording history', () => {
    const document = migrateDocument(createLegacyDocument());
    const result = commitDocumentPatch(
      document,
      [{ op: 'replace', path: '/description', value: 'semantic change' }],
      { source: 'ai' },
    );

    expect(result.document.description).toBe('semantic change');
    expect(result.document.history.entries[0].source).toBe('ai');
    expect(() =>
      commitDocumentPatch(
        result.document,
        [{ op: 'replace', path: '/if_leaf', value: 'not boolean' }],
        { source: 'ai' },
      )).toThrow(/if_leaf/);
  });
});
