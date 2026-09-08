import { describe, expect, it } from 'vitest';
import {
  applyJsonPatch,
  applyJsonPatchWithInverse,
  diffJson,
  getAffectedPaths,
  type JsonPatch,
} from './jsonPatch.ts';

describe('JSON Patch', () => {
  it('applies all RFC 6902 operations atomically and builds an inverse', () => {
    const original = {
      list: ['a', 'b'],
      nested: { count: 1 },
      removeMe: true,
    };
    const patch: JsonPatch = [
      { op: 'test', path: '/nested/count', value: 1 },
      { op: 'add', path: '/list/1', value: 'inserted' },
      { op: 'replace', path: '/nested/count', value: 2 },
      { op: 'copy', from: '/nested/count', path: '/copied' },
      { op: 'move', from: '/list/0', path: '/list/2' },
      { op: 'remove', path: '/removeMe' },
    ];

    const result = applyJsonPatchWithInverse(original, patch);
    expect(result.document).toEqual({
      copied: 2,
      list: ['inserted', 'b', 'a'],
      nested: { count: 2 },
    });
    expect(applyJsonPatch(result.document, result.inversePatch)).toEqual(original);
    expect(original.list).toEqual(['a', 'b']);
  });

  it('rejects unsafe JSON Pointers without polluting prototypes', () => {
    expect(() =>
      applyJsonPatch(
        {},
        [{ op: 'add', path: '/__proto__/polluted', value: true }],
      )).toThrow(/Unsafe JSON Pointer segment/);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('round-trips recursive object and array diffs deterministically', () => {
    const source = {
      ignored: { value: 1 },
      list: [{ id: 1 }, { id: 2 }, { id: 3 }],
      nested: { keep: true, remove: 'x' },
    };
    const target = {
      ignored: { value: 2 },
      list: [{ id: 1 }, { id: 20 }],
      nested: { added: null, keep: true },
    };
    const patch = diffJson(source, target, { ignoredPaths: ['/ignored'] });
    const applied = applyJsonPatch(source, patch);

    expect(applied).toEqual({ ...target, ignored: source.ignored });
    expect(getAffectedPaths(patch)).toEqual([
      '/list/1/id',
      '/list/2',
      '/nested/remove',
      '/nested/added',
    ]);
  });
});
