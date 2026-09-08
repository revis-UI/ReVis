import type { CoordinateGuides } from './coordinateGuides';
import { buildDataModeCandidate } from './dataMode';
import type { DataMode } from './dataSources';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import * as R from 'ramda';

import { showToast } from '@/components/toast';
import {
  loadDSLFile,
  saveDSLFile,
} from '@/services/dsl';
import { JSON_FILES } from '@/generated/json-files';
import {
  type ChartDocument,
  type DocumentChangeSource,
  type DocumentCommitResult,
  type DocumentHistoryEntry,
  type JsonPatch,
  type JsonPatchOperation,
  type MigrationOptions,
  type PersistedViewData,
  assertValidDocument,
  clearDocumentHistory,
  commitDocument,
  createModelDocumentSnapshot,
  jumpToHistory,
  migrateDocument,
  redoDocument,
  undoDocument,
  validateDocumentShape,
} from './document';
import {
  applyJsonPatch,
  cloneJson,
  diffJson,
  jsonDeepEqual,
  parseJsonPointer,
} from './jsonPatch';
import { createSeededRandom } from './seededRandom';
import {
  VisualChart,
  type VisualChartViewSnapshot,
} from './Chart';
import {
  loadData,
  resolveDataCategory,
  type DSLCategory,
} from '../utils';
import {
  DataFormProp,
  type ContainerData,
  type VisualChartContainer,
  type VisualChartJsonData,
} from '../type';

type JsonFileName = typeof JSON_FILES[number];

export const SELECTED_DSL_FILE_STORAGE_KEY =
  'vitejs-d3.editor.selected-dsl-file.v1';

interface EditorStoreState {
  chart: VisualChart;
  dsl_file: JsonFileName;
  dsl_category: DSLCategory | null;
  file_hash: string | null;
  dsl_json: ChartDocument | undefined;
  dsl_container: Record<string, VisualChartContainer>;
  dsl_data: ContainerData;
  allContainers: VisualChartContainer[];
  selectedContainerId: string | null;
  selectedContainer: VisualChartContainer | null;
  selectedContainerChildren: VisualChartContainer[];
  showContainers: boolean;
  hoveredContainerId: string | null;
  currentDataFormProp: DataFormProp;
  referenceImage: string | null;
  isSaving: boolean;
  lastSaveError: string | null;
}

export class EditorPatchValidationError extends Error {
  readonly code = 'AI_PATCH_VALIDATION_FAILED';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'EditorPatchValidationError';
  }
}

export class EditorStaleChangeError extends Error {
  readonly code = 'EDITOR_STALE_CHANGE';

  constructor() {
    super('The editor changed before this update could be applied.');
    this.name = 'EditorStaleChangeError';
  }
}

export const useChartStore = create(
  immer<EditorStoreState>(() => ({
    chart: new VisualChart(),
    dsl_file: '07_iForest',
    dsl_category: null,
    file_hash: null,
    dsl_json: undefined,
    dsl_container: {},
    dsl_data: {},
    allContainers: [],
    selectedContainerId: null,
    selectedContainer: null,
    selectedContainerChildren: [],
    showContainers: false,
    hoveredContainerId: null,
    currentDataFormProp: DataFormProp.ALL,
    referenceImage: null,
    isSaving: false,
    lastSaveError: null,
  })),
);

const isJsonFileName = (value: string): value is JsonFileName =>
  (JSON_FILES as readonly string[]).includes(value);

const readSelectedDslFile = (): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage.getItem(SELECTED_DSL_FILE_STORAGE_KEY);
  } catch {
    return null;
  }
};

const persistSelectedDslFile = (dslFile: JsonFileName) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(SELECTED_DSL_FILE_STORAGE_KEY, dslFile);
  } catch {
    // Storage can be unavailable in private browsing or restricted contexts.
  }
};

const asVisualDSL = (document: ChartDocument) =>
  document as unknown as VisualChartJsonData;

const asViewSnapshot = (viewData: PersistedViewData) =>
  viewData as unknown as VisualChartViewSnapshot;

const asPersistedViewData = (snapshot: VisualChartViewSnapshot) =>
  snapshot as unknown as PersistedViewData;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasCompletePersistedView = (input: unknown) => {
  if (!isRecord(input) || !isRecord(input.view_data)) {
    return false;
  }
  const viewData = input.view_data;
  if (
    !isRecord(viewData.marks)
    || !isRecord(viewData.containers)
    || !isRecord(viewData.cache)
    || Object.keys(viewData.containers).length === 0
  ) {
    return false;
  }
  return [
    'size_range',
    'anchor_point',
    'link_nodes',
    'non_property',
  ].every((key) => isRecord(viewData.cache[key]));
};

const declaresStructuredView = (input: unknown) => {
  if (
    !isRecord(input)
    || !Object.prototype.hasOwnProperty.call(input, 'view_data')
  ) {
    return false;
  }
  if (!isRecord(input.view_data)) {
    return true;
  }
  return ['marks', 'containers', 'cache'].some((key) =>
    Object.prototype.hasOwnProperty.call(input.view_data, key),
  );
};

const extractAllContainers = (
  document: ChartDocument,
): VisualChartContainer[] => {
  const visit = (
    container: VisualChartContainer | undefined,
  ): VisualChartContainer[] => {
    if (!container) {
      return [];
    }
    const dsl = asVisualDSL(document);
    const current = {
      ...R.omit(['components', 'history', 'metadata', 'view_data', 'reference_state',
        'data_specification', 'template_data_specification', 'data_sources', 'color_scales',
        'data_mode', 'coordinate_guides'], container),
      __data_specification:
        dsl.data_specification?.[container.container_id],
      __temp_specification:
        dsl.template_data_specification?.[container.container_id],
    } as VisualChartContainer;
    return [
      current,
      ...(container.components?.flatMap((component) => visit(component)) || []),
    ];
  };
  return visit(asVisualDSL(document));
};

const hydrateChart = (
  input: unknown,
  chart: VisualChart,
  forceRegenerate = false,
  migrationOptions?: Pick<MigrationOptions, 'generationSeed'>,
): ChartDocument => {
  const hasCompleteView = hasCompletePersistedView(input);
  const document = migrationOptions
    ? migrateDocument(input, migrationOptions)
    : migrateDocument(input);
  const random = createSeededRandom(document.metadata.generation_seed);
  chart.setRandomGenerator(random.next);
  chart.reset();
  chart.parseDSL(asVisualDSL(document));

  if (!forceRegenerate && hasCompleteView) {
    chart.restoreViewSnapshot(asViewSnapshot(document.view_data));
    document.view_data = asPersistedViewData(chart.createViewSnapshot());
  } else {
    const generated = chart.createViewSnapshot();
    if (!forceRegenerate) {
      for (const [containerId, marks] of Object.entries(
        document.view_data.marks,
      )) {
        if (Object.prototype.hasOwnProperty.call(generated.marks, containerId)) {
          generated.marks[containerId] = cloneJson(marks) as
            VisualChartViewSnapshot['marks'][string];
        }
      }
    }
    document.view_data = asPersistedViewData(generated);
    chart.restoreViewSnapshot(generated);
  }

  return document;
};

const formatValidationIssues = (
  issues: ReturnType<typeof validateDocumentShape>['issues'],
) =>
  issues
    .map((issue) => `${issue.path || '<root>'}: ${issue.message}`)
    .join('; ');

export const validateRenderableDocument = (
  input: unknown,
  migrationOptions?: Pick<MigrationOptions, 'generationSeed'>,
): ChartDocument => {
  if (declaresStructuredView(input)) {
    const structuredValidation = validateDocumentShape(input, {
      requireEnhancedFields: true,
      validateReferences: true,
    });
    if (!structuredValidation.valid) {
      throw new Error(formatValidationIssues(structuredValidation.issues));
    }
  }

  const validation = validateDocumentShape(input, {
    requireEnhancedFields: false,
    validateReferences: true,
  });
  if (!validation.valid) {
    throw new Error(formatValidationIssues(validation.issues));
  }

  const chart = new VisualChart();
  const validatedDocument = hydrateChart(
    input,
    chart,
    false,
    migrationOptions,
  );
  assertValidDocument(validatedDocument, { validateReferences: true });

  if (typeof window !== 'undefined' && window.document) {
    const svg = window.document.createElementNS(
      'http://www.w3.org/2000/svg',
      'svg',
    );
    svg.classList.add('editor-preview');
    chart.initSVGDOM(svg);
    chart.drawData();
  }
  return validatedDocument;
};

const installDocument = (
  input: ChartDocument,
  options: { hash?: string | null } = {},
) => {
  const state = useChartStore.getState();
  const document = hydrateChart(input, state.chart);
  const allContainers = extractAllContainers(document);

  useChartStore.setState((draft) => {
    draft.dsl_json = document;
    draft.dsl_container = R.clone(state.chart.dsl_container);
    draft.dsl_data = R.clone(state.chart.dsl_data);
    draft.allContainers = allContainers;
    if (options.hash !== undefined) {
      draft.file_hash = options.hash;
    }

    const selectedId = draft.selectedContainerId;
    const selected = selectedId
      ? allContainers.find((container) => container.container_id === selectedId)
      : undefined;
    draft.selectedContainer = selected ? R.clone(selected) : null;
    if (!selected) {
      draft.selectedContainerId = null;
      draft.selectedContainerChildren = [];
    } else {
      draft.selectedContainerChildren = Object.values(
        state.chart.dsl_container,
      ).filter((container) => container.template_id === selectedId);
    }
  });

  state.chart.drawContainer(
    useChartStore.getState().hoveredContainerId ?? null,
  );
  state.chart.drawData();
};

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const isConflictError = (error: unknown) =>
  typeof error === 'object'
  && error !== null
  && 'status' in error
  && error.status === 409;

const withoutDocumentEnvelope = (input: unknown) => {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return input;
  }
  const value = cloneJson(input) as Record<string, unknown>;
  delete value.metadata;
  delete value.view_data;
  delete value.history;
  return value;
};

const hasDocumentEnvelope = (input: unknown) =>
  typeof input === 'object'
  && input !== null
  && !Array.isArray(input)
  && ['metadata', 'view_data', 'history'].some((key) =>
    Object.prototype.hasOwnProperty.call(input, key),
  );

const fallbackBaselineMatches = (
  current: ChartDocument | undefined,
  diskContent: unknown,
) => {
  if (!current) {
    return false;
  }
  if (hasDocumentEnvelope(diskContent)) {
    return jsonDeepEqual(current, diskContent);
  }
  return jsonDeepEqual(
    withoutDocumentEnvelope(current),
    withoutDocumentEnvelope(diskContent),
  );
};

let transactionTail: Promise<void> = Promise.resolve();

const enqueueTransaction = <Result,>(
  operation: () => Promise<Result>,
): Promise<Result> => {
  const result = transactionTail.then(operation, operation);
  transactionTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
};

const persistDocument = async (
  document: ChartDocument,
): Promise<string> => {
  const state = useChartStore.getState();
  const category = state.dsl_category;
  if (!category) {
    throw new Error('The current DSL category could not be resolved.');
  }

  let expectedHash = state.file_hash;

  try {
    if (!expectedHash) {
      const fallbackLatest = await loadDSLFile<unknown>(
        category,
        `${state.dsl_file}.json`,
      );
      expectedHash = fallbackLatest.hash;
      if (!fallbackBaselineMatches(state.dsl_json, fallbackLatest.content)) {
        throw Object.assign(
          new Error('The DSL file changed after the static fallback was loaded.'),
          { code: 'DSL_CONFLICT', status: 409 },
        );
      }
    }

    const result = await saveDSLFile(
      category,
      `${state.dsl_file}.json`,
      document,
      expectedHash,
    );
    return result.hash;
  } catch (error) {
    if (isConflictError(error) && typeof window !== 'undefined') {
      const force = window.confirm(
        'The DSL file changed on disk.\n\n'
          + 'Choose OK to force overwrite it, or Cancel to reload the '
          + 'external version.',
      );
      if (force) {
        const result = await saveDSLFile(
          category,
          `${state.dsl_file}.json`,
          document,
          expectedHash,
          true,
        );
        return result.hash;
      }

      const latest = await loadDSLFile<unknown>(
        category,
        `${state.dsl_file}.json`,
      );
      const reloaded = validateRenderableDocument(latest.content);
      installDocument(reloaded, { hash: latest.hash });
      showToast('External DSL changes reloaded.');
      throw new Error(
        'Save cancelled because the external DSL version was reloaded.',
      );
    }
    throw error;
  }
};

const persistAndInstall = async (
  candidate: ChartDocument,
): Promise<ChartDocument> => {
  const document = validateRenderableDocument(candidate);
  useChartStore.setState({
    isSaving: true,
    lastSaveError: null,
  });
  try {
    const hash = await persistDocument(document);
    installDocument(document, { hash });
    return document;
  } catch (error) {
    useChartStore.setState({ lastSaveError: errorMessage(error) });
    throw error;
  } finally {
    useChartStore.setState({ isSaving: false });
  }
};

const pathsRequireRegeneration = (paths: readonly string[]) =>
  paths.some((path) => {
    const segments = parseJsonPointer(path);
    if (segments[0] === 'view_data' || segments[0] === 'history' || segments[0] === 'coordinate_guides') {
      return false;
    }
    if (segments[0] === 'metadata') {
      return segments[1] === 'generation_seed';
    }
    return segments.at(-1) !== 'description';
  });

const collectAffectedSpecificationIds = (
  paths: readonly string[],
): Set<string> | null => {
  const ids = new Set<string>();
  for (const path of paths) {
    const segments = parseJsonPointer(path);
    if (
      segments[0] === 'data_specification'
      || segments[0] === 'template_data_specification'
    ) {
      if (!segments[1]) {
        return null;
      }
      ids.add(segments[1]);
      continue;
    }
    if (
      segments[0] === 'view_data'
      || segments[0] === 'history'
      || segments[0] === 'metadata'
      || segments.at(-1) === 'description'
    ) {
      continue;
    }
    return null;
  }
  return ids.size > 0 ? ids : null;
};

const isAffectedRuntimeKey = (
  key: string,
  ids: Set<string>,
  oldView: PersistedViewData,
  newView: PersistedViewData,
) => {
  const runtimeKey = key.startsWith('container_')
    ? key.slice('container_'.length)
    : key;
  const oldContainer = (
    oldView.containers[key] ?? oldView.containers[runtimeKey]
  ) as
    | { container_id?: unknown; template_id?: unknown }
    | undefined;
  const newContainer = (
    newView.containers[key] ?? newView.containers[runtimeKey]
  ) as
    | { container_id?: unknown; template_id?: unknown }
    | undefined;
  const candidates = [
    key,
    runtimeKey,
    oldContainer?.container_id,
    oldContainer?.template_id,
    newContainer?.container_id,
    newContainer?.template_id,
  ];
  return candidates.some(
    (candidate) => typeof candidate === 'string' && ids.has(candidate),
  );
};

const mergeRecordForIds = (
  previous: Record<string, unknown>,
  generated: Record<string, unknown>,
  isAffected: (key: string) => boolean,
) => {
  const result: Record<string, unknown> = {};
  for (const key of new Set([
    ...Object.keys(previous),
    ...Object.keys(generated),
  ])) {
    if (isAffected(key)) {
      if (Object.prototype.hasOwnProperty.call(generated, key)) {
        result[key] = cloneJson(generated[key]);
      }
    } else if (Object.prototype.hasOwnProperty.call(previous, key)) {
      result[key] = cloneJson(previous[key]);
    } else {
      result[key] = cloneJson(generated[key]);
    }
  }
  return result;
};

const mergeExplicitViewChanges = (
  base: unknown,
  explicit: unknown,
  regenerated: unknown,
): unknown => {
  if (jsonDeepEqual(base, explicit)) {
    return regenerated === undefined
      ? cloneJson(explicit)
      : cloneJson(regenerated);
  }
  if (!isRecord(base) || !isRecord(explicit)) {
    return cloneJson(explicit);
  }

  const result = isRecord(regenerated)
    ? cloneJson(regenerated)
    : {};
  for (const key of Object.keys(base)) {
    if (!Object.prototype.hasOwnProperty.call(explicit, key)) {
      delete result[key];
    }
  }
  for (const [key, value] of Object.entries(explicit)) {
    if (!Object.prototype.hasOwnProperty.call(base, key)) {
      result[key] = cloneJson(value);
      continue;
    }
    result[key] = mergeExplicitViewChanges(
      base[key],
      value,
      result[key],
    );
  }
  return result;
};

const regenerateAffectedViewData = (
  current: ChartDocument,
  nextInput: ChartDocument,
  paths: readonly string[],
): ChartDocument => {
  if (!pathsRequireRegeneration(paths)) {
    return nextInput;
  }

  const next = cloneJson(nextInput);
  const explicitView = cloneJson(next.view_data);
  const generator = new VisualChart();
  const generated = hydrateChart(next, generator, true).view_data;
  const affectedIds = paths.some(path => parseJsonPointer(path).includes('data_ref'))
    ? null : collectAffectedSpecificationIds(paths);
  let regeneratedView: PersistedViewData;
  if (!affectedIds) {
    regeneratedView = generated;
  } else {
    const affected = (key: string) =>
      isAffectedRuntimeKey(key, affectedIds, current.view_data, generated);
    regeneratedView = {
      ...cloneJson(current.view_data),
      containers: mergeRecordForIds(
        current.view_data.containers,
        generated.containers,
        affected,
      ),
      marks: mergeRecordForIds(
        current.view_data.marks,
        generated.marks,
        affected,
      ),
      cache: {
        ...cloneJson(current.view_data.cache),
        size_range: mergeRecordForIds(
          current.view_data.cache.size_range,
          generated.cache.size_range,
          affected,
        ),
        anchor_point: mergeRecordForIds(
          current.view_data.cache.anchor_point,
          generated.cache.anchor_point,
          affected,
        ),
        link_nodes: mergeRecordForIds(
          current.view_data.cache.link_nodes,
          generated.cache.link_nodes,
          affected,
        ),
        non_property: mergeRecordForIds(
          current.view_data.cache.non_property,
          generated.cache.non_property,
          affected,
        ),
      },
    };
  }
  next.view_data = mergeExplicitViewChanges(
    current.view_data,
    explicitView,
    regeneratedView,
  ) as PersistedViewData;
  return next;
};

/** Validate and regenerate an edit without installing or saving it. */
export const prepareDocumentEdit = (current: ChartDocument, input: unknown): ChartDocument => {
  let next = migrateDocument(input, {generationSeed: current.metadata.generation_seed});
  const paths = diffJson(current, next, {ignoredPaths: ['/history', '/metadata/updated_at']})
    .map(operation => operation.path);
  next = regenerateAffectedViewData(current, next, paths);
  return validateRenderableDocument(next);
};

const commitCandidate = async (
  nextInput: unknown,
  source: DocumentChangeSource,
  options: { regenerateManualView?: boolean } = {},
): Promise<DocumentCommitResult> => {
  const baseState = useChartStore.getState();
  const baseDocument = baseState.dsl_json;
  const baseFile = baseState.dsl_file;
  const baseCategory = baseState.dsl_category;
  const baseHash = baseState.file_hash;

  return enqueueTransaction(async () => {
    const activeState = useChartStore.getState();
    if (!baseDocument) {
      throw new Error('No DSL document is loaded.');
    }
    if (
      activeState.dsl_json !== baseDocument
      || activeState.dsl_file !== baseFile
      || activeState.dsl_category !== baseCategory
      || activeState.file_hash !== baseHash
    ) {
      throw new EditorStaleChangeError();
    }
    const current = baseDocument;

    const next = options.regenerateManualView
      ? prepareDocumentEdit(current, nextInput)
      : validateRenderableDocument(nextInput, {generationSeed: current.metadata.generation_seed});

    const result = commitDocument(current, next, {
      source,
      validateReferences: true,
    });
    if (!result.changed) {
      return result;
    }
    await persistAndInstall(result.document);
    return result;
  });
};

export const changeCoordinateGuides = async (guides: CoordinateGuides) => {
  const current = useChartStore.getState().dsl_json;
  if (!current) return;
  await commitCandidate({...cloneJson(current), coordinate_guides: guides}, 'form');
};

export const changeDataMode = async (mode: DataMode) => {
  const current = useChartStore.getState().dsl_json;
  if (!current) return;
  await commitCandidate(buildDataModeCandidate(current, mode), 'data-control');
  showToast(mode === 'reference' ? 'Reference data restored.' : 'New sample generated; shared data references preserved.');
};

export const initChart = async () => {
  const storedDslFile = readSelectedDslFile();
  const initialDslFile = useChartStore.getState().dsl_file;
  const hasStoredDslFile = storedDslFile !== null
    && isJsonFileName(storedDslFile);
  if (hasStoredDslFile) {
    await changeDslFile(storedDslFile);
    return;
  }
  const candidates: JsonFileName[] = hasStoredDslFile
    ? [
      storedDslFile,
      ...JSON_FILES.filter((file) => file !== storedDslFile),
    ]
    : storedDslFile === null
      ? [
        initialDslFile,
        ...JSON_FILES.filter((file) => file !== initialDslFile),
      ]
      : [...JSON_FILES];

  let lastError: unknown;
  for (const dslFile of candidates) {
    try {
      await changeDslFile(dslFile);
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error('No available DSL data source could be loaded.');
};

const loadDslFileIntoEditor = async (dslFile: JsonFileName) => {
  const category = await resolveDataCategory(dslFile);
  if (!category) {
    throw new Error(`Unable to locate DSL file "${dslFile}".`);
  }

  let raw: unknown;
  let hash: string | null = null;
  try {
    const loaded = await loadDSLFile<unknown>(category, `${dslFile}.json`);
    raw = loaded.content;
    hash = loaded.hash;
  } catch {
    raw = await loadData(dslFile);
  }
  if (!raw) {
    throw new Error(`Unable to load DSL file "${dslFile}".`);
  }

  const migrated = validateRenderableDocument(raw);
  useChartStore.setState((state) => {
    state.dsl_file = dslFile;
    state.dsl_category = category;
    state.file_hash = hash;
    state.selectedContainerId = null;
    state.selectedContainer = null;
    state.selectedContainerChildren = [];
    state.currentDataFormProp = DataFormProp.ALL;
  });
  installDocument(migrated, { hash });
  persistSelectedDslFile(dslFile);
};

export const changeDslFile = (dslFile: JsonFileName) =>
  enqueueTransaction(() => loadDslFileIntoEditor(dslFile));

export const handleHoverContainer = (containerId: string | null) => {
  useChartStore.setState({ hoveredContainerId: containerId });
  useChartStore.getState().chart.drawContainer(containerId);
};

export const handleChangeContainer = (containerId: string | null) => {
  useChartStore.setState((state) => {
    state.selectedContainerId = containerId;
    state.hoveredContainerId = null;
    state.selectedContainer = R.clone(
      state.allContainers.find(
        (container) => container.container_id === containerId,
      ),
    ) || null;
    state.selectedContainerChildren = Object.values(
      state.dsl_container,
    ).filter((item) => item.template_id === containerId);
    state.currentDataFormProp = DataFormProp.ALL;
  });
  useChartStore.getState().chart.drawContainer(null);
};

export const setReferenceImage = (dataUrl: string | null) => {
  useChartStore.setState({ referenceImage: dataUrl });
};

export const applyDataChanges = async (
  specType: 'template' | 'mark',
  jsonData: ContainerData,
) => {
  const state = useChartStore.getState();
  const current = state.dsl_json;
  if (!current) {
    return;
  }

  const chart = new VisualChart();
  hydrateChart(current, chart);
  const selectedId = state.selectedContainerId;
  const selectedChildren = Object.values(chart.dsl_container).filter(
    (container) => container.template_id === selectedId,
  );

  const bound = selectedChildren.filter(container => container.__data_specification?.data_ref);
  const sizeBinding = state.currentDataFormProp === DataFormProp.X_SIZE_RANGE || state.currentDataFormProp === DataFormProp.Y_SIZE_RANGE;
  const sourceAxis = [DataFormProp.X_ANCHOR_POSITION,DataFormProp.X_SIZE_RANGE].includes(state.currentDataFormProp) ? 'x'
    : [DataFormProp.Y_ANCHOR_POSITION,DataFormProp.Y_SIZE_RANGE].includes(state.currentDataFormProp) ? 'y' : null;
  if (specType === 'mark' && sourceAxis && bound.length) {
    const next = cloneJson(current);
    let changed = false;
    selectedChildren.forEach((container,index) => {
      const ref = container.__data_specification?.data_ref;
      const axis = container.coordinate === 'polar' ? (sourceAxis === 'x' ? 'angle' : 'radius') : sourceAxis;
      const binding = sizeBinding ? `${axis}_size` as const : axis;
      const field = ref?.[binding];
      const values = (jsonData as unknown as unknown[])[index];
      if (!ref || !field || values === undefined) return;
      const sources = next.data_sources as Record<string,{fields:Record<string,{values:number[]}>}>;
      sources[ref.source].fields[field].values = cloneJson(values) as number[];
      changed = true;
    });
    if (changed) {
      // Directly supplied values are fixed data; preserve all generator definitions.
      next.data_mode = 'reference';
      delete next.reference_state;
      await commitCandidate(next, 'data-control', {regenerateManualView:true});
      showToast('Shared source updated for all linked containers.');
      return;
    }
  }
  if (specType === 'mark' && state.currentDataFormProp === DataFormProp.ALL && bound.length) {
    throw new Error('These marks use data_ref. Edit shared anchors or data_sources so linked containers remain aligned.');
  }

  if (specType === 'template') {
    switch (state.currentDataFormProp) {
      case DataFormProp.ALL: {
        if (selectedId && Array.isArray(jsonData)) {
          for (const container of jsonData as unknown as VisualChartContainer[]) {
            if (chart.dsl_container[container.container_id]) {
              chart.dsl_container[container.container_id] = R.mergeDeepRight(
                chart.dsl_container[container.container_id],
                container,
              );
            }
          }
        }
        break;
      }
      case DataFormProp.X_SIZE_RANGE:
        if (chart.dsl_cache.size_range[`container_${selectedId}`]) {
          chart.dsl_cache.size_range[`container_${selectedId}`].x = jsonData;
          chart.parseContainer();
        }
        break;
      case DataFormProp.Y_SIZE_RANGE:
        if (chart.dsl_cache.size_range[`container_${selectedId}`]) {
          chart.dsl_cache.size_range[`container_${selectedId}`].y = jsonData;
          chart.parseContainer();
        }
        break;
      default:
        break;
    }
    chart.parseData();
  } else {
    switch (state.currentDataFormProp) {
      case DataFormProp.ALL:
        if (selectedChildren.length) {
          for (const container of selectedChildren) {
            if (jsonData?.[container.container_id]) {
              chart.dsl_data[container.container_id] =
                jsonData[container.container_id];
            }
          }
        } else {
          chart.dsl_data = jsonData || {};
        }
        break;
      case DataFormProp.X_SIZE_RANGE:
      case DataFormProp.Y_SIZE_RANGE:
      case DataFormProp.X_ANCHOR_POSITION:
      case DataFormProp.Y_ANCHOR_POSITION:
      case DataFormProp.NON_PROPERTY:
      case DataFormProp.LINK_NODES: {
        const values = jsonData as unknown as unknown[];
        selectedChildren.forEach((container, index) => {
          const value = values?.[index];
          if (value === undefined) {
            return;
          }
          const id = container.container_id;
          if (state.currentDataFormProp === DataFormProp.X_SIZE_RANGE) {
            chart.dsl_cache.size_range[id].x = value;
          } else if (state.currentDataFormProp === DataFormProp.Y_SIZE_RANGE) {
            chart.dsl_cache.size_range[id].y = value;
          } else if (
            state.currentDataFormProp === DataFormProp.X_ANCHOR_POSITION
          ) {
            chart.dsl_cache.anchor_point[id].x = value;
          } else if (
            state.currentDataFormProp === DataFormProp.Y_ANCHOR_POSITION
          ) {
            chart.dsl_cache.anchor_point[id].y = value;
          } else if (state.currentDataFormProp === DataFormProp.NON_PROPERTY) {
            chart.dsl_cache.non_property[id] = value;
          } else {
            chart.dsl_cache.link_nodes[id] = value;
          }
        });
        chart.parseData();
        break;
      }
      default:
        break;
    }
  }

  const next = cloneJson(current);
  if (state.currentDataFormProp === DataFormProp.LINK_NODES) {
    const dsl = next as unknown as VisualChartJsonData;
    for (const c of state.selectedContainerChildren) {
      const layout = dsl.data_specification?.[c.template_id]?.layout_specification;
      if (layout?.link_values !== undefined && chart.dsl_cache.link_nodes[c.container_id]) {
        layout.link_values = cloneJson(chart.dsl_cache.link_nodes[c.container_id]);
      }
    }
  }
  next.view_data = asPersistedViewData(chart.createViewSnapshot());
  await commitCandidate(next, 'data-control');
  showToast('Data changes applied and saved.');
};

export const applyContainerChanges = async () => {
  const state = useChartStore.getState();
  const current = state.dsl_json;
  const selected = state.selectedContainer;
  if (!current || !selected) {
    return;
  }

  const next = cloneJson(current);
  const updateContainer = (
    container: VisualChartContainer,
  ): VisualChartContainer => {
    if (container.container_id === selected.container_id) {
      return R.mergeDeepRight(
        container,
        R.omit(['components', '__data_specification', '__temp_specification'], selected),
      ) as VisualChartContainer;
    }
    // Preserve null or absent children on untouched leaves. Introducing an
    // explicit undefined value fails the document's JSON validation.
    return Array.isArray(container.components)
      ? {...container, components: container.components.map(updateContainer)}
      : container;
  };

  const updatedRoot = updateContainer(asVisualDSL(next));
  Object.assign(next, updatedRoot);
  if (selected.__data_specification) {
    const specifications =
      (next.data_specification as Record<string, unknown> | undefined) || {};
    specifications[selected.container_id] = R.mergeDeepRight(
      (specifications[selected.container_id] as object | undefined) || {},
      selected.__data_specification,
    );
    next.data_specification = specifications;
  }
  if (selected.__temp_specification) {
    const specifications =
      (next.template_data_specification as Record<string, unknown> | undefined)
      || {};
    specifications[selected.container_id] = R.mergeDeepRight(
      (specifications[selected.container_id] as object | undefined) || {},
      selected.__temp_specification,
    );
    next.template_data_specification = specifications;
  }

  for (const child of state.selectedContainerChildren) {
    const persisted = next.view_data.containers[child.container_id];
    if (persisted && !jsonDeepEqual(persisted.coordinate_system, child.coordinate_system)) {
      persisted.coordinate_system = cloneJson(child.coordinate_system);
    }
  }
  await commitCandidate(next, 'form', { regenerateManualView: true });
  showToast('Container changes applied and saved.');
};

export const changeDslJson = async (dslJson: unknown) => {
  await commitCandidate(dslJson, 'json', { regenerateManualView: true });
  showToast('JSON changes applied and saved.');
};

export const toggleShowContainers = () => {
  useChartStore.setState((state) => {
    state.showContainers = !state.showContainers;
  });
};

export const getRootCoordinateSystem = () => {
  const dsl = useChartStore.getState().dsl_json;
  const coordinateSystem = dsl?.coordinate_system;
  if (!coordinateSystem || typeof coordinateSystem !== 'object') {
    return {};
  }
  return Object.fromEntries(
    Object.entries(coordinateSystem).map(([key, value]) => [
      key,
      Number(value),
    ]),
  );
};

export const deleteContainer = async (containerId: string) => {
  const current = useChartStore.getState().dsl_json;
  if (!current) {
    return;
  }
  const next = cloneJson(current);
  const removeContainer = (container: VisualChartContainer) => {
    if (container.container_id === containerId) {
      return null;
    }
    return {
      ...container,
      components: container.components
        ?.map(removeContainer)
        .filter((value): value is VisualChartContainer => Boolean(value)),
    };
  };
  const root = removeContainer(asVisualDSL(next));
  if (!root) {
    throw new Error('The root container cannot be deleted.');
  }
  Object.assign(next, root);
  if (
    next.template_data_specification
    && typeof next.template_data_specification === 'object'
  ) {
    delete (
      next.template_data_specification as Record<string, unknown>
    )[containerId];
  }
  if (next.data_specification && typeof next.data_specification === 'object') {
    delete (next.data_specification as Record<string, unknown>)[containerId];
  }
  for (const child of state.selectedContainerChildren) {
    const persisted = next.view_data.containers[child.container_id];
    if (persisted && !jsonDeepEqual(persisted.coordinate_system, child.coordinate_system)) {
      persisted.coordinate_system = cloneJson(child.coordinate_system);
    }
  }
  await commitCandidate(next, 'form', { regenerateManualView: true });
  handleChangeContainer(null);
  showToast(`Container ${containerId} deleted and saved.`);
};

export const copyContainer = async (containerId: string) => {
  const current = useChartStore.getState().dsl_json;
  if (!current) {
    return;
  }
  const next = cloneJson(current);
  const dsl = asVisualDSL(next);
  const existingIds = new Set(extractAllContainers(next).map(
    (container) => container.container_id,
  ));
  const uniqueId = (base: string) => {
    let index = 1;
    let candidate = `${base}-copy`;
    while (existingIds.has(candidate)) {
      candidate = `${base}-copy-${index}`;
      index += 1;
    }
    existingIds.add(candidate);
    return candidate;
  };
  const cloneSubtree = (container: VisualChartContainer) => {
    const oldId = container.container_id;
    const newId = uniqueId(oldId);
    container.container_id = newId;
    if (container.template_id === oldId) {
      container.template_id = newId;
    }
    const dataSpecifications = dsl.data_specification;
    if (dataSpecifications?.[oldId]) {
      dataSpecifications[newId] = R.clone(dataSpecifications[oldId]);
    }
    const templateSpecifications = dsl.template_data_specification;
    if (templateSpecifications?.[oldId]) {
      templateSpecifications[newId] = R.clone(templateSpecifications[oldId]);
    }
    container.components?.forEach(cloneSubtree);
  };
  const findAndCopy = (container: VisualChartContainer): boolean => {
    for (let index = 0; index < (container.components?.length || 0); index += 1) {
      const child = container.components![index];
      if (child.container_id === containerId) {
        const copy = R.clone(child);
        cloneSubtree(copy);
        container.components!.splice(index + 1, 0, copy);
        return true;
      }
      if (findAndCopy(child)) {
        return true;
      }
    }
    return false;
  };
  if (!findAndCopy(dsl)) {
    throw new Error(`Container ${containerId} was not found.`);
  }
  for (const child of state.selectedContainerChildren) {
    const persisted = next.view_data.containers[child.container_id];
    if (persisted && !jsonDeepEqual(persisted.coordinate_system, child.coordinate_system)) {
      persisted.coordinate_system = cloneJson(child.coordinate_system);
    }
  }
  await commitCandidate(next, 'form', { regenerateManualView: true });
  showToast(`Container ${containerId} copied and saved.`);
};

const modelRootFromDocument = (document: ChartDocument) => {
  const snapshot = createModelDocumentSnapshot(document);
  const { view_data: viewData, ...dsl } = snapshot;
  return { dsl, viewData };
};

const validateModelPatchPointers = (patch: JsonPatch) => {
  for (const operation of patch) {
    const pointers = [
      operation.path,
      ...('from' in operation ? [operation.from] : []),
    ];
    for (const pointer of pointers) {
      const segments = parseJsonPointer(pointer);
      if (
        !['dsl', 'viewData'].includes(segments[0])
        || segments.some((segment) => segment === 'history')
      ) {
        throw new Error(
          `Model Patch path "${pointer}" is outside /dsl or /viewData.`,
        );
      }
    }
  }
};

export const getModelDocument = () => {
  const document = useChartStore.getState().dsl_json;
  if (!document) {
    throw new Error('No DSL document is loaded.');
  }
  return modelRootFromDocument(document);
};

export const applyAIPatch = async (
  modelPatch: readonly JsonPatchOperation[],
): Promise<DocumentHistoryEntry | null> =>
  enqueueTransaction(async () => {
    const current = useChartStore.getState().dsl_json;
    if (!current) {
      throw new Error('No DSL document is loaded.');
    }

    let result: DocumentCommitResult;
    try {
      const patch = cloneJson(modelPatch) as JsonPatch;
      validateModelPatchPointers(patch);
      const modelRoot = modelRootFromDocument(current);
      const patched = applyJsonPatch(modelRoot, patch);
      if (
        typeof patched.dsl !== 'object'
        || patched.dsl === null
        || Array.isArray(patched.dsl)
        || typeof patched.viewData !== 'object'
        || patched.viewData === null
        || Array.isArray(patched.viewData)
      ) {
        throw new Error('The model Patch produced an invalid document root.');
      }
      const candidate = {
        ...patched.dsl,
        view_data: patched.viewData,
        history: current.history,
      };
      const candidateValidation = validateDocumentShape(candidate, {
        requireEnhancedFields: true,
        validateReferences: true,
      });
      if (!candidateValidation.valid) {
        throw new Error(formatValidationIssues(candidateValidation.issues));
      }
      let migrated = validateRenderableDocument(candidate, {
        generationSeed: current.metadata.generation_seed,
      });
      if (
        migrated.metadata.schema_version
          !== current.metadata.schema_version
        || migrated.metadata.generator_version
          !== current.metadata.generator_version
      ) {
        throw new Error('The model cannot change document version metadata.');
      }
      const changedPaths = diffJson(current, migrated, {
        ignoredPaths: ['/history', '/metadata/updated_at'],
      }).map((operation) => operation.path);
      migrated = regenerateAffectedViewData(current, migrated, changedPaths);
      migrated = validateRenderableDocument(migrated);
      result = commitDocument(current, migrated, {
        source: 'ai',
        validateReferences: true,
      });
    } catch (error) {
      throw new EditorPatchValidationError(errorMessage(error), {
        cause: error,
      });
    }

    if (!result.changed) {
      return null;
    }
    await persistAndInstall(result.document);
    return result.entry || null;
  });

const persistHistoryTransition = async (
  transition: { changed: boolean; document: ChartDocument },
) => {
  if (!transition.changed) {
    return false;
  }
  await persistAndInstall(transition.document);
  return true;
};

export const undoEditorDocument = () =>
  enqueueTransaction(async () => {
    const current = useChartStore.getState().dsl_json;
    return current
      ? persistHistoryTransition(undoDocument(current))
      : false;
  });

export const redoEditorDocument = () =>
  enqueueTransaction(async () => {
    const current = useChartStore.getState().dsl_json;
    return current
      ? persistHistoryTransition(redoDocument(current))
      : false;
  });

export const jumpEditorHistory = (targetCursor: number) =>
  enqueueTransaction(async () => {
    const current = useChartStore.getState().dsl_json;
    return current
      ? persistHistoryTransition(jumpToHistory(current, targetCursor))
      : false;
  });

export const clearEditorHistory = () =>
  enqueueTransaction(async () => {
    const current = useChartStore.getState().dsl_json;
    if (!current) {
      return false;
    }
    await persistAndInstall(clearDocumentHistory(current));
    return true;
  });

export const getEditorHistory = () =>
  useChartStore.getState().dsl_json?.history;

// Helpful for local debugging without making the mutable chart object a
// persistence API.
declare global {
  interface Window {
    useChartStore?: typeof useChartStore;
  }
}

if (typeof window !== 'undefined') {
  window.useChartStore = useChartStore;
}
