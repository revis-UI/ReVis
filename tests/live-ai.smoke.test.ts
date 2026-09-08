import { expect, test } from 'vitest';

const LIVE_SMOKE_ENABLED = process.env.RUN_LIVE_AI_SMOKE === '1';
const LOCAL_API_ORIGIN = 'http://127.0.0.1:3000';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractPatch(payload: unknown): unknown {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (!isRecord(payload)) {
    return undefined;
  }
  if (Array.isArray(payload.patch)) {
    return payload.patch;
  }
  return isRecord(payload.data) && Array.isArray(payload.data.patch)
    ? payload.data.patch
    : undefined;
}

function extractSummary(payload: unknown): unknown {
  if (!isRecord(payload)) {
    return undefined;
  }
  if (isRecord(payload.summary)) {
    return payload.summary;
  }
  return isRecord(payload.data) && isRecord(payload.data.summary)
    ? payload.data.summary
    : undefined;
}

function isJsonPatchOperation(value: unknown): boolean {
  if (
    !isRecord(value) ||
    typeof value.op !== 'string' ||
    typeof value.path !== 'string'
  ) {
    return false;
  }

  if (!['add', 'remove', 'replace', 'move', 'copy', 'test'].includes(value.op)) {
    return false;
  }
  if (['add', 'replace', 'test'].includes(value.op) && !('value' in value)) {
    return false;
  }
  if (['move', 'copy'].includes(value.op) && typeof value.from !== 'string') {
    return false;
  }
  return true;
}

const liveTest = LIVE_SMOKE_ENABLED ? test : test.skip;

liveTest(
  'configured local AI proxy returns a structured RFC 6902 edit result',
  async (context) => {
    let configResponse: Response;
    try {
      configResponse = await fetch(`${LOCAL_API_ORIGIN}/api/ai/config`);
    } catch {
      context.skip();
      return;
    }

    if (!configResponse.ok) {
      context.skip();
      return;
    }

    const configPayload = await configResponse.json() as unknown;
    const config = isRecord(configPayload) && isRecord(configPayload.config)
      ? configPayload.config
      : configPayload;
    if (
      !isRecord(config) ||
      typeof config.baseUrl !== 'string' ||
      !config.baseUrl ||
      typeof config.model !== 'string' ||
      !config.model ||
      config.hasApiKey !== true
    ) {
      context.skip();
      return;
    }

    const response = await fetch(`${LOCAL_API_ORIGIN}/api/ai/chat`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        instruction:
          'Replace /dsl/smoke_marker with "live-smoke" and summarize the change.',
        dsl: { smoke_marker: 'before' },
        viewData: {},
        recentInstructions: [],
      }),
    });

    expect(response.ok).toBe(true);
    const payload = await response.json() as unknown;
    const patch = extractPatch(payload);
    expect(Array.isArray(patch)).toBe(true);
    expect(patch).not.toHaveLength(0);
    expect((patch as unknown[]).every(isJsonPatchOperation)).toBe(true);

    const summary = extractSummary(payload);
    if (summary !== undefined) {
      expect(summary).toMatchObject({
        title: expect.any(String),
        overview: expect.any(String),
        changes: expect.any(Array),
      });
    }

    // The local proxy may include bounded semantic text and transport metadata,
    // but it never exposes a raw provider response.
    if (isRecord(payload)) {
      expect(payload).not.toHaveProperty('message');
      expect(payload).not.toHaveProperty('choices');
    }
  },
  180_000,
);
