import {validateLinkValues} from './linkValues';
import { validateColorScales } from './colorScales';
import { validateCoordinateGuides } from './coordinateGuides';
import { validateSharedData } from './dataSources';
import {
  applyJsonPatch,
  assertJsonPatch,
  cloneJson,
  diffJson,
  formatJsonPointer,
  getAffectedPaths,
  parseJsonPointer,
  type JsonPatch,
  type JsonPatchOperation,
  type JsonValue,
} from './jsonPatch.ts';
import {
  createGenerationSeed,
  SEEDED_RANDOM_ALGORITHM_VERSION,
} from './seededRandom.ts';

export type {
  JsonPatch,
  JsonPatchOperation,
} from './jsonPatch.ts';

export const CURRENT_SCHEMA_VERSION = '2.0.0';
export const CURRENT_GENERATOR_VERSION = SEEDED_RANDOM_ALGORITHM_VERSION;
export const MAX_HISTORY_ENTRIES = 20;

export interface DocumentMetadata {
  schema_version: string;
  generator_version: string;
  generation_seed: string;
  updated_at: string;
}

export interface PersistedViewCache {
  anchor_point: Record<string, unknown>;
  link_nodes: Record<string, unknown>;
  non_property: Record<string, unknown>;
  size_range: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Complete renderer state persisted beside the DSL. The open value types keep
 * this module independent from the chart renderer while preserving its marks,
 * expanded containers, and generation cache without loss.
 */
export interface PersistedViewData {
  cache: PersistedViewCache;
  containers: Record<string, unknown>;
  marks: Record<string, unknown>;
  [key: string]: unknown;
}

export type DocumentChangeSource =
  | 'ai'
  | 'data-control'
  | 'form'
  | 'json'
  | 'system';

export interface DocumentHistoryEntry {
  id: string;
  timestamp: string;
  source: DocumentChangeSource;
  affected_paths: string[];
  forward_patch: JsonPatch;
  inverse_patch: JsonPatch;
}

export interface DocumentHistory {
  entries: DocumentHistoryEntry[];
  /**
   * Number of entries currently applied. Entry `cursor` is the next redo, and
   * entry `cursor - 1` is the next undo.
   */
  cursor: number;
}

/**
 * The legacy chart DSL is intentionally represented as an open object. The
 * checked-in fixtures contain valid differences such as numeric strings and
 * null component/specification fields that should survive migration unchanged.
 */
export type ChartDocument = Record<string, unknown> & {
  metadata: DocumentMetadata;
  view_data: PersistedViewData;
  history: DocumentHistory;
};

export type EnhancedVisualChartDocument = ChartDocument;
export type HistorySource = DocumentChangeSource;

export interface MigrationOptions {
  generatorVersion?: string;
  generationSeed?: string;
  historyLimit?: number;
  now?: string | (() => string);
  schemaVersion?: string;
  viewData?: Record<string, unknown> | PersistedViewData;
}

export interface DocumentValidationIssue {
  code:
    | 'duplicate_container_id'
    | 'invalid_container'
    | 'invalid_history'
    | 'invalid_json'
    | 'invalid_metadata'
    | 'invalid_reference'
    | 'invalid_specification'
    | 'invalid_view_data';
  message: string;
  path: string;
}

export interface DocumentValidationResult {
  valid: boolean;
  issues: DocumentValidationIssue[];
}

export interface DocumentValidationOptions {
  requireEnhancedFields?: boolean;
  validateReferences?: boolean;
}

export interface CommitDocumentOptions {
  historyLimit?: number;
  id?: string;
  now?: string | (() => string);
  source: DocumentChangeSource;
  validateReferences?: boolean;
}

type CommitDocumentOptionsInput = CommitDocumentOptions | DocumentChangeSource;

export interface CommitPatchOptions extends CommitDocumentOptions {
  /**
   * Defaults to true for source "ai". Set explicitly when preflighting a
   * system-generated patch under the same restrictions.
   */
  enforceAiPathPolicy?: boolean;
}

export interface DocumentCommitResult {
  changed: boolean;
  document: ChartDocument;
  entry?: DocumentHistoryEntry;
}

export interface HistoryTransitionResult {
  changed: boolean;
  document: ChartDocument;
  entries: DocumentHistoryEntry[];
}

export interface ApplyValidatedPatchOptions {
  enforceAiPathPolicy?: boolean;
  validateReferences?: boolean;
}

export interface AiPatchPathValidationResult {
  valid: boolean;
  errors: string[];
}

export const AI_MUTABLE_ROOT_PATHS = [
  '/components',
  '/container_id',
  '/coordinate',
  '/coordinate_system',
  '/data_specification',
  '/data_sources',
  '/color_scales',
  '/coordinate_guides',
  '/data_mode',
  '/description',
  '/if_leaf',
  '/mark_type',
  '/metadata/generation_seed',
  '/template_data_specification',
  '/view_data',
] as const;

const PROTECTED_AI_PATHS = [
  '/history',
  '/metadata/schema_version',
  '/metadata/generator_version',
] as const;

const hasOwn = (value: object, key: PropertyKey) =>
  Object.prototype.hasOwnProperty.call(value, key);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const define = (object: Record<string, unknown>, key: string, value: unknown) => {
  Object.defineProperty(object, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
};

const getNow = (now?: string | (() => string)): string => {
  const value = typeof now === 'function' ? now() : now;
  return typeof value === 'string' && value.length > 0
    ? value
    : new Date().toISOString();
};

const normalizeHistoryLimit = (limit: number | undefined): number => {
  if (limit === undefined || !Number.isFinite(limit)) {
    return MAX_HISTORY_ENTRIES;
  }
  return Math.max(1, Math.min(MAX_HISTORY_ENTRIES, Math.floor(limit)));
};

const pointerIsAtOrBelow = (pointer: string, parent: string) =>
  pointer === parent || pointer.startsWith(`${parent}/`);

const pointerCanMutate = (pointer: string, protectedPath: string) =>
  pointerIsAtOrBelow(pointer, protectedPath)
  || pointerIsAtOrBelow(protectedPath, pointer);

const normalizePointer = (pointer: string) =>
  formatJsonPointer(parseJsonPointer(pointer));

const operationPointers = (
  operation: JsonPatchOperation,
): { pointer: string; role: 'from' | 'path' }[] => {
  const pointers: { pointer: string; role: 'from' | 'path' }[] = [
    { pointer: normalizePointer(operation.path), role: 'path' },
  ];
  if (operation.op === 'copy' || operation.op === 'move') {
    pointers.push({ pointer: normalizePointer(operation.from), role: 'from' });
  }
  return pointers;
};

const patchTouchesHistory = (patch: readonly JsonPatchOperation[]) =>
  patch.some((operation) =>
    operationPointers(operation).some(({ pointer }) =>
      pointerCanMutate(pointer, '/history'),
    ),
  );

export const assertPatchDoesNotTouchHistory = (
  patch: readonly JsonPatchOperation[],
) => {
  if (patchTouchesHistory(patch)) {
    throw new Error('Document patches cannot read, replace, or modify /history');
  }
};

export const validateAiPatchPaths = (
  patch: unknown,
): AiPatchPathValidationResult => {
  try {
    assertJsonPatch(patch);
  } catch (error) {
    return {
      errors: [error instanceof Error ? error.message : String(error)],
      valid: false,
    };
  }

  const errors: string[] = [];
  patch.forEach((operation, index) => {
    for (const { pointer, role } of operationPointers(operation)) {
      const protectedPath = PROTECTED_AI_PATHS.find((candidate) =>
        pointerCanMutate(pointer, candidate),
      );
      if (protectedPath) {
        errors.push(
          `Operation ${index} ${role} "${pointer}" can affect protected path "${protectedPath}"`,
        );
        continue;
      }

      const allowed = AI_MUTABLE_ROOT_PATHS.some((root) =>
        pointerIsAtOrBelow(pointer, root),
      );
      if (!allowed) {
        errors.push(
          `Operation ${index} ${role} "${pointer}" is outside the AI-editable document paths`,
        );
      }
    }
  });

  return { errors, valid: errors.length === 0 };
};

export class DocumentValidationError extends Error {
  readonly issues: DocumentValidationIssue[];

  constructor(issues: DocumentValidationIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join('; '));
    this.name = 'DocumentValidationError';
    this.issues = issues;
  }
}

const normalizeEntry = (value: unknown): DocumentHistoryEntry | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const validSources = new Set<DocumentChangeSource>([
    'ai',
    'data-control',
    'form',
    'json',
    'system',
  ]);
  if (
    typeof value.id !== 'string'
    || value.id.length === 0
    || typeof value.timestamp !== 'string'
    || value.timestamp.length === 0
    || typeof value.source !== 'string'
    || !validSources.has(value.source as DocumentChangeSource)
    || !Array.isArray(value.affected_paths)
  ) {
    return undefined;
  }

  try {
    assertJsonPatch(value.forward_patch);
    assertJsonPatch(value.inverse_patch);
    assertPatchDoesNotTouchHistory(value.forward_patch);
    assertPatchDoesNotTouchHistory(value.inverse_patch);
    const affectedPaths = value.affected_paths.map((path) => {
      if (typeof path !== 'string') {
        throw new Error('History affected paths must be strings');
      }
      return normalizePointer(path);
    });

    return {
      affected_paths: affectedPaths,
      forward_patch: cloneJson(value.forward_patch),
      id: value.id,
      inverse_patch: cloneJson(value.inverse_patch),
      source: value.source as DocumentChangeSource,
      timestamp: value.timestamp,
    };
  } catch {
    return undefined;
  }
};

const normalizeHistory = (
  value: unknown,
  historyLimit: number,
): DocumentHistory => {
  if (!isRecord(value) || !Array.isArray(value.entries)) {
    throw new DocumentValidationError([{
      code: 'invalid_history',
      message: 'history must contain an entries array',
      path: '/history',
    }]);
  }

  if (
    !Number.isInteger(value.cursor)
    || Number(value.cursor) < 0
    || Number(value.cursor) > value.entries.length
  ) {
    throw new DocumentValidationError([{
      code: 'invalid_history',
      message: 'cursor must be an integer between 0 and entries.length',
      path: '/history/cursor',
    }]);
  }

  const entries = value.entries.map((candidate, index) => {
    const entry = normalizeEntry(candidate);
    if (!entry) {
      throw new DocumentValidationError([{
        code: 'invalid_history',
        message: 'History entry or its patches are invalid',
        path: `/history/entries/${index}`,
      }]);
    }
    return entry;
  });

  const overflow = Math.max(0, entries.length - historyLimit);
  return {
    cursor: Math.max(0, Number(value.cursor) - overflow),
    entries: entries.slice(overflow),
  };
};

/**
 * Upgrades a legacy DSL only in memory. Callers decide when the returned
 * enhanced document is persisted, enabling the agreed-on lazy migration.
 */
const isMigrationOptions = (value: unknown): value is MigrationOptions =>
  isRecord(value)
  && [
    'generatorVersion',
    'generationSeed',
    'historyLimit',
    'now',
    'schemaVersion',
    'viewData',
  ].some((key) => hasOwn(value, key));

const emptyViewCache = (): PersistedViewCache => ({
  anchor_point: {},
  link_nodes: {},
  non_property: {},
  size_range: {},
});

/**
 * Accepts both the new complete view snapshot and the former ContainerData
 * shape. A legacy mark map is retained under `marks`.
 */
export const normalizePersistedViewData = (
  value: unknown,
): PersistedViewData => {
  if (!isRecord(value)) {
    return { cache: emptyViewCache(), containers: {}, marks: {} };
  }

  const isCompleteShape =
    hasOwn(value, 'marks')
    || hasOwn(value, 'containers')
    || hasOwn(value, 'cache');
  if (!isCompleteShape) {
    return {
      cache: emptyViewCache(),
      containers: {},
      marks: cloneJson(value),
    };
  }

  const cacheInput = isRecord(value.cache) ? value.cache : {};
  const cache: PersistedViewCache = {
    ...cloneJson(cacheInput),
    anchor_point: isRecord(cacheInput.anchor_point)
      ? cloneJson(cacheInput.anchor_point)
      : {},
    link_nodes: isRecord(cacheInput.link_nodes)
      ? cloneJson(cacheInput.link_nodes)
      : {},
    non_property: isRecord(cacheInput.non_property)
      ? cloneJson(cacheInput.non_property)
      : {},
    size_range: isRecord(cacheInput.size_range)
      ? cloneJson(cacheInput.size_range)
      : {},
  };

  return {
    ...cloneJson(value),
    cache,
    containers: isRecord(value.containers) ? cloneJson(value.containers) : {},
    marks: isRecord(value.marks) ? cloneJson(value.marks) : {},
  };
};

export function migrateDocument(
  input: unknown,
  generatedViewData?: Record<string, unknown> | PersistedViewData,
): ChartDocument;
export function migrateDocument(
  input: unknown,
  options?: MigrationOptions,
): ChartDocument;
export function migrateDocument(
  input: unknown,
  viewDataOrOptions: MigrationOptions | Record<string, unknown> = {},
): ChartDocument {
  if (!isRecord(input)) {
    throw new TypeError('A chart DSL document must be a JSON object');
  }

  const options = isMigrationOptions(viewDataOrOptions)
    ? viewDataOrOptions
    : { viewData: viewDataOrOptions };
  const document = cloneJson(input);
  const existingMetadata = isRecord(document.metadata) ? document.metadata : {};
  const generationSeed =
    typeof existingMetadata.generation_seed === 'string'
    || typeof existingMetadata.generation_seed === 'number'
      ? String(existingMetadata.generation_seed)
      : options.generationSeed ?? createGenerationSeed();

  define(document, 'metadata', {
    generator_version:
      typeof existingMetadata.generator_version === 'string'
        ? existingMetadata.generator_version
        : options.generatorVersion ?? CURRENT_GENERATOR_VERSION,
    generation_seed: generationSeed,
    schema_version:
      typeof existingMetadata.schema_version === 'string'
      || typeof existingMetadata.schema_version === 'number'
        ? String(existingMetadata.schema_version)
        : options.schemaVersion ?? CURRENT_SCHEMA_VERSION,
    updated_at:
      typeof existingMetadata.updated_at === 'string'
        ? existingMetadata.updated_at
        : getNow(options.now),
  });

  const viewData = isRecord(document.view_data)
    ? document.view_data
    : options.viewData ?? {};
  define(document, 'view_data', normalizePersistedViewData(viewData));

  const historyLimit = normalizeHistoryLimit(options.historyLimit);
  const history = hasOwn(document, 'history')
    ? normalizeHistory(document.history, historyLimit)
    : { cursor: 0, entries: [] };
  define(
    document,
    'history',
    history,
  );
  return document as ChartDocument;
}

export const isEnhancedDocument = (value: unknown): value is ChartDocument =>
  isRecord(value)
  && isRecord(value.metadata)
  && isRecord(value.view_data)
  && isRecord(value.history)
  && Array.isArray(value.history.entries)
  && Number.isInteger(value.history.cursor);

const addIssue = (
  issues: DocumentValidationIssue[],
  code: DocumentValidationIssue['code'],
  path: string,
  message: string,
) => {
  issues.push({ code, message, path });
};

const validateJsonTree = (
  value: unknown,
  issues: DocumentValidationIssue[],
  path: string,
  ancestors: WeakSet<object>,
) => {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
  ) {
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      addIssue(issues, 'invalid_json', path, 'Numbers must be finite');
    }
    return;
  }
  if (typeof value !== 'object' || value === null) {
    addIssue(issues, 'invalid_json', path, 'Value is not JSON-serializable');
    return;
  }
  if (ancestors.has(value)) {
    addIssue(issues, 'invalid_json', path, 'Circular references are not allowed');
    return;
  }

  ancestors.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      validateJsonTree(item, issues, `${path}/${index}`, ancestors),
    );
  } else {
    for (const [key, item] of Object.entries(value)) {
      let childPath = path;
      try {
        childPath = `${path}/${formatJsonPointer([key]).slice(1)}`;
        parseJsonPointer(childPath);
      } catch (error) {
        addIssue(
          issues,
          'invalid_json',
          childPath,
          error instanceof Error ? error.message : String(error),
        );
        continue;
      }
      validateJsonTree(item, issues, childPath, ancestors);
    }
  }
  ancestors.delete(value);
};

const validateContainerTree = (
  value: unknown,
  issues: DocumentValidationIssue[],
  path: string,
  containerIds: Set<string>,
) => {
  if (!isRecord(value)) {
    addIssue(issues, 'invalid_container', path, 'Container must be an object');
    return;
  }

  if (typeof value.container_id !== 'string' || value.container_id.length === 0) {
    addIssue(
      issues,
      'invalid_container',
      `${path}/container_id`,
      'container_id must be a non-empty string',
    );
  } else if (containerIds.has(value.container_id)) {
    addIssue(
      issues,
      'duplicate_container_id',
      `${path}/container_id`,
      `Duplicate container_id "${value.container_id}"`,
    );
  } else {
    containerIds.add(value.container_id);
  }

  if (value.coordinate !== 'cartesian' && value.coordinate !== 'polar') {
    addIssue(
      issues,
      'invalid_container',
      `${path}/coordinate`,
      'coordinate must be "cartesian" or "polar"',
    );
  }
  if (!isRecord(value.coordinate_system)) {
    addIssue(
      issues,
      'invalid_container',
      `${path}/coordinate_system`,
      'coordinate_system must be an object',
    );
  } else {
    for (const [key, coordinateValue] of Object.entries(value.coordinate_system)) {
      if (
        typeof coordinateValue !== 'number'
        && typeof coordinateValue !== 'string'
        && coordinateValue !== null
      ) {
        addIssue(
          issues,
          'invalid_container',
          `${path}/coordinate_system/${key}`,
          'Coordinate values must be numbers, numeric strings, or null',
        );
      }
    }
  }
  if (typeof value.if_leaf !== 'boolean') {
    addIssue(
      issues,
      'invalid_container',
      `${path}/if_leaf`,
      'if_leaf must be a boolean',
    );
  }
  if (typeof value.description !== 'string') {
    addIssue(
      issues,
      'invalid_container',
      `${path}/description`,
      'description must be a string',
    );
  }

  if (value.components !== null && value.components !== undefined) {
    if (!Array.isArray(value.components)) {
      addIssue(
        issues,
        'invalid_container',
        `${path}/components`,
        'components must be an array or null',
      );
    } else {
      value.components.forEach((component, index) =>
        validateContainerTree(
          component,
          issues,
          `${path}/components/${index}`,
          containerIds,
        ),
      );
    }
  }
};

const validateSpecifications = (
  value: unknown,
  issues: DocumentValidationIssue[],
  path: string,
  requireMarkSpecification: boolean,
) => {
  if (value !== null && value !== undefined && !isRecord(value)) {
    addIssue(
      issues,
      'invalid_specification',
      path,
      'Specification map must be an object or null',
    );
    return;
  }
  if (!isRecord(value)) {
    return;
  }

  for (const [key, specification] of Object.entries(value)) {
    const specificationPath = `${path}/${key}`;
    if (!isRecord(specification)) {
      addIssue(
        issues,
        'invalid_specification',
        specificationPath,
        'Each data specification must be an object',
      );
      continue;
    }
    const requiredObjects: (
      | 'data_structure'
      | 'layout_specification'
      | 'mark_specification'
    )[] = ['data_structure', 'layout_specification'];
    if (requireMarkSpecification) {
      requiredObjects.push('mark_specification');
    }
    for (const requiredObject of requiredObjects) {
      if (!isRecord(specification[requiredObject])) {
        addIssue(
          issues,
          'invalid_specification',
          `${specificationPath}/${requiredObject}`,
          `${requiredObject} must be an object`,
        );
      }
    }
    if (
      specification.non_layout_specification !== null
      && specification.non_layout_specification !== undefined
      && !isRecord(specification.non_layout_specification)
    ) {
      addIssue(
        issues,
        'invalid_specification',
        `${specificationPath}/non_layout_specification`,
        'non_layout_specification must be an object or null',
      );
    }
  }
};

const validateLinkReferences = (
  document: Record<string, unknown>,
  issues: DocumentValidationIssue[],
  containerIds: ReadonlySet<string>,
) => {
  for (const specificationKey of [
    'data_specification',
    'template_data_specification',
  ] as const) {
    const specifications = document[specificationKey];
    if (!isRecord(specifications)) {
      continue;
    }

    for (const [specificationId, specification] of Object.entries(specifications)) {
      if (!isRecord(specification) || !isRecord(specification.layout_specification)) {
        continue;
      }
      for (const direction of ['source', 'target'] as const) {
        const references = specification.layout_specification[direction];
        if (references === null || references === undefined) {
          continue;
        }
        if (!Array.isArray(references)) {
          addIssue(
            issues,
            'invalid_reference',
            `/${specificationKey}/${specificationId}/layout_specification/${direction}`,
            `${direction} references must be an array or null`,
          );
          continue;
        }
        references.forEach((reference, index) => {
          const referencePath =
            `/${specificationKey}/${specificationId}/layout_specification/${direction}/${index}`;
          if (!isRecord(reference) || typeof reference.container_id !== 'string') {
            addIssue(
              issues,
              'invalid_reference',
              referencePath,
              'Link references must contain a string container_id',
            );
          } else if (!containerIds.has(reference.container_id)) {
            addIssue(
              issues,
              'invalid_reference',
              `${referencePath}/container_id`,
              `Unknown container reference "${reference.container_id}"`,
            );
          }
        });
      }
    }
  }
};

const validateMetadata = (
  value: unknown,
  issues: DocumentValidationIssue[],
) => {
  if (!isRecord(value)) {
    addIssue(issues, 'invalid_metadata', '/metadata', 'metadata must be an object');
    return;
  }
  for (const key of [
    'schema_version',
    'generator_version',
    'generation_seed',
    'updated_at',
  ] as const) {
    if (typeof value[key] !== 'string' || value[key].length === 0) {
      addIssue(
        issues,
        'invalid_metadata',
        `/metadata/${key}`,
        `${key} must be a non-empty string`,
      );
    }
  }
};

const validateHistory = (
  value: unknown,
  issues: DocumentValidationIssue[],
) => {
  if (!isRecord(value) || !Array.isArray(value.entries)) {
    addIssue(
      issues,
      'invalid_history',
      '/history',
      'history must contain an entries array',
    );
    return;
  }
  if (
    !Number.isInteger(value.cursor)
    || Number(value.cursor) < 0
    || Number(value.cursor) > value.entries.length
  ) {
    addIssue(
      issues,
      'invalid_history',
      '/history/cursor',
      'cursor must be an integer between 0 and entries.length',
    );
  }
  if (value.entries.length > MAX_HISTORY_ENTRIES) {
    addIssue(
      issues,
      'invalid_history',
      '/history/entries',
      `History cannot contain more than ${MAX_HISTORY_ENTRIES} entries`,
    );
  }

  value.entries.forEach((candidate, index) => {
    const entry = normalizeEntry(candidate);
    if (!entry) {
      addIssue(
        issues,
        'invalid_history',
        `/history/entries/${index}`,
        'History entry or its patches are invalid',
      );
    }
  });
};

const validatePersistedViewData = (
  value: unknown,
  issues: DocumentValidationIssue[],
) => {
  if (!isRecord(value)) {
    addIssue(
      issues,
      'invalid_view_data',
      '/view_data',
      'view_data must be an object',
    );
    return;
  }
  const marksByContainer = isRecord(value.marks) ? value.marks : null;
  const containersById = isRecord(value.containers) ? value.containers : null;

  const validateMarkNode = (mark: unknown, path: string): void => {
    if (Array.isArray(mark)) {
      mark.forEach((item, index) =>
        validateMarkNode(item, `${path}/${index}`),
      );
      return;
    }
    if (!isRecord(mark)) {
      addIssue(
        issues,
        'invalid_view_data',
        path,
        'Each mark leaf must be an object',
      );
      return;
    }
    if (typeof mark.id !== 'string' || mark.id.length === 0) {
      addIssue(
        issues,
        'invalid_view_data',
        `${path}/id`,
        'Each mark leaf must contain a non-empty string id',
      );
    }
  };

  if (!marksByContainer) {
    addIssue(
      issues,
      'invalid_view_data',
      '/view_data/marks',
      'view_data.marks must be an object',
    );
  } else {
    for (const [containerId, marks] of Object.entries(marksByContainer)) {
      const marksPath = `/view_data/marks/${containerId}`;
      if (!Array.isArray(marks)) {
        addIssue(
          issues,
          'invalid_view_data',
          marksPath,
          'Each marks entry must be an array',
        );
      } else {
        marks.forEach((mark, index) =>
          validateMarkNode(mark, `${marksPath}/${index}`),
        );
      }
    }
  }
  const leafContainerIds = new Set<string>();
  if (!containersById) {
    addIssue(
      issues,
      'invalid_view_data',
      '/view_data/containers',
      'view_data.containers must be an object',
    );
  } else {
    for (const [containerId, container] of Object.entries(containersById)) {
      const containerPath = `/view_data/containers/${containerId}`;
      if (!isRecord(container)) {
        addIssue(
          issues,
          'invalid_view_data',
          containerPath,
          'Each persisted container must be an object',
        );
        continue;
      }
      if (
        typeof container.container_id !== 'string'
        || container.container_id.length === 0
      ) {
        addIssue(
          issues,
          'invalid_view_data',
          `${containerPath}/container_id`,
          'Each persisted container must contain a non-empty string container_id',
        );
      } else if (container.container_id !== containerId) {
        addIssue(
          issues,
          'invalid_reference',
          `${containerPath}/container_id`,
          `Persisted container id "${container.container_id}" does not match key "${containerId}"`,
        );
      }
      if (typeof container.if_leaf !== 'boolean') {
        addIssue(
          issues,
          'invalid_view_data',
          `${containerPath}/if_leaf`,
          'Each persisted container must contain a boolean if_leaf',
        );
      } else if (container.if_leaf) {
        leafContainerIds.add(containerId);
      }
    }
  }

  if (marksByContainer && containersById) {
    for (const containerId of Object.keys(marksByContainer)) {
      const container = containersById[containerId];
      if (!isRecord(container)) {
        addIssue(
          issues,
          'invalid_reference',
          `/view_data/marks/${containerId}`,
          `Marks reference unknown persisted container "${containerId}"`,
        );
      } else if (container.if_leaf !== true) {
        addIssue(
          issues,
          'invalid_reference',
          `/view_data/marks/${containerId}`,
          `Marks can only belong to a leaf persisted container`,
        );
      }
    }
    for (const containerId of leafContainerIds) {
      if (!hasOwn(marksByContainer, containerId)) {
        addIssue(
          issues,
          'invalid_reference',
          `/view_data/containers/${containerId}`,
          `Leaf persisted container "${containerId}" has no marks entry`,
        );
      }
    }
  }
  if (!isRecord(value.cache)) {
    addIssue(
      issues,
      'invalid_view_data',
      '/view_data/cache',
      'view_data.cache must be an object',
    );
    return;
  }
  for (const key of [
    'size_range',
    'anchor_point',
    'link_nodes',
    'non_property',
  ] as const) {
    if (!isRecord(value.cache[key])) {
      addIssue(
        issues,
        'invalid_view_data',
        `/view_data/cache/${key}`,
        `view_data.cache.${key} must be an object`,
      );
    }
  }
};

/**
 * Performs deliberately tolerant DSL validation: layout/data details remain
 * open-ended, while the container tree, persisted envelope, history, and link
 * references receive strict checks.
 */
export const validateDocument = (
  value: unknown,
  options: DocumentValidationOptions = {},
): DocumentValidationResult => {
  const issues: DocumentValidationIssue[] = [];
  validateJsonTree(value, issues, '', new WeakSet());
  if (!isRecord(value)) {
    addIssue(issues, 'invalid_container', '', 'Document root must be an object');
    return { issues, valid: false };
  }

  if (isRecord(value.data_specification)) for (const [id, spec] of Object.entries(value.data_specification)) {
    if (isRecord(spec) && isRecord(spec.layout_specification) && spec.layout_specification.link_values !== undefined) {
      try { validateLinkValues(spec.layout_specification.link_values); } catch (error) {
        addIssue(issues, 'invalid_reference', `/data_specification/${id}/layout_specification/link_values`, String(error));
      }
    }
  }
  try { validateColorScales(value); } catch (error) {
    addIssue(issues, 'invalid_reference', '/color_scales', error instanceof Error ? error.message : String(error));
  }

  try { validateSharedData(value); } catch (error) {
    addIssue(issues, 'invalid_reference', '/data_sources', error instanceof Error ? error.message : String(error));
  }

  try { validateCoordinateGuides(value.coordinate_guides); } catch (error) {
    addIssue(issues, 'invalid_reference', '/coordinate_guides', error instanceof Error ? error.message : String(error));
  }

  const containerIds = new Set<string>();
  validateContainerTree(value, issues, '', containerIds);
  validateSpecifications(
    value.data_specification,
    issues,
    '/data_specification',
    true,
  );
  validateSpecifications(
    value.template_data_specification,
    issues,
    '/template_data_specification',
    false,
  );

  if (options.requireEnhancedFields !== false) {
    validateMetadata(value.metadata, issues);
    validatePersistedViewData(value.view_data, issues);
    validateHistory(value.history, issues);
  }
  if (options.validateReferences !== false) {
    validateLinkReferences(value, issues, containerIds);
  }

  return { issues, valid: issues.length === 0 };
};

export function assertValidDocument(
  value: unknown,
  options: DocumentValidationOptions = {},
): asserts value is ChartDocument {
  const result = validateDocument(value, options);
  if (!result.valid) {
    throw new DocumentValidationError(result.issues);
  }
}

export const applyValidatedDocumentPatch = (
  document: ChartDocument,
  patch: JsonPatch,
  options: ApplyValidatedPatchOptions = {},
): ChartDocument => {
  assertJsonPatch(patch);
  assertPatchDoesNotTouchHistory(patch);
  if (options.enforceAiPathPolicy) {
    const pathValidation = validateAiPatchPaths(patch);
    if (!pathValidation.valid) {
      throw new Error(pathValidation.errors.join('; '));
    }
  }

  const candidate = applyJsonPatch(document, patch);
  assertValidDocument(candidate, {
    validateReferences: options.validateReferences,
  });
  return candidate;
};

let historyIdSequence = 0;

const createHistoryId = (
  timestamp: string,
  source: DocumentChangeSource,
): string => {
  historyIdSequence += 1;
  return `${timestamp}:${source}:${historyIdSequence.toString(36)}`;
};

const prepareCandidate = (
  current: ChartDocument,
  next: unknown,
  now: string,
): ChartDocument => {
  if (!isRecord(next)) {
    throw new TypeError('A chart document candidate must be an object');
  }
  const candidate = cloneJson(next);
  if (!hasOwn(candidate, 'metadata')) {
    define(candidate, 'metadata', cloneJson(current.metadata));
  }
  if (!hasOwn(candidate, 'view_data')) {
    define(candidate, 'view_data', cloneJson(current.view_data));
  }
  define(candidate, 'history', cloneJson(current.history));
  return migrateDocument(candidate, {
    generationSeed: current.metadata.generation_seed,
    generatorVersion: current.metadata.generator_version,
    now,
    schemaVersion: current.metadata.schema_version,
  });
};

const normalizeCommitOptions = (
  options: CommitDocumentOptionsInput,
): CommitDocumentOptions =>
  typeof options === 'string' ? { source: options } : options;

export const commitDocument = (
  currentInput: ChartDocument,
  next: unknown,
  optionsInput: CommitDocumentOptionsInput,
): DocumentCommitResult => {
  const options = normalizeCommitOptions(optionsInput);
  const current = migrateDocument(currentInput);
  assertValidDocument(current, {
    validateReferences: options.validateReferences,
  });
  const timestamp = getNow(options.now);
  const candidate = prepareCandidate(current, next, timestamp);
  assertValidDocument(candidate, {
    validateReferences: options.validateReferences,
  });

  const meaningfulPatch = diffJson(current, candidate, {
    ignoredPaths: ['/history', '/metadata/updated_at'],
  });
  if (meaningfulPatch.length === 0) {
    return { changed: false, document: cloneJson(current) };
  }

  candidate.metadata.updated_at = timestamp;
  const forwardPatch = diffJson(current, candidate, {
    ignoredPaths: ['/history'],
  });
  const inversePatch = diffJson(candidate, current, {
    ignoredPaths: ['/history'],
  });
  assertPatchDoesNotTouchHistory(forwardPatch);
  assertPatchDoesNotTouchHistory(inversePatch);

  const historyLimit = normalizeHistoryLimit(options.historyLimit);
  const branch = current.history.entries.slice(0, current.history.cursor);
  const entry: DocumentHistoryEntry = {
    affected_paths: getAffectedPaths(meaningfulPatch),
    forward_patch: forwardPatch,
    id: options.id ?? createHistoryId(timestamp, options.source),
    inverse_patch: inversePatch,
    source: options.source,
    timestamp,
  };
  branch.push(entry);
  const overflow = Math.max(0, branch.length - historyLimit);
  const entries = branch.slice(overflow);
  candidate.history = { cursor: entries.length, entries };

  assertValidDocument(candidate, {
    validateReferences: options.validateReferences,
  });
  return { changed: true, document: candidate, entry };
};

export const commitDocumentPatch = (
  currentInput: ChartDocument,
  patch: JsonPatch,
  options: CommitPatchOptions,
): DocumentCommitResult => {
  const current = migrateDocument(currentInput);
  const enforceAiPathPolicy =
    options.enforceAiPathPolicy ?? options.source === 'ai';
  const candidate = applyValidatedDocumentPatch(current, patch, {
    enforceAiPathPolicy,
    validateReferences: options.validateReferences,
  });
  return commitDocument(current, candidate, options);
};

const setTransitionEnvelope = (
  candidate: ChartDocument,
  history: DocumentHistory,
  timestamp: string,
) => {
  candidate.history = cloneJson(history);
  candidate.metadata.updated_at = timestamp;
};

export const undoDocument = (
  input: ChartDocument,
  options: Pick<CommitDocumentOptions, 'now' | 'validateReferences'> = {},
): HistoryTransitionResult => {
  const document = migrateDocument(input);
  assertValidDocument(document, {
    validateReferences: options.validateReferences,
  });
  if (document.history.cursor === 0) {
    return { changed: false, document: cloneJson(document), entries: [] };
  }

  const entry = document.history.entries[document.history.cursor - 1];
  const candidate = applyJsonPatch(document, entry.inverse_patch);
  setTransitionEnvelope(
    candidate,
    {
      cursor: document.history.cursor - 1,
      entries: document.history.entries,
    },
    getNow(options.now),
  );
  assertValidDocument(candidate, {
    validateReferences: options.validateReferences,
  });
  return { changed: true, document: candidate, entries: [cloneJson(entry)] };
};

export const redoDocument = (
  input: ChartDocument,
  options: Pick<CommitDocumentOptions, 'now' | 'validateReferences'> = {},
): HistoryTransitionResult => {
  const document = migrateDocument(input);
  assertValidDocument(document, {
    validateReferences: options.validateReferences,
  });
  if (document.history.cursor >= document.history.entries.length) {
    return { changed: false, document: cloneJson(document), entries: [] };
  }

  const entry = document.history.entries[document.history.cursor];
  const candidate = applyJsonPatch(document, entry.forward_patch);
  setTransitionEnvelope(
    candidate,
    {
      cursor: document.history.cursor + 1,
      entries: document.history.entries,
    },
    getNow(options.now),
  );
  assertValidDocument(candidate, {
    validateReferences: options.validateReferences,
  });
  return { changed: true, document: candidate, entries: [cloneJson(entry)] };
};

export const jumpToHistory = (
  input: ChartDocument,
  targetCursor: number,
  options: Pick<CommitDocumentOptions, 'now' | 'validateReferences'> = {},
): HistoryTransitionResult => {
  const document = migrateDocument(input);
  assertValidDocument(document, {
    validateReferences: options.validateReferences,
  });
  if (
    !Number.isInteger(targetCursor)
    || targetCursor < 0
    || targetCursor > document.history.entries.length
  ) {
    throw new RangeError('History cursor is outside the available history range');
  }
  if (targetCursor === document.history.cursor) {
    return { changed: false, document: cloneJson(document), entries: [] };
  }

  let candidate = cloneJson(document);
  const entries: DocumentHistoryEntry[] = [];
  if (targetCursor < document.history.cursor) {
    for (
      let cursor = document.history.cursor;
      cursor > targetCursor;
      cursor -= 1
    ) {
      const entry = document.history.entries[cursor - 1];
      candidate = applyJsonPatch(candidate, entry.inverse_patch);
      entries.push(cloneJson(entry));
    }
  } else {
    for (
      let cursor = document.history.cursor;
      cursor < targetCursor;
      cursor += 1
    ) {
      const entry = document.history.entries[cursor];
      candidate = applyJsonPatch(candidate, entry.forward_patch);
      entries.push(cloneJson(entry));
    }
  }

  setTransitionEnvelope(
    candidate,
    { cursor: targetCursor, entries: document.history.entries },
    getNow(options.now),
  );
  assertValidDocument(candidate, {
    validateReferences: options.validateReferences,
  });
  return { changed: true, document: candidate, entries };
};

export const clearDocumentHistory = (
  input: ChartDocument,
  now?: string | (() => string),
): ChartDocument => {
  const document = migrateDocument(input);
  document.history = { cursor: 0, entries: [] };
  document.metadata.updated_at = getNow(now);
  return document;
};

/**
 * Returns a JSON-only copy appropriate for the model context. Persisted edit
 * history is excluded so patches cannot depend on or echo recursive history.
 */
export const createModelDocumentSnapshot = (
  input: ChartDocument,
): Record<string, JsonValue> => {
  const document = migrateDocument(input);
  const snapshot = cloneJson(document) as Record<string, JsonValue>;
  delete snapshot.history;
  return snapshot;
};

/** Integration-friendly aliases using the terminology from the editor layer. */
export const applyPatch = applyJsonPatch;
export const validateAIPatchPaths = validateAiPatchPaths;
export const validateDocumentShape = validateDocument;
