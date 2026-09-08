import {
  applyJsonPatch,
  cloneJson,
  diffJson,
  parseJsonPointer,
  type JsonValue,
} from './jsonPatch.ts';
import {
  assertValidDocument,
  type ChartDocument,
  type DocumentChangeSource,
} from './document.ts';

export type VersionDiffOperation = 'add' | 'remove' | 'replace';

export interface VersionDiffChange {
  after?: JsonValue;
  before?: JsonValue;
  operation: VersionDiffOperation;
  path: string;
}

export interface DocumentVersionDiff {
  changes: VersionDiffChange[];
  currentCursor: number;
  entry: {
    affectedPaths: string[];
    id: string;
    source: DocumentChangeSource;
    timestamp: string;
  };
  previousCursor: number;
}

const hasOwn = (value: object, key: PropertyKey) =>
  Object.prototype.hasOwnProperty.call(value, key);

const readJsonPointer = (
  document: Record<string, JsonValue>,
  pointer: string,
): JsonValue | undefined => {
  let current: unknown = document;
  for (const segment of parseJsonPointer(pointer)) {
    if (Array.isArray(current)) {
      if (!/^(0|[1-9]\d*)$/.test(segment)) {
        return undefined;
      }
      const index = Number(segment);
      if (index >= current.length) {
        return undefined;
      }
      current = current[index];
      continue;
    }

    if (
      typeof current !== 'object'
      || current === null
      || !hasOwn(current, segment)
    ) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current as JsonValue;
};

const createSemanticSnapshot = (
  document: ChartDocument,
): Record<string, JsonValue> => {
  const snapshot: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(document)) {
    if (key === 'history') {
      continue;
    }
    Object.defineProperty(snapshot, key, {
      configurable: true,
      enumerable: true,
      value: cloneJson(value) as JsonValue,
      writable: true,
    });
  }
  return snapshot;
};

/**
 * Compares the current history position with its immediate linear parent.
 * Persisted history and timestamp bookkeeping are omitted from the semantic
 * diff. Reconstructing the parent never mutates or persists the editor state.
 */
export const createDocumentVersionDiff = (
  input: ChartDocument | null | undefined,
): DocumentVersionDiff | null => {
  if (!input || input.history.cursor === 0) {
    return null;
  }

  assertValidDocument(input);
  const currentCursor = input.history.cursor;
  const entry = input.history.entries[currentCursor - 1];
  if (!entry) {
    return null;
  }

  const currentSnapshot = createSemanticSnapshot(input);
  const previousSnapshot = applyJsonPatch(
    currentSnapshot,
    entry.inverse_patch,
  );
  const previousDocument = {
    ...previousSnapshot,
    history: {
      cursor: currentCursor - 1,
      entries: input.history.entries,
    },
  };
  assertValidDocument(previousDocument);

  const patch = diffJson(previousSnapshot, currentSnapshot, {
    ignoredPaths: ['/metadata/updated_at'],
  });
  const changes = patch.map<VersionDiffChange>((operation) => {
    if (operation.op === 'add') {
      return {
        after: operation.value,
        operation: 'add',
        path: operation.path,
      };
    }
    if (operation.op === 'remove') {
      return {
        before: readJsonPointer(previousSnapshot, operation.path),
        operation: 'remove',
        path: operation.path,
      };
    }
    if (operation.op === 'replace') {
      return {
        after: operation.value,
        before: readJsonPointer(previousSnapshot, operation.path),
        operation: 'replace',
        path: operation.path,
      };
    }

    throw new Error(`Unexpected ${operation.op} operation in a JSON diff`);
  });

  return {
    changes,
    currentCursor,
    entry: {
      affectedPaths: [...entry.affected_paths],
      id: entry.id,
      source: entry.source,
      timestamp: entry.timestamp,
    },
    previousCursor: currentCursor - 1,
  };
};
