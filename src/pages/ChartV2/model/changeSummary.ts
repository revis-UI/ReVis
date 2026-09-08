import type {
  AIChangeSummary,
  AIChangeSummaryOperation,
  AISemanticSummary,
} from './ai';
import type { DocumentHistoryEntry } from './document';
import type { JsonPatchOperation } from './jsonPatch';

const MAX_SUMMARY_ITEMS = 5;

const isPathWithin = (path: string, parent: string) =>
  path === parent || path.startsWith(`${parent}/`);

const isBookkeepingPath = (path: string) =>
  isPathWithin(path, '/history')
  || isPathWithin(path, '/metadata/updated_at');

const summarizeOperation = (
  operation: JsonPatchOperation,
): AIChangeSummaryOperation | null => {
  switch (operation.op) {
    case 'add':
    case 'copy':
      return 'added';
    case 'remove':
      return 'removed';
    case 'move':
    case 'replace':
      return 'changed';
    case 'test':
      return null;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const SEMANTIC_SUMMARY_LIMITS = {
  title: 120,
  overview: 600,
  changes: 6,
  description: 240,
} as const;

const stripUnsafeControlCharacters = (value: string) =>
  Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code <= 8 || code === 11 || code === 12
      || (code >= 14 && code <= 31) || code === 127
      ? ''
      : character;
  }).join('');

const normalizeSemanticText = (
  value: unknown,
  maxLength: number,
): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = stripUnsafeControlCharacters(value)
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, maxLength)
    .trim();
  return normalized || null;
};

const normalizeSemanticSummary = (
  value: unknown,
): AISemanticSummary | null => {
  if (
    !isRecord(value)
    || !Array.isArray(value.changes)
  ) {
    return null;
  }

  const title = normalizeSemanticText(
    value.title,
    SEMANTIC_SUMMARY_LIMITS.title,
  );
  const overview = normalizeSemanticText(
    value.overview,
    SEMANTIC_SUMMARY_LIMITS.overview,
  );
  if (!title || !overview) {
    return null;
  }

  const changes: AISemanticSummary['changes'] = [];
  for (const change of value.changes.slice(0, SEMANTIC_SUMMARY_LIMITS.changes)) {
    if (
      !isRecord(change)
      || (change.area !== 'dsl' && change.area !== 'viewData')
    ) {
      continue;
    }
    const description = normalizeSemanticText(
      change.description,
      SEMANTIC_SUMMARY_LIMITS.description,
    );
    if (!description) {
      continue;
    }
    changes.push({
      area: change.area,
      description,
    });
  }

  return changes.length > 0 ? { changes, overview, title } : null;
};

const semanticMatchesCanonicalScopes = (
  semantic: AISemanticSummary,
  scopes: AIChangeSummary['scopes'],
) => {
  const semanticAreas = new Set(
    semantic.changes.map((change) => change.area),
  );
  return semantic.changes.every((change) => scopes[change.area] > 0)
    && (scopes.dsl === 0 || semanticAreas.has('dsl'))
    && (scopes.viewData === 0 || semanticAreas.has('viewData'));
};

const semanticTargetForPath = (path: string) => {
  if (isPathWithin(path, '/view_data/marks')) {
    return { area: 'viewData' as const, key: 'marks', text: 'persisted mark data' };
  }
  if (isPathWithin(path, '/view_data/containers')) {
    return {
      area: 'viewData' as const,
      key: 'containers',
      text: 'persisted container layout',
    };
  }
  if (isPathWithin(path, '/view_data/cache')) {
    return {
      area: 'viewData' as const,
      key: 'cache',
      text: 'persisted rendering cache',
    };
  }
  if (isPathWithin(path, '/view_data')) {
    return {
      area: 'viewData' as const,
      key: 'view-data',
      text: 'persisted view data',
    };
  }
  if (isPathWithin(path, '/description')) {
    return { area: 'dsl' as const, key: 'description', text: 'chart description' };
  }
  if (isPathWithin(path, '/title')) {
    return { area: 'dsl' as const, key: 'title', text: 'chart title' };
  }
  if (isPathWithin(path, '/components')) {
    return {
      area: 'dsl' as const,
      key: 'components',
      text: 'chart component structure',
    };
  }
  if (
    isPathWithin(path, '/data_specification')
    || isPathWithin(path, '/template_data_specification')
    || isPathWithin(path, '/specification')
  ) {
    return {
      area: 'dsl' as const,
      key: 'specification',
      text: 'chart data specification',
    };
  }
  if (
    isPathWithin(path, '/coordinate')
    || isPathWithin(path, '/coordinate_system')
  ) {
    return {
      area: 'dsl' as const,
      key: 'coordinate',
      text: 'chart coordinate system',
    };
  }
  if (isPathWithin(path, '/metadata')) {
    return { area: 'dsl' as const, key: 'metadata', text: 'chart metadata' };
  }
  return { area: 'dsl' as const, key: 'definition', text: 'chart definition' };
};

const fallbackDescription = (
  operation: AIChangeSummaryOperation,
  target: ReturnType<typeof semanticTargetForPath>,
) => {
  const verb = operation === 'added'
    ? 'Added'
    : operation === 'removed'
      ? 'Removed'
      : 'Updated';
  return `${verb} the ${target.text}.`;
};

const createFallbackSemanticSummary = (
  scopes: AIChangeSummary['scopes'],
  total: number,
  changes: AISemanticSummary['changes'],
): AISemanticSummary => {
  const normalizedChanges = changes.length > 0
    ? changes
    : [{ area: 'dsl' as const, description: 'Recorded the validated document update.' }];
  if (scopes.dsl > 0 && scopes.viewData > 0) {
    return {
      title: 'Updated chart definition and view data',
      overview:
        'The validated update changes the chart DSL and synchronizes its persisted view data.',
      changes: normalizedChanges,
    };
  }
  if (scopes.viewData > 0) {
    return {
      title: 'Updated visualization view data',
      overview: 'The validated update changes the persisted visualization view data.',
      changes: normalizedChanges,
    };
  }
  if (scopes.dsl > 0) {
    return {
      title: 'Updated chart definition',
      overview: 'The validated update changes the chart DSL.',
      changes: normalizedChanges,
    };
  }
  return {
    title: 'Saved document update',
    overview: total === 0
      ? 'The document was saved without user-visible DSL or view-data changes.'
      : 'The validated document update was saved.',
    changes: normalizedChanges,
  };
};

/**
 * Creates a compact summary from the canonical history entry returned only
 * after an editor transaction has been validated and persisted.
 */
export const createAIChangeSummary = (
  entry: Pick<
    DocumentHistoryEntry,
    'forward_patch' | 'id' | 'timestamp'
  >,
  semantic?: unknown,
): AIChangeSummary => {
  const items: AIChangeSummary['items'] = [];
  const counts = { added: 0, removed: 0, changed: 0 };
  const scopes = { dsl: 0, viewData: 0 };
  const fallbackChanges: AISemanticSummary['changes'] = [];
  const fallbackChangeKeys = new Set<string>();
  let total = 0;

  for (const operation of entry.forward_patch) {
    const summaryOperation = summarizeOperation(operation);
    if (!summaryOperation || isBookkeepingPath(operation.path)) {
      continue;
    }
    counts[summaryOperation] += 1;
    scopes[isPathWithin(operation.path, '/view_data') ? 'viewData' : 'dsl']
      += 1;
    total += 1;
    const target = semanticTargetForPath(operation.path);
    const fallbackKey = `${summaryOperation}:${target.area}:${target.key}`;
    if (
      fallbackChanges.length < MAX_SUMMARY_ITEMS
      && !fallbackChangeKeys.has(fallbackKey)
    ) {
      fallbackChangeKeys.add(fallbackKey);
      fallbackChanges.push({
        area: target.area,
        description: fallbackDescription(summaryOperation, target),
      });
    }
    if (items.length < MAX_SUMMARY_ITEMS) {
      items.push({ operation: summaryOperation, path: operation.path });
    }
  }

  const normalizedSemantic = normalizeSemanticSummary(semantic);
  const verifiedSemantic = normalizedSemantic
    && semanticMatchesCanonicalScopes(normalizedSemantic, scopes)
    ? normalizedSemantic
    : null;

  return {
    counts,
    entryId: entry.id,
    items,
    scopes,
    semantic: verifiedSemantic
      ?? createFallbackSemanticSummary(scopes, total, fallbackChanges),
    timestamp: entry.timestamp,
    total,
  };
};
