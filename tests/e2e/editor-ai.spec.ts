import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, test, type Page, type Route } from '@playwright/test';

const DATA_SHARING_STORAGE_KEY =
  'vitejs-d3.ai.confirmed-data-destinations.v1';
const MOCK_BASE_URL = 'https://mock-model.example.test/v1';
const MOCK_API_KEY = 'e2e-key-that-never-leaves-playwright';

type JsonRecord = Record<string, unknown>;

function jsonResponse(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

function sseResponse(route: Route, result: JsonRecord) {
  const body = [
    `event: status\ndata: ${JSON.stringify({
      phase: 'connecting',
      message: 'Connecting to the configured model…',
    })}\n`,
    `event: status\ndata: ${JSON.stringify({
      phase: 'generating',
      message: 'Drafting a safe JSON Patch…',
    })}\n`,
    `event: status\ndata: ${JSON.stringify({
      phase: 'validating',
      message: 'Checking the complete Patch before it can change your document…',
    })}\n`,
    `event: result\ndata: ${JSON.stringify(result)}\n`,
    'event: done\ndata: {}\n',
  ].join('\n');
  return route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body,
  });
}

function hashDocument(document: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(document))
    .digest('hex');
}

async function installApiMocks(page: Page) {
  const fixturePath = path.join(
    process.cwd(),
    'src/datav3/composite/07_iForest.json',
  );
  const fixtureDocument = JSON.parse(
    await readFile(fixturePath, 'utf8'),
  ) as JsonRecord;
  let persistedDocument: JsonRecord = {
    ...fixtureDocument,
    history: { cursor: 0, entries: [] },
  };
  let currentHash = hashDocument(persistedDocument);
  let configured = false;

  const configRequests: JsonRecord[] = [];
  const chatRequests: JsonRecord[] = [];
  const dslSaves: JsonRecord[] = [];

  await page.route('**/api/ai/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (pathname === '/api/ai/config' && request.method() === 'GET') {
      return jsonResponse(route, {
        config: configured
          ? {
              baseUrl: MOCK_BASE_URL,
              model: 'mock-patch-model',
              temperature: 0,
              maxOutputTokens: 65536,
              timeoutMs: 600000,
              contextWindow: 128000,
              supportsVision: false,
              hasApiKey: true,
            }
          : {
              baseUrl: '',
              model: '',
              temperature: 0,
              maxOutputTokens: 65536,
              timeoutMs: 600000,
              contextWindow: 128000,
              supportsVision: false,
              hasApiKey: false,
            },
      });
    }

    if (pathname === '/api/ai/config' && request.method() === 'PUT') {
      const body = request.postDataJSON() as JsonRecord;
      configRequests.push(body);
      configured = true;
      return jsonResponse(route, {
        saved: true,
        config: {
          baseUrl: body.baseUrl,
          model: body.model,
          temperature: body.temperature,
          maxOutputTokens: body.maxOutputTokens,
          timeoutMs: body.timeoutMs,
          contextWindow: body.contextWindow,
          supportsVision: body.supportsVision,
          hasApiKey: true,
        },
        test: {
          ok: true,
          message: 'Connection successful.',
          latencyMs: 12,
        },
      });
    }

    if (pathname === '/api/ai/config/test' && request.method() === 'POST') {
      return jsonResponse(route, {
        ok: true,
        message: 'Connection successful.',
        latencyMs: 12,
      });
    }

    if (pathname === '/api/ai/chat/stream' && request.method() === 'POST') {
      const body = request.postDataJSON() as JsonRecord;
      chatRequests.push(body);
      return sseResponse(route, {
        patch: [
          {
            op: 'replace',
            path: '/dsl/description',
            value: 'Description updated by the mocked AI.',
          },
        ],
        summary: {
          title: 'Clarified the chart description',
          overview: 'The chart now communicates its purpose more clearly.',
          changes: [
            {
              area: 'dsl',
              description: 'Rewrote the top-level description for clarity.',
            },
          ],
        },
        meta: {
          structuredOutput: true,
          usage: {
            promptTokens: 100,
            completionTokens: 20,
            totalTokens: 120,
          },
        },
      });
    }

    return jsonResponse(
      route,
      { error: { code: 'UNEXPECTED_AI_ROUTE', message: pathname } },
      404,
    );
  });

  await page.route('**/api/dsl/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    expect(pathname).toBe('/api/dsl/composite/07_iForest.json');

    if (request.method() === 'GET') {
      return jsonResponse(route, {
        content: persistedDocument,
        hash: currentHash,
        category: 'composite',
        file: '07_iForest.json',
      });
    }

    if (request.method() === 'PUT') {
      const body = request.postDataJSON() as JsonRecord;
      dslSaves.push(body);
      persistedDocument = body.content as JsonRecord;
      currentHash = hashDocument(persistedDocument);
      return jsonResponse(route, {
        success: true,
        hash: currentHash,
        category: 'composite',
        file: '07_iForest.json',
      });
    }

    return jsonResponse(
      route,
      { error: { code: 'METHOD_NOT_ALLOWED' } },
      405,
    );
  });

  return {
    chatRequests,
    configRequests,
    dslSaves,
    getPersistedDocument: () => persistedDocument,
  };
}

test.describe('AI semantic editor desktop workflow', () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  test('configures, confirms sharing, applies a Patch, then undoes and redoes', async ({
    page,
  }) => {
    await page.addInitScript((storageKey) => {
      window.localStorage.removeItem(storageKey);
    }, DATA_SHARING_STORAGE_KEY);
    const api = await installApiMocks(page);

    await page.goto('/editor');

    const openButton = page.getByRole('button', {
      name: 'Open AI semantic editor',
    });
    await expect(openButton).toBeVisible();
    await openButton.click();

    const dialog = page.getByRole('dialog', { name: 'AI semantic editor' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('API configuration')).toBeVisible();

    await dialog.getByLabel('Base URL').fill(MOCK_BASE_URL);
    await dialog.getByLabel('Model').fill('mock-patch-model');
    await dialog.getByLabel(/^API Key/).fill(MOCK_API_KEY);
    await dialog.getByRole('button', { name: 'Save & test' }).click();

    await expect(dialog.getByText('Key saved')).toBeVisible();
    await expect(dialog.getByText(/Connection successful\.\s+\(12 ms\)/)).toBeVisible();
    expect(api.configRequests).toHaveLength(1);
    expect(api.configRequests[0]).toMatchObject({
      baseUrl: MOCK_BASE_URL,
      apiKey: MOCK_API_KEY,
      maxOutputTokens: 65536,
      model: 'mock-patch-model',
      timeoutMs: 600000,
    });

    const instruction = 'Update the top-level chart description.';
    const composer = dialog.getByLabel('Modification request');
    await expect(composer).toBeEnabled();
    await composer.fill(instruction);
    await dialog.getByRole('button', { name: 'Send', exact: true }).click();

    await expect(dialog.getByText('Confirm data sharing')).toBeVisible();
    await expect(
      dialog.getByText(
        'The complete DSL, view data, and recent instructions will be',
        { exact: false },
      ),
    ).toBeVisible();
    expect(api.chatRequests).toHaveLength(0);

    await dialog
      .getByRole('button', { name: 'Confirm & send', exact: true })
      .click();

    await expect(dialog.getByLabel('Intent analysis')).toBeVisible();
    await expect(
      dialog.getByText('Content update', { exact: true }),
    ).toBeVisible();
    await expect(dialog.getByText('Changes applied and saved.')).toBeVisible();
    const changeSummary = dialog.getByLabel('Change summary');
    await expect(changeSummary).toBeVisible();
    await expect(changeSummary).toHaveAttribute(
      'data-history-entry-id',
      /:ai:/,
    );
    await expect(changeSummary.getByText('1 change', { exact: true })).toBeVisible();
    await expect(
      changeSummary.getByText('Clarified the chart description', { exact: true }),
    ).toBeVisible();
    await expect(
      changeSummary.getByText(
        'The chart now communicates its purpose more clearly.',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      changeSummary.getByText(
        'Rewrote the top-level description for clarity.',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(changeSummary.getByText('1 changed', { exact: true })).toBeVisible();
    await expect(changeSummary.getByText('/description')).toBeVisible();
    expect(api.chatRequests).toHaveLength(1);
    expect(api.chatRequests[0]).toMatchObject({
      instruction,
      recentInstructions: [],
    });
    expect(api.chatRequests[0]).toHaveProperty('dsl');
    expect(api.chatRequests[0]).toHaveProperty('viewData');
    expect(api.dslSaves).toHaveLength(1);
    expect(api.getPersistedDocument().description).toBe(
      'Description updated by the mocked AI.',
    );

    const rememberedDestinations = await page.evaluate(
      (storageKey) => JSON.parse(window.localStorage.getItem(storageKey) ?? '[]'),
      DATA_SHARING_STORAGE_KEY,
    );
    expect(rememberedDestinations).toContain(MOCK_BASE_URL);

    await dialog.getByRole('tab', { name: /History/ }).click();
    const historyPanel = dialog.getByRole('tabpanel', { name: 'History' });
    await expect(historyPanel.getByText('AI', { exact: true })).toBeVisible();
    await expect(historyPanel.getByText('/description', { exact: true })).toBeVisible();

    await historyPanel.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(dialog.getByText('Undo completed.')).toBeVisible();
    expect(api.dslSaves).toHaveLength(2);
    expect(api.getPersistedDocument().description).not.toBe(
      'Description updated by the mocked AI.',
    );

    await historyPanel.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(dialog.getByText('Redo completed.')).toBeVisible();
    await expect(dialog.getByLabel('Change summary')).toHaveCount(1);
    expect(api.dslSaves).toHaveLength(3);
    expect(api.getPersistedDocument().description).toBe(
      'Description updated by the mocked AI.',
    );

    await dialog.getByRole('button', { name: 'Close dialog' }).click();
    const diffTrigger = page.getByRole('button', {
      name: 'Open JSON version diff',
    });
    await expect(diffTrigger).toBeEnabled();
    await diffTrigger.click();

    const diffDialog = page.getByRole('dialog', { name: 'JSON version diff' });
    await expect(diffDialog).toBeVisible();
    await expect(diffDialog.getByText('Previous · position 0')).toBeVisible();
    await expect(diffDialog.getByText('Current · position 1')).toBeVisible();
    const descriptionChange = diffDialog.getByRole('article', {
      name: 'Changed: /description',
    });
    await expect(
      descriptionChange.getByText('"Description updated by the mocked AI."'),
    ).toBeVisible();
  });
});
