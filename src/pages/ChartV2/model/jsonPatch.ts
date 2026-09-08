export type JsonPrimitive = null | boolean | number | string;

export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}

export interface AddOperation {
  op: 'add';
  path: string;
  value: JsonValue;
}

export interface RemoveOperation {
  op: 'remove';
  path: string;
}

export interface ReplaceOperation {
  op: 'replace';
  path: string;
  value: JsonValue;
}

export interface MoveOperation {
  op: 'move';
  from: string;
  path: string;
}

export interface CopyOperation {
  op: 'copy';
  from: string;
  path: string;
}

export interface TestOperation {
  op: 'test';
  path: string;
  value: JsonValue;
}

export type JsonPatchOperation =
  | AddOperation
  | RemoveOperation
  | ReplaceOperation
  | MoveOperation
  | CopyOperation
  | TestOperation;

export type JsonPatch = JsonPatchOperation[];

export interface JsonPatchValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ApplyJsonPatchResult<T> {
  document: T;
  inversePatch: JsonPatch;
  affectedPaths: string[];
}

export interface DiffJsonOptions {
  /**
   * JSON Pointer paths that must not be represented in the patch. Descendants
   * of an ignored path are ignored as well.
   */
  ignoredPaths?: readonly string[];
}

const BLOCKED_POINTER_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);
const ARRAY_INDEX_PATTERN = /^(0|[1-9]\d*)$/;
const hasOwn = (value: object, key: PropertyKey) =>
  Object.prototype.hasOwnProperty.call(value, key);

export class JsonPatchError extends Error {
  readonly operationIndex?: number;
  readonly path?: string;
  readonly cause?: unknown;

  constructor(
    message: string,
    options: { operationIndex?: number; path?: string; cause?: unknown } = {},
  ) {
    super(message);
    this.name = 'JsonPatchError';
    this.operationIndex = options.operationIndex;
    this.path = options.path;
    this.cause = options.cause;
  }
}

const isObjectLike = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function assertJsonValue(value: unknown, path = ''): asserts value is JsonValue {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
  ) {
    return;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new JsonPatchError(`Non-finite number at ${path || '<root>'}`);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonValue(item, `${path}/${index}`));
    return;
  }

  if (isObjectLike(value)) {
    for (const [key, item] of Object.entries(value)) {
      assertJsonValue(item, `${path}/${escapeJsonPointerSegment(key)}`);
    }
    return;
  }

  throw new JsonPatchError(`Non-JSON value at ${path || '<root>'}`);
}

/**
 * Deep-clones JSON data without using property assignment for user-controlled
 * keys. This keeps a literal "__proto__" data property inert.
 */
export const cloneJson = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((item) => cloneJson(item)) as T;
  }

  if (isObjectLike(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: true,
        value: cloneJson(item),
        writable: true,
      });
    }
    return result as T;
  }

  return value;
};

export const escapeJsonPointerSegment = (segment: string): string =>
  segment.replace(/~/g, '~0').replace(/\//g, '~1');

export const formatJsonPointer = (segments: readonly string[]): string =>
  segments.length === 0
    ? ''
    : `/${segments.map(escapeJsonPointerSegment).join('/')}`;

const decodeJsonPointerSegment = (segment: string, pointer: string): string => {
  if (/~(?:[^01]|$)/.test(segment)) {
    throw new JsonPatchError(`Invalid escape sequence in JSON Pointer "${pointer}"`, {
      path: pointer,
    });
  }

  const decoded = segment.replace(/~1/g, '/').replace(/~0/g, '~');
  if (BLOCKED_POINTER_SEGMENTS.has(decoded)) {
    throw new JsonPatchError(
      `Unsafe JSON Pointer segment "${decoded}" in "${pointer}"`,
      { path: pointer },
    );
  }
  return decoded;
};

/**
 * Parses an RFC 6901 JSON Pointer and rejects prototype-sensitive segments.
 */
export const parseJsonPointer = (pointer: string): string[] => {
  if (typeof pointer !== 'string') {
    throw new JsonPatchError('JSON Pointer must be a string');
  }
  if (pointer === '') {
    return [];
  }
  if (!pointer.startsWith('/')) {
    throw new JsonPatchError(`JSON Pointer must start with "/": "${pointer}"`, {
      path: pointer,
    });
  }

  return pointer
    .slice(1)
    .split('/')
    .map((segment) => decodeJsonPointerSegment(segment, pointer));
};

const parseArrayIndex = (
  segment: string,
  length: number,
  options: { allowAppend: boolean; allowEnd: boolean },
): number => {
  if (segment === '-') {
    if (options.allowAppend) {
      return length;
    }
    throw new JsonPatchError('The "-" array index is only valid for add operations');
  }
  if (!ARRAY_INDEX_PATTERN.test(segment)) {
    throw new JsonPatchError(`Invalid array index "${segment}"`);
  }

  const index = Number(segment);
  const maximum = options.allowEnd ? length : length - 1;
  if (!Number.isSafeInteger(index) || index < 0 || index > maximum) {
    throw new JsonPatchError(`Array index ${segment} is out of bounds`);
  }
  return index;
};

interface ResolvedParent {
  parent: unknown[] | Record<string, unknown>;
  key: string;
}

const resolveParent = (document: unknown, segments: readonly string[]): ResolvedParent => {
  if (segments.length === 0) {
    throw new JsonPatchError('The document root has no parent');
  }

  let current: unknown = document;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    if (Array.isArray(current)) {
      const arrayIndex = parseArrayIndex(segment, current.length, {
        allowAppend: false,
        allowEnd: false,
      });
      current = current[arrayIndex];
      continue;
    }

    if (isObjectLike(current)) {
      if (!hasOwn(current, segment)) {
        throw new JsonPatchError(
          `JSON Pointer does not exist at "${formatJsonPointer(segments.slice(0, index + 1))}"`,
        );
      }
      current = current[segment];
      continue;
    }

    throw new JsonPatchError(
      `Cannot traverse non-container value at "${formatJsonPointer(segments.slice(0, index))}"`,
    );
  }

  if (!Array.isArray(current) && !isObjectLike(current)) {
    throw new JsonPatchError(
      `JSON Pointer parent is not an object or array at "${formatJsonPointer(segments.slice(0, -1))}"`,
    );
  }

  return {
    parent: current,
    key: segments[segments.length - 1],
  };
};

const readAtSegments = (document: unknown, segments: readonly string[]): unknown => {
  let current = document;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (Array.isArray(current)) {
      const arrayIndex = parseArrayIndex(segment, current.length, {
        allowAppend: false,
        allowEnd: false,
      });
      current = current[arrayIndex];
      continue;
    }

    if (isObjectLike(current)) {
      if (!hasOwn(current, segment)) {
        throw new JsonPatchError(
          `JSON Pointer does not exist at "${formatJsonPointer(segments.slice(0, index + 1))}"`,
        );
      }
      current = current[segment];
      continue;
    }

    throw new JsonPatchError(
      `Cannot traverse non-container value at "${formatJsonPointer(segments.slice(0, index))}"`,
    );
  }
  return current;
};

export const getValueAtJsonPointer = (document: unknown, pointer: string): unknown =>
  readAtSegments(document, parseJsonPointer(pointer));

const defineObjectProperty = (
  object: Record<string, unknown>,
  key: string,
  value: unknown,
) => {
  Object.defineProperty(object, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
};

const addAtSegments = (
  document: unknown,
  segments: readonly string[],
  value: unknown,
): unknown => {
  if (segments.length === 0) {
    return cloneJson(value);
  }

  const { parent, key } = resolveParent(document, segments);
  if (Array.isArray(parent)) {
    const index = parseArrayIndex(key, parent.length, {
      allowAppend: true,
      allowEnd: true,
    });
    parent.splice(index, 0, cloneJson(value));
  } else {
    defineObjectProperty(parent, key, cloneJson(value));
  }
  return document;
};

const removeAtSegments = (
  document: unknown,
  segments: readonly string[],
): { document: unknown; removed: unknown } => {
  if (segments.length === 0) {
    throw new JsonPatchError('Removing the document root is not supported');
  }

  const { parent, key } = resolveParent(document, segments);
  if (Array.isArray(parent)) {
    const index = parseArrayIndex(key, parent.length, {
      allowAppend: false,
      allowEnd: false,
    });
    const [removed] = parent.splice(index, 1);
    return { document, removed };
  }

  if (!hasOwn(parent, key)) {
    throw new JsonPatchError(`JSON Pointer does not exist at "${formatJsonPointer(segments)}"`);
  }
  const removed = parent[key];
  delete parent[key];
  return { document, removed };
};

const replaceAtSegments = (
  document: unknown,
  segments: readonly string[],
  value: unknown,
): unknown => {
  if (segments.length === 0) {
    return cloneJson(value);
  }

  const { parent, key } = resolveParent(document, segments);
  if (Array.isArray(parent)) {
    const index = parseArrayIndex(key, parent.length, {
      allowAppend: false,
      allowEnd: false,
    });
    parent[index] = cloneJson(value);
  } else {
    if (!hasOwn(parent, key)) {
      throw new JsonPatchError(`JSON Pointer does not exist at "${formatJsonPointer(segments)}"`);
    }
    defineObjectProperty(parent, key, cloneJson(value));
  }
  return document;
};

const isPrefix = (prefix: readonly string[], value: readonly string[]) =>
  prefix.length <= value.length
  && prefix.every((segment, index) => segment === value[index]);

const applyOperation = (document: unknown, operation: JsonPatchOperation): unknown => {
  const pathSegments = parseJsonPointer(operation.path);

  switch (operation.op) {
    case 'add':
      return addAtSegments(document, pathSegments, operation.value);
    case 'remove':
      return removeAtSegments(document, pathSegments).document;
    case 'replace':
      return replaceAtSegments(document, pathSegments, operation.value);
    case 'copy': {
      const fromSegments = parseJsonPointer(operation.from);
      const value = readAtSegments(document, fromSegments);
      return addAtSegments(document, pathSegments, value);
    }
    case 'move': {
      const fromSegments = parseJsonPointer(operation.from);
      if (
        fromSegments.length === pathSegments.length
        && isPrefix(fromSegments, pathSegments)
      ) {
        return document;
      }
      if (fromSegments.length === 0) {
        throw new JsonPatchError('Moving the document root is not supported');
      }
      if (isPrefix(fromSegments, pathSegments)) {
        throw new JsonPatchError('A value cannot be moved into one of its descendants');
      }
      const removed = removeAtSegments(document, fromSegments);
      return addAtSegments(removed.document, pathSegments, removed.removed);
    }
    case 'test': {
      const actual = readAtSegments(document, pathSegments);
      if (!jsonDeepEqual(actual, operation.value)) {
        throw new JsonPatchError(`Test operation failed at "${operation.path}"`, {
          path: operation.path,
        });
      }
      return document;
    }
  }
};

function assertOperation(
  value: unknown,
  index: number,
): asserts value is JsonPatchOperation {
  if (!isObjectLike(value) || typeof value.op !== 'string' || typeof value.path !== 'string') {
    throw new JsonPatchError(`Patch operation ${index} must contain string "op" and "path"`);
  }

  parseJsonPointer(value.path);
  switch (value.op) {
    case 'add':
    case 'replace':
    case 'test':
      if (!hasOwn(value, 'value')) {
        throw new JsonPatchError(`Patch operation ${index} is missing "value"`);
      }
      assertJsonValue(value.value, value.path);
      return;
    case 'remove':
      return;
    case 'move':
    case 'copy':
      if (typeof value.from !== 'string') {
        throw new JsonPatchError(`Patch operation ${index} is missing string "from"`);
      }
      parseJsonPointer(value.from);
      return;
    default:
      throw new JsonPatchError(`Unsupported JSON Patch operation "${value.op}"`);
  }
}

export function assertJsonPatch(value: unknown): asserts value is JsonPatch {
  if (!Array.isArray(value)) {
    throw new JsonPatchError('A JSON Patch document must be an array');
  }
  value.forEach((operation, index) => assertOperation(operation, index));
}

export const validateJsonPatch = (value: unknown): JsonPatchValidationResult => {
  try {
    assertJsonPatch(value);
    return { valid: true, errors: [] };
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
};

export const applyJsonPatch = <T>(document: T, patch: JsonPatch): T => {
  assertJsonPatch(patch);
  let result: unknown = cloneJson(document);

  patch.forEach((operation, operationIndex) => {
    try {
      result = applyOperation(result, operation);
    } catch (error) {
      if (error instanceof JsonPatchError && error.operationIndex !== undefined) {
        throw error;
      }
      throw new JsonPatchError(
        `JSON Patch operation ${operationIndex} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        {
          cause: error,
          operationIndex,
          path: operation.path,
        },
      );
    }
  });

  return result as T;
};

export const applyJsonPatchWithInverse = <T>(
  document: T,
  patch: JsonPatch,
): ApplyJsonPatchResult<T> => {
  const result = applyJsonPatch(document, patch);
  return {
    affectedPaths: getAffectedPaths(patch),
    document: result,
    inversePatch: diffJson(result, document),
  };
};

export const jsonDeepEqual = (left: unknown, right: unknown): boolean => {
  if (left === right) {
    return true;
  }
  if (typeof left !== typeof right || left === null || right === null) {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((item, index) => jsonDeepEqual(item, right[index]));
  }
  if (!isObjectLike(left) || !isObjectLike(right)) {
    return false;
  }

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length
    && leftKeys.every(
      (key) => hasOwn(right, key) && jsonDeepEqual(left[key], right[key]),
    );
};

const normalizeIgnoredPaths = (paths: readonly string[] | undefined): string[] =>
  (paths ?? []).map((path) => formatJsonPointer(parseJsonPointer(path)));

const isIgnoredPath = (path: string, ignoredPaths: readonly string[]) =>
  ignoredPaths.some(
    (ignoredPath) =>
      ignoredPath === ''
      || path === ignoredPath
      || path.startsWith(`${ignoredPath}/`),
  );

/**
 * Produces a deterministic recursive patch. Array items are compared by index;
 * insertions in the middle may therefore become replacements plus an append,
 * favoring predictable behavior over heuristic identity matching.
 */
export const diffJson = (
  source: unknown,
  target: unknown,
  options: DiffJsonOptions = {},
): JsonPatch => {
  const ignoredPaths = normalizeIgnoredPaths(options.ignoredPaths);
  const patch: JsonPatch = [];

  const visit = (before: unknown, after: unknown, path: string) => {
    if (isIgnoredPath(path, ignoredPaths) || jsonDeepEqual(before, after)) {
      return;
    }

    if (Array.isArray(before) && Array.isArray(after)) {
      const sharedLength = Math.min(before.length, after.length);
      for (let index = 0; index < sharedLength; index += 1) {
        visit(before[index], after[index], `${path}/${index}`);
      }
      for (let index = before.length - 1; index >= after.length; index -= 1) {
        patch.push({ op: 'remove', path: `${path}/${index}` });
      }
      for (let index = before.length; index < after.length; index += 1) {
        patch.push({
          op: 'add',
          path: `${path}/${index}`,
          value: cloneJson(after[index]) as JsonValue,
        });
      }
      return;
    }

    if (isObjectLike(before) && isObjectLike(after)) {
      const beforeKeys = Object.keys(before).sort();
      const afterKeys = Object.keys(after).sort();
      const afterKeySet = new Set(afterKeys);
      const beforeKeySet = new Set(beforeKeys);

      for (const key of beforeKeys) {
        const childPath = `${path}/${escapeJsonPointerSegment(key)}`;
        if (!afterKeySet.has(key) && !isIgnoredPath(childPath, ignoredPaths)) {
          patch.push({ op: 'remove', path: childPath });
        }
      }
      for (const key of afterKeys) {
        const childPath = `${path}/${escapeJsonPointerSegment(key)}`;
        if (!beforeKeySet.has(key) && !isIgnoredPath(childPath, ignoredPaths)) {
          patch.push({
            op: 'add',
            path: childPath,
            value: cloneJson(after[key]) as JsonValue,
          });
        }
      }
      for (const key of beforeKeys) {
        if (afterKeySet.has(key)) {
          visit(
            before[key],
            after[key],
            `${path}/${escapeJsonPointerSegment(key)}`,
          );
        }
      }
      return;
    }

    const value = cloneJson(after) as JsonValue;
    patch.push(path === ''
      ? { op: 'replace', path: '', value }
      : { op: 'replace', path, value });
  };

  visit(source, target, '');
  return patch;
};

export const getAffectedPaths = (patch: readonly JsonPatchOperation[]): string[] => {
  const paths: string[] = [];
  const seen = new Set<string>();
  const add = (path: string) => {
    const normalized = formatJsonPointer(parseJsonPointer(path));
    if (!seen.has(normalized)) {
      seen.add(normalized);
      paths.push(normalized);
    }
  };

  for (const operation of patch) {
    if (operation.op === 'test') {
      continue;
    }
    add(operation.path);
    if (operation.op === 'move') {
      add(operation.from);
    }
  }
  return paths;
};
