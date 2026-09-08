import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { DataFormProp } from '../type';
import {
  EditorPatchValidationError,
  EditorStaleChangeError,
  SELECTED_DSL_FILE_STORAGE_KEY,
  applyAIPatch,
  applyContainerChanges,
  handleChangeContainer,
  changeDslJson,
  changeDslFile,
  initChart,
  redoEditorDocument,
  undoEditorDocument,
  useChartStore,
} from './editor';
import { migrateDocument, type ChartDocument } from './document';
import { VisualChart } from './Chart';
import {
  applyJsonPatch,
  type JsonPatchOperation,
} from './jsonPatch';
import { createSeededRandom } from './seededRandom';

const loadFixture = (path: string) => JSON.parse(
  readFileSync(
    resolve(process.cwd(), path),
    'utf8',
  ),
) as unknown;

const createPersistedFixture = (raw: unknown, generationSeed: string) => {
  const chart = new VisualChart();
  chart.setRandomGenerator(createSeededRandom(generationSeed).next);
  chart.parseDSL(raw as object);
  return migrateDocument(raw, {
    generationSeed,
    now: '2026-01-01T00:00:00.000Z',
    viewData: chart.createViewSnapshot() as unknown as Record<string, unknown>,
  });
};

const rawDsl = loadFixture(
  'src/datav3/basic_charts/01_simple_bar_chart.json',
);
const persistedDsl = createPersistedFixture(rawDsl, 'editor-test-seed');
const rawTemplateDsl = loadFixture(
  'src/datav3/composite/01_grid_bar_chart.json',
);
const persistedTemplateDsl = createPersistedFixture(
  rawTemplateDsl,
  'template-editor-test-seed',
);

interface PutRequest {
  body: {
    content: ChartDocument;
    expectedHash: string | null;
    force: boolean;
  };
  url: string;
}

interface LoadedFile {
  content: unknown;
  hash: string;
}

const response = (payload: unknown, status = 200): Response => ({
  json: async () => payload,
  ok: status >= 200 && status < 300,
  status,
} as Response);

const resetEditorStore = () => {
  const initial = useChartStore.getInitialState();
  useChartStore.setState({
    ...initial,
    allContainers: [],
    chart: new VisualChart(),
    currentDataFormProp: DataFormProp.ALL,
    dsl_category: null,
    dsl_container: {},
    dsl_data: {},
    dsl_json: undefined,
    file_hash: null,
    hoveredContainerId: null,
    isSaving: false,
    lastSaveError: null,
    referenceImage: null,
    selectedContainer: null,
    selectedContainerChildren: [],
    selectedContainerId: null,
    showContainers: false,
  }, true);
};

describe('editor document transactions', () => {
  let putRequests: PutRequest[];
  let saveStatuses: number[];
  let saveCount: number;
  let fetchMock: ReturnType<typeof vi.fn>;
  let confirmSpy: ReturnType<typeof vi.spyOn>;
  let getRequests: string[];
  let loadedFiles: Record<string, LoadedFile>;
  let onPutRequest: (() => void) | null;
  let saveGate: Promise<void> | null;

  beforeEach(async () => {
    putRequests = [];
    saveStatuses = [];
    saveCount = 0;
    getRequests = [];
    loadedFiles = {
      '01_simple_bar_chart.json': {
        content: structuredClone(persistedDsl),
        hash: 'hash-0',
      },
    };
    onPutRequest = null;
    saveGate = null;
    window.localStorage.clear();
    resetEditorStore();

    fetchMock = vi.fn(async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (method === 'GET') {
        getRequests.push(url);
        const file = decodeURIComponent(url.split('/').at(-1) || '');
        const loaded = loadedFiles[file];
        if (!loaded) {
          return response({ error: `Unexpected file ${file}` }, 404);
        }
        return response({
          category: 'basic_charts',
          content: structuredClone(loaded.content),
          file,
          hash: loaded.hash,
        });
      }

      if (method !== 'PUT') {
        return response({ error: `Unexpected method ${method}` }, 405);
      }

      const body = JSON.parse(String(init?.body)) as PutRequest['body'];
      putRequests.push({ body, url });
      onPutRequest?.();
      if (saveGate) {
        await saveGate;
      }
      const status = saveStatuses.shift() ?? 200;
      if (status >= 400) {
        return response({ error: 'Disk write failed' }, status);
      }

      saveCount += 1;
      return response({
        category: 'basic_charts',
        file: decodeURIComponent(url.split('/').at(-1) || ''),
        hash: `hash-${saveCount}`,
        success: true,
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    await changeDslFile('01_simple_bar_chart');
    fetchMock.mockClear();
    getRequests = [];
  });

  it.each(['null', 'omitted'])('applies a composite form edit while preserving %s sibling children', async (shape) => {
    const raw = loadFixture('src/datav3/composite/14_line_and_area.json') as any;
    // Exercise the editable range, independent of the curated fixed widths.
    delete raw.data_specification['0-0'].layout_specification.y.data_values;
    if (shape === 'omitted') delete raw.components[1].components;
    else raw.components[1].components = null;
    loadedFiles['14_line_and_area.json'] = {
      content: createPersistedFixture(raw, 'form-composite'), hash: 'line-area-hash',
    };
    await changeDslFile('14_line_and_area');
    handleChangeContainer('0-0');
    const selected = structuredClone(useChartStore.getState().selectedContainer)!;
    selected.__data_specification!.layout_specification.y!.size_range = [30, 30];
    useChartStore.setState({selectedContainer: selected});
    await applyContainerChanges();
    const saved = putRequests.at(-1)!.body.content as any;
    expect(saved.data_specification['0-0'].layout_specification.y.size_range).toEqual([30,30]);
    expect(saved.components[1]).toEqual(raw.components[1]);
    const marks = saved.view_data.marks['0-0'].flat();
    expect(marks.length).toBeGreaterThan(0);
    marks.forEach((m:any)=>expect(m.y2-m.y1).toBeCloseTo(30));
    loadedFiles['14_line_and_area.json'] = {content:saved,hash:'reloaded-hash'};
    await changeDslFile('14_line_and_area');
    expect(useChartStore.getState().dsl_json!.view_data.marks).toEqual(saved.view_data.marks);
  });

  afterEach(() => {
    confirmSpy.mockRestore();
    vi.unstubAllGlobals();
    window.localStorage.clear();
    resetEditorStore();
    document.body.replaceChildren();
  });

  it('keeps document history out of the selectable root container', async () => {
    await changeDslFile('01_simple_bar_chart');
    handleChangeContainer('0');
    const state = useChartStore.getState();
    expect(state.dsl_json?.history).toBeDefined();
    expect(state.selectedContainer).not.toHaveProperty('history');
    expect(state.selectedContainer).not.toHaveProperty('view_data');
    expect(state.selectedContainer?.__data_specification).toBeDefined();
  });

  it('persists a successfully selected DSL data source', async () => {
    loadedFiles['02_radial_bar_chart.json'] = {
      content: structuredClone(persistedDsl),
      hash: 'second-file-hash',
    };

    await changeDslFile('02_radial_bar_chart');

    expect(window.localStorage.getItem(SELECTED_DSL_FILE_STORAGE_KEY)).toBe(
      '02_radial_bar_chart',
    );
  });

  it('restores the last selected DSL data source when the editor opens', async () => {
    loadedFiles['02_radial_bar_chart.json'] = {
      content: structuredClone(persistedDsl),
      hash: 'second-file-hash',
    };
    window.localStorage.setItem(
      SELECTED_DSL_FILE_STORAGE_KEY,
      '02_radial_bar_chart',
    );
    fetchMock.mockClear();
    getRequests = [];

    await initChart();

    expect(useChartStore.getState().dsl_file).toBe('02_radial_bar_chart');
    expect(getRequests).toEqual([
      '/api/dsl/basic_charts/02_radial_bar_chart.json',
    ]);
  });

  it('falls back to the first available DSL data source when cached data is gone', async () => {
    window.localStorage.setItem(
      SELECTED_DSL_FILE_STORAGE_KEY,
      'removed-data-source',
    );
    fetchMock.mockClear();
    getRequests = [];

    await initChart();

    expect(useChartStore.getState().dsl_file).toBe('01_simple_bar_chart');
    expect(getRequests).toEqual([
      '/api/dsl/basic_charts/01_simple_bar_chart.json',
    ]);
    expect(window.localStorage.getItem(SELECTED_DSL_FILE_STORAGE_KEY)).toBe(
      '01_simple_bar_chart',
    );
  });

  it('records a successful AI patch and persists it with PUT', async () => {
    const entry = await applyAIPatch([
      {
        op: 'replace',
        path: '/dsl/description',
        value: 'AI-updated description',
      },
    ]);

    const state = useChartStore.getState();
    expect(entry?.source).toBe('ai');
    expect(state.dsl_json?.description).toBe('AI-updated description');
    expect(state.dsl_json?.history.entries).toHaveLength(1);
    expect(state.dsl_json?.history.entries[0].source).toBe('ai');
    expect(state.dsl_json?.history.cursor).toBe(1);
    expect(putRequests).toHaveLength(1);
    expect(putRequests[0].url).toBe(
      '/api/dsl/basic_charts/01_simple_bar_chart.json',
    );
    expect(putRequests[0].body.expectedHash).toBe('hash-0');
    expect(putRequests[0].body.content.description).toBe(
      'AI-updated description',
    );
    expect(putRequests[0].body.content.history?.entries?.[0].source).toBe('ai');
  });

  it('does not save an empty AI patch', async () => {
    const before = useChartStore.getState().dsl_json;
    const entry = await applyAIPatch([]);

    expect(entry).toBeNull();
    expect(useChartStore.getState().dsl_json).toBe(before);
    expect(useChartStore.getState().dsl_json?.history.entries).toHaveLength(0);
    expect(putRequests).toHaveLength(0);
  });

  it.each<{
    label: string;
    patch: JsonPatchOperation[];
  }>([
    {
      label: 'an unknown link reference',
      patch: [{
        op: 'replace',
        path: '/dsl/data_specification/0/layout_specification/source',
        value: [{ container_id: 'missing', linked_object: 'mark' }],
      }],
    },
    {
      label: 'a document that cannot be rendered',
      patch: [{
        op: 'remove',
        path: '/dsl/data_specification/0',
      }],
    },
    {
      label: 'a ghost persisted mark',
      patch: [{
        op: 'add',
        path: '/viewData/marks/ghost',
        value: [{ id: 'ghost__0', props: {} }],
      }],
    },
  ])('atomically rejects $label', async ({ patch }) => {
    const before = useChartStore.getState().dsl_json;
    const beforeValue = structuredClone(before);

    await expect(applyAIPatch(patch)).rejects.toBeInstanceOf(
      EditorPatchValidationError,
    );

    const state = useChartStore.getState();
    expect(state.dsl_json).toBe(before);
    expect(state.dsl_json).toEqual(beforeValue);
    expect(state.dsl_json?.history.entries).toHaveLength(0);
    expect(state.lastSaveError).toBeNull();
    expect(putRequests).toHaveLength(0);
  });

  it('canonicalizes an empty view-only patch without saving it', async () => {
    const before = useChartStore.getState().dsl_json;

    const entry = await applyAIPatch([
      {
        op: 'replace',
        path: '/viewData',
        value: {
          cache: {
            anchor_point: {},
            link_nodes: {},
            non_property: {},
            size_range: {},
          },
          containers: {},
          marks: {},
        },
      },
    ]);

    expect(entry).toBeNull();
    expect(useChartStore.getState().dsl_json).toBe(before);
    expect(useChartStore.getState().dsl_json?.history.entries).toHaveLength(0);
    expect(putRequests).toHaveLength(0);
  });

  it('does not install a valid candidate when persistence returns 500', async () => {
    const before = useChartStore.getState().dsl_json;
    const beforeValue = structuredClone(before);
    saveStatuses.push(500);

    await expect(applyAIPatch([
      {
        op: 'replace',
        path: '/dsl/description',
        value: 'must not be installed',
      },
    ])).rejects.toThrow('Disk write failed');

    const state = useChartStore.getState();
    expect(putRequests).toHaveLength(1);
    expect(state.dsl_json).toBe(before);
    expect(state.dsl_json).toEqual(beforeValue);
    expect(state.dsl_json?.history.entries).toHaveLength(0);
    expect(state.file_hash).toBe('hash-0');
    expect(state.isSaving).toBe(false);
    expect(state.lastSaveError).toBe('Disk write failed');
  });

  it('detects an external change before the first fallback save', async () => {
    loadedFiles['01_simple_bar_chart.json'] = {
      content: {
        ...structuredClone(persistedDsl),
        description: 'externally changed description',
      },
      hash: 'external-hash',
    };
    useChartStore.setState({ file_hash: null });

    await expect(applyAIPatch([
      {
        op: 'replace',
        path: '/dsl/description',
        value: 'local AI description',
      },
    ])).rejects.toThrow(
      'Save cancelled because the external DSL version was reloaded.',
    );

    const state = useChartStore.getState();
    expect(getRequests).toEqual([
      '/api/dsl/basic_charts/01_simple_bar_chart.json',
      '/api/dsl/basic_charts/01_simple_bar_chart.json',
    ]);
    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(putRequests).toHaveLength(0);
    expect(state.dsl_json?.description).toBe(
      'externally changed description',
    );
    expect(state.dsl_json?.history.entries).toHaveLength(0);
    expect(state.file_hash).toBe('external-hash');
  });

  it('reloads a fresh disk version after a PUT-time fallback conflict', async () => {
    useChartStore.setState({ file_hash: null });
    saveStatuses.push(409);
    onPutRequest = () => {
      loadedFiles['01_simple_bar_chart.json'] = {
        content: {
          ...structuredClone(persistedDsl),
          description: 'changed between preflight and PUT',
        },
        hash: 'raced-external-hash',
      };
      onPutRequest = null;
    };

    await expect(applyAIPatch([
      {
        op: 'replace',
        path: '/dsl/description',
        value: 'local raced description',
      },
    ])).rejects.toThrow(
      'Save cancelled because the external DSL version was reloaded.',
    );

    const state = useChartStore.getState();
    expect(putRequests).toHaveLength(1);
    expect(putRequests[0].body.expectedHash).toBe('hash-0');
    expect(getRequests).toEqual([
      '/api/dsl/basic_charts/01_simple_bar_chart.json',
      '/api/dsl/basic_charts/01_simple_bar_chart.json',
    ]);
    expect(state.dsl_json?.description).toBe(
      'changed between preflight and PUT',
    );
    expect(state.file_hash).toBe('raced-external-hash');
  });

  it('serializes file switching behind an in-flight save', async () => {
    loadedFiles['02_radial_bar_chart.json'] = {
      content: {
        ...structuredClone(persistedDsl),
        description: 'second file description',
      },
      hash: 'second-file-hash',
    };
    let releaseSave!: () => void;
    saveGate = new Promise<void>((resolveGate) => {
      releaseSave = resolveGate;
    });
    const staleCandidate = structuredClone(
      useChartStore.getState().dsl_json!,
    );
    staleCandidate.description = 'stale manual description';

    const save = applyAIPatch([
      {
        op: 'replace',
        path: '/dsl/description',
        value: 'first file saved description',
      },
    ]);
    await vi.waitFor(() => {
      expect(putRequests).toHaveLength(1);
    });

    const switchFile = changeDslFile('02_radial_bar_chart');
    const staleChange = changeDslJson(staleCandidate).then(
      () => null,
      (error: unknown) => error,
    );
    try {
      await new Promise<void>((resolveDelay) => {
        window.setTimeout(resolveDelay, 25);
      });
      expect(getRequests).toHaveLength(0);
      expect(useChartStore.getState().dsl_file).toBe(
        '01_simple_bar_chart',
      );
    } finally {
      releaseSave();
    }

    await save;
    await switchFile;
    const staleError = await staleChange;

    const state = useChartStore.getState();
    expect(staleError).toBeInstanceOf(EditorStaleChangeError);
    expect(putRequests[0].url).toBe(
      '/api/dsl/basic_charts/01_simple_bar_chart.json',
    );
    expect(putRequests[0].body.content.description).toBe(
      'first file saved description',
    );
    expect(getRequests).toEqual([
      '/api/dsl/basic_charts/02_radial_bar_chart.json',
    ]);
    expect(state.dsl_file).toBe('02_radial_bar_chart');
    expect(state.dsl_json?.description).toBe('second file description');
    expect(state.file_hash).toBe('second-file-hash');
    expect(putRequests).toHaveLength(1);
  });

  it('regenerates persisted view data after an AI rendering change', async () => {
    const before = structuredClone(useChartStore.getState().dsl_json!);
    const previousMarks = structuredClone(
      before.view_data.marks['0'],
    );

    const entry = await applyAIPatch([
      {
        op: 'replace',
        path:
          '/dsl/data_specification/0/non_layout_specification/fill/fix',
        value: '#ff0000',
      },
      {
        op: 'add',
        path: '/viewData/cache/size_range/model_note',
        value: { source: 'explicit AI view edit' },
      },
      {
        op: 'replace',
        path: '/dsl/coordinate_system/x2',
        value: '90',
      },
    ]);

    const state = useChartStore.getState();
    const marks = state.dsl_json?.view_data.marks['0'] as
      | { props?: { fill?: unknown } }[]
      | undefined;
    expect(marks).not.toEqual(previousMarks);
    expect(marks).not.toHaveLength(0);
    expect(marks?.every((mark) => mark.props?.fill === '#ff0000')).toBe(true);
    expect(state.dsl_json?.view_data.cache.size_range.model_note).toEqual({
      source: 'explicit AI view edit',
    });
    expect(entry?.affected_paths).toContain(
      '/data_specification/0/non_layout_specification/fill/fix',
    );
    expect(entry?.affected_paths.some(
      (path) => path.startsWith('/view_data/'),
    )).toBe(true);

    const savedMarks = putRequests[0].body.content.view_data.marks['0'] as
      { props?: { fill?: unknown } }[];
    expect(savedMarks.every(
      (mark) => mark.props?.fill === '#ff0000',
    )).toBe(true);
    expect(
      putRequests[0].body.content.view_data.cache.size_range.model_note,
    ).toEqual({ source: 'explicit AI view edit' });

    const replayed = applyJsonPatch(before, entry!.forward_patch);
    expect(replayed.view_data).toEqual(state.dsl_json?.view_data);
    expect(replayed.data_specification).toEqual(
      state.dsl_json?.data_specification,
    );
  });

  it('upgrades a legacy marks map into a complete view snapshot', async () => {
    const legacy = structuredClone(persistedDsl) as Record<string, unknown>;
    legacy.view_data = structuredClone(persistedDsl.view_data.marks);
    loadedFiles['01_simple_bar_chart.json'] = {
      content: legacy,
      hash: 'legacy-view-hash',
    };

    await changeDslFile('01_simple_bar_chart');

    const state = useChartStore.getState();
    expect(state.file_hash).toBe('legacy-view-hash');
    expect(state.dsl_json?.view_data.marks).toEqual(
      persistedDsl.view_data.marks,
    );
    expect(Object.keys(state.dsl_json?.view_data.containers || {})).not
      .toHaveLength(0);
    expect(
      state.dsl_json?.view_data.cache.size_range['0'],
    ).toBeDefined();
    expect(Object.keys(state.chart.dsl_container)).not.toHaveLength(0);
    expect(putRequests).toHaveLength(0);
  });

  it('rejects an invalid complete view before installing a loaded file', async () => {
    const before = useChartStore.getState().dsl_json;
    const invalid = structuredClone(persistedDsl);
    invalid.view_data.marks.ghost = [{ id: 'ghost__0', props: {} }];
    loadedFiles['01_simple_bar_chart.json'] = {
      content: invalid,
      hash: 'invalid-view-hash',
    };

    await expect(
      changeDslFile('01_simple_bar_chart'),
    ).rejects.toThrow('unknown persisted container');

    const state = useChartStore.getState();
    expect(state.dsl_json).toBe(before);
    expect(state.file_hash).toBe('hash-0');
    expect(putRequests).toHaveLength(0);
  });

  it('regenerates container-prefixed template cache entries', async () => {
    loadedFiles['01_grid_bar_chart.json'] = {
      content: structuredClone(persistedTemplateDsl),
      hash: 'template-hash',
    };
    await changeDslFile('01_grid_bar_chart');
    putRequests = [];

    const beforeCache = structuredClone(
      useChartStore.getState().dsl_json?.view_data.cache
        .size_range['container_0-a'],
    );
    await applyAIPatch([
      {
        op: 'replace',
        path:
          '/dsl/template_data_specification/0-a'
          + '/data_structure/data_size/primary/number',
        value: 4,
      },
    ]);

    const state = useChartStore.getState();
    const nextCache =
      state.dsl_json?.view_data.cache.size_range['container_0-a'];
    const expectedChart = new VisualChart();
    expectedChart.setRandomGenerator(
      createSeededRandom(
        state.dsl_json!.metadata.generation_seed,
      ).next,
    );
    expectedChart.parseDSL(state.dsl_json as object);
    const expectedCache = expectedChart.createViewSnapshot()
      .cache.size_range['container_0-a'];

    expect(beforeCache).toBeDefined();
    expect(nextCache).not.toEqual(beforeCache);
    expect(nextCache).toEqual(expectedCache);
    expect(
      putRequests[0].body.content.view_data.cache
        .size_range['container_0-a'],
    ).toEqual(expectedCache);
  });

  it('persists undo and redo while moving the history cursor', async () => {
    const originalDescription = useChartStore.getState().dsl_json?.description;
    await applyAIPatch([
      {
        op: 'replace',
        path: '/dsl/description',
        value: 'undoable description',
      },
    ]);

    await expect(undoEditorDocument()).resolves.toBe(true);
    let state = useChartStore.getState();
    expect(state.dsl_json?.description).toBe(originalDescription);
    expect(state.dsl_json?.history.cursor).toBe(0);
    expect(state.file_hash).toBe('hash-2');

    await expect(redoEditorDocument()).resolves.toBe(true);
    state = useChartStore.getState();
    expect(state.dsl_json?.description).toBe('undoable description');
    expect(state.dsl_json?.history.cursor).toBe(1);
    expect(state.file_hash).toBe('hash-3');

    expect(putRequests).toHaveLength(3);
    expect(putRequests.map(({ body }) => body.content.history?.cursor)).toEqual([
      1,
      0,
      1,
    ]);
    expect(putRequests.map(({ body }) => body.expectedHash)).toEqual([
      'hash-0',
      'hash-1',
      'hash-2',
    ]);
    expect(confirmSpy).not.toHaveBeenCalled();
  });
  it('applies edited template instance coordinates and restores them with undo', async () => {
    loadedFiles['01_grid_bar_chart.json'] = {content: structuredClone(persistedTemplateDsl), hash: 'template-hash'};
    await changeDslFile('01_grid_bar_chart');
    const template = useChartStore.getState().allContainers.find(c => c.__temp_specification)!;
    handleChangeContainer(template.container_id);
    const children = structuredClone(useChartStore.getState().selectedContainerChildren);
    expect(children.length).toBeGreaterThan(0);
    const id = children[0].container_id;
    const before = structuredClone(children[0].coordinate_system);
    children[0].coordinate_system.x1 = Number(before.x1) + 1;
    useChartStore.setState({selectedContainerChildren:children});
    await applyContainerChanges();
    expect(useChartStore.getState().dsl_json!.view_data.containers[id].coordinate_system).toEqual(children[0].coordinate_system);
    await undoEditorDocument();
    expect(useChartStore.getState().dsl_json!.view_data.containers[id].coordinate_system).toEqual(before);
  });

});
