const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');
const { createApp } = require('./app.cjs');
const { DEFAULT_CONFIG } = require('./env-config.cjs');

let projectRoot;
let apiServer;
let modelServer;
let apiBaseUrl;
let modelBaseUrl;
let modelRequests = [];
let modelRequestPaths = [];

function completeConfig(overrides = {}) {
  return {
    baseUrl: `${modelBaseUrl}/v1`,
    apiKey: 'test-secret-key',
    model: 'mock-model',
    temperature: 0,
    maxOutputTokens: 65536,
    timeoutMs: 5000,
    contextWindow: 128000,
    supportsVision: false,
    ...overrides,
  };
}

test('defaults to long-running AI request limits', () => {
  assert.equal(DEFAULT_CONFIG.maxOutputTokens, 65536);
  assert.equal(DEFAULT_CONFIG.timeoutMs, 600000);
});

async function putConfig(overrides = {}) {
  return fetch(`${apiBaseUrl}/api/ai/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(completeConfig(overrides)),
  });
}

function requestCountFor(pathname) {
  return modelRequestPaths.filter((path) => path === pathname).length;
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return `http://127.0.0.1:${server.address().port}`;
}

async function close(server) {
  if (!server) {
    return;
  }
  await new Promise((resolve) => server.close(resolve));
}

before(async () => {
  projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vitejs-d3-server-test-'));
  await fs.mkdir(path.join(projectRoot, 'src/datav3/basic_charts'), {
    recursive: true,
  });
  await fs.mkdir(path.join(projectRoot, 'src/datav3/composite'), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(projectRoot, 'src/datav3/basic_charts/chart.json'),
    '{\n  "title": "Before"\n}\n',
  );
  await fs.writeFile(
    path.join(projectRoot, '.env.local'),
    '# keep this comment\nUNRELATED_SETTING=\"untouched\"\n',
    { mode: 0o644 },
  );

  modelServer = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }
    const parsed = JSON.parse(body);
    modelRequests.push(parsed);
    modelRequestPaths.push(req.url);

    if (req.url === '/disconnect/v1/chat/completions') {
      req.socket.destroy();
      return;
    }
    if (req.url === '/provider-error/v1/chat/completions') {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: { code: 'temporarily_unavailable', message: 'Temporary outage.' },
        }),
      );
      return;
    }
    if (req.url === '/auth-failure/v1/chat/completions') {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: {
            code: 'invalid_api_key',
            // Deliberately echo the credential to prove the proxy never does.
            message: `Rejected ${req.headers.authorization}`,
          },
        }),
      );
      return;
    }
    if (
      req.url === '/structured-fallback/v1/chat/completions' &&
      parsed.response_format
    ) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: {
            code: 'unknown_parameter',
            message: 'Unknown parameter: response_format.',
          },
        }),
      );
      return;
    }

    const combinedMessageText = parsed.messages
      .map((message) => String(message.content))
      .join('\n');
    const isConnectionTest = parsed.messages.some((message) =>
      String(message.content).includes('connection test'),
    );
    let patch = isConnectionTest
      ? []
      : [{ op: 'replace', path: '/dsl/title', value: 'After AI' }];
    if (combinedMessageText.includes('FORBIDDEN_HISTORY_PATH')) {
      patch = [
        {
          op: 'replace',
          path: '/dsl/history/0',
          value: { forbidden: true },
        },
      ];
    }
    if (combinedMessageText.includes('FORBIDDEN_OTHER_ROOT')) {
      patch = [{ op: 'replace', path: '/other/value', value: true }];
    }
    if (combinedMessageText.includes('PATCH_ECHO_SECRET_DIRECT')) {
      patch = [
        {
          op: 'replace',
          path: '/dsl/title',
          value: 'test-secret-key',
        },
      ];
    }
    if (combinedMessageText.includes('PATCH_ECHO_SECRET_NESTED')) {
      patch = [
        {
          op: 'add',
          path: '/viewData/modelMetadata',
          value: {
            response: {
              headers: [
                { name: 'authorization', value: 'Bearer test-secret-key' },
              ],
            },
          },
        },
      ];
    }
    if (
      isConnectionTest &&
      req.url === '/non-empty-connection/v1/chat/completions'
    ) {
      patch = [{ op: 'replace', path: '/dsl/title', value: 'Unexpected' }];
    }

    let summary = isConnectionTest
      ? {
          title: 'Connection verified',
          overview: 'The model returned a valid response envelope.',
          changes: [
            {
              area: 'dsl',
              description: 'No editor document change was requested.',
            },
          ],
        }
      : {
          title: '  Updated chart title  ',
          overview: 'Updated the chart title.\nKept the view data unchanged.',
          changes: [
            {
              area: 'dsl',
              description: '  Changed the top-level title.  ',
            },
          ],
        };

    if (combinedMessageText.includes('INVALID_SUMMARY_EXTRA_FIELD')) {
      summary = { ...summary, internalReasoning: 'must not escape' };
    }
    if (combinedMessageText.includes('INVALID_SUMMARY_TOO_LONG')) {
      summary = { ...summary, title: 'x'.repeat(121) };
    }
    if (combinedMessageText.includes('INVALID_SUMMARY_AREA')) {
      summary = {
        ...summary,
        changes: [{ area: 'credentials', description: 'Unsafe area.' }],
      };
    }
    if (combinedMessageText.includes('INVALID_SUMMARY_TOO_MANY_CHANGES')) {
      summary = {
        ...summary,
        changes: Array.from({ length: 9 }, (_, index) => ({
          area: 'dsl',
          description: `Change ${index + 1}.`,
        })),
      };
    }
    if (combinedMessageText.includes('SUMMARY_ECHO_SECRET')) {
      summary = {
        title: 'Credential-safe update',
        overview: `The request used ${req.headers.authorization}.`,
        changes: [
          {
            area: 'dsl',
            description: 'The configured key was test-secret-key.',
          },
        ],
      };
    }

    let assistantPayload = { patch, summary };
    if (combinedMessageText.includes('LEGACY_RAW_PATCH')) {
      assistantPayload = patch;
    }
    if (combinedMessageText.includes('LEGACY_PATCH_ENVELOPE')) {
      assistantPayload = { patch };
    }
    if (parsed.stream) {
      if (combinedMessageText.includes('STREAM_TRANSPORT_OVERHEAD')) {
        const oversizedWireContent = JSON.stringify({
          patch: [
            {
              op: 'replace',
              path: '/dsl/title',
              value: 'x'.repeat(50_000),
            },
          ],
        });
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        let frames = '';
        for (const character of oversizedWireContent) {
          frames += `data: ${JSON.stringify({
            choices: [{ delta: { content: character } }],
          })}\n\n`;
          if (frames.length > 64 * 1024) {
            res.write(frames);
            frames = '';
          }
        }
        if (frames) {
          res.write(frames);
        }
        res.write(
          `data: ${JSON.stringify({
            choices: [{ delta: {}, finish_reason: 'stop' }],
          })}\n\n`,
        );
        res.end('data: [DONE]\n\n');
        return;
      }
      const content = JSON.stringify(assistantPayload);
      const splitAt = Math.max(1, Math.floor(content.length / 2));
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      if (combinedMessageText.includes('INCOMPLETE_STREAM')) {
        res.end(
          `data: ${JSON.stringify({
            choices: [{ delta: { content } }],
          })}\n\n`,
        );
        return;
      }
      res.write(
        `data: ${JSON.stringify({
          choices: [{ delta: { content: content.slice(0, splitAt) } }],
        })}\n\n`,
      );
      res.write(
        `data: ${JSON.stringify({
          choices: [
            {
              delta: { content: content.slice(splitAt) },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
          },
        })}\n\n`,
      );
      res.end('data: [DONE]\n\n');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        choices: [
          {
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: JSON.stringify(assistantPayload),
            },
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      }),
    );
  });
  modelBaseUrl = await listen(modelServer);

  apiServer = http.createServer(createApp({ projectRoot }));
  apiBaseUrl = await listen(apiServer);
});

after(async () => {
  await close(apiServer);
  await close(modelServer);
  await fs.rm(projectRoot, { recursive: true, force: true });
});

test('health is local-service shaped and rejects non-local browser origins', async () => {
  const health = await fetch(`${apiBaseUrl}/api/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).host, '127.0.0.1');

  const allowed = await fetch(`${apiBaseUrl}/api/health`, {
    headers: { Origin: 'http://localhost:5173' },
  });
  assert.equal(allowed.status, 200);

  const blockedLocalPort = await fetch(`${apiBaseUrl}/api/health`, {
    headers: { Origin: 'http://localhost:43110' },
  });
  assert.equal(blockedLocalPort.status, 403);

  const blocked = await fetch(`${apiBaseUrl}/api/health`, {
    headers: { Origin: 'https://example.com' },
  });
  assert.equal(blocked.status, 403);
  assert.equal((await blocked.json()).error.code, 'ORIGIN_FORBIDDEN');
});

test('configuration save preserves unrelated env lines, hides key, and tests', async () => {
  const response = await putConfig();
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.saved, true);
  assert.equal(result.test.ok, true);
  assert.equal(Object.hasOwn(result.test, 'summary'), false);
  assert.equal(result.config.hasApiKey, true);
  assert.equal(Object.hasOwn(result.config, 'apiKey'), false);
  assert.equal(JSON.stringify(result).includes('test-secret-key'), false);

  const rawEnv = await fs.readFile(path.join(projectRoot, '.env.local'), 'utf8');
  assert.match(rawEnv, /# keep this comment/);
  assert.match(rawEnv, /UNRELATED_SETTING="untouched"/);
  assert.match(rawEnv, /AI_API_KEY="test-secret-key"/);
  assert.equal((await fs.stat(path.join(projectRoot, '.env.local'))).mode & 0o777, 0o600);

  const getResponse = await fetch(`${apiBaseUrl}/api/ai/config`);
  const getText = await getResponse.text();
  assert.equal(getText.includes('test-secret-key'), false);
  const fetchedConfig = JSON.parse(getText).config;
  assert.equal(fetchedConfig.timeoutMs, 5000);
  assert.equal(fetchedConfig.hasApiKey, true);
  assert.equal(Object.hasOwn(fetchedConfig, 'apiKey'), false);

  const insecureRemote = await putConfig({
    baseUrl: 'http://model.example.test/v1',
  });
  assert.equal(insecureRemote.status, 400);
  assert.equal(
    (await insecureRemote.json()).error.code,
    'INVALID_CONFIG',
  );

  const requestsBeforeDestinationChange = modelRequests.length;
  const changedDestination = await putConfig({
    baseUrl: `${modelBaseUrl}/new-destination/v1`,
    apiKey: '',
  });
  assert.equal(changedDestination.status, 200);
  const changedResult = await changedDestination.json();
  assert.equal(changedResult.saved, true);
  assert.equal(changedResult.config.hasApiKey, false);
  assert.equal(changedResult.test.ok, false);
  assert.equal(changedResult.test.code, 'AI_CONFIG_INCOMPLETE');
  assert.equal(modelRequests.length, requestsBeforeDestinationChange);
  const changedEnv = await fs.readFile(
    path.join(projectRoot, '.env.local'),
    'utf8',
  );
  assert.equal(changedEnv.includes('AI_API_KEY='), false);

  const restored = await putConfig();
  assert.equal(restored.status, 200);
  assert.equal((await restored.json()).config.hasApiKey, true);
});

test('configuration does not cap or couple max output and context window', async () => {
  const maxOutputTokens = 3_000_001;
  const contextWindow = 2_000_001;
  const response = await putConfig({ maxOutputTokens, contextWindow });

  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.config.maxOutputTokens, maxOutputTokens);
  assert.equal(result.config.contextWindow, contextWindow);
  assert.equal(result.test.ok, true);
  assert.equal(modelRequests.at(-1).max_tokens, maxOutputTokens);
});

test('chat accepts the editor contract and returns a validated patch', async () => {
  const response = await fetch(`${apiBaseUrl}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instruction: 'Change the title.',
      dsl: { title: 'Before' },
      viewData: { marks: [] },
      recentInstructions: ['Make it compact.'],
    }),
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result.patch, [
    { op: 'replace', path: '/dsl/title', value: 'After AI' },
  ]);
  assert.deepEqual(result.summary, {
    title: 'Updated chart title',
    overview: 'Updated the chart title. Kept the view data unchanged.',
    changes: [
      { area: 'dsl', description: 'Changed the top-level title.' },
    ],
  });
  assert.equal(result.meta.structuredOutput, true);
  const upstreamBody = modelRequests.at(-1);
  assert.equal(upstreamBody.stream, false);
  assert.equal(upstreamBody.response_format.type, 'json_schema');
  assert.deepEqual(
    upstreamBody.response_format.json_schema.schema.required,
    ['patch'],
  );
  assert.equal(
    upstreamBody.response_format.json_schema.schema.properties.summary
      .properties.changes.maxItems,
    6,
  );
  assert.match(upstreamBody.messages[0].content, /untrusted data/i);
  assert.match(upstreamBody.messages[0].content, /JSON object envelope/i);
  assert.equal(
    upstreamBody.messages.some((message) =>
      String(message.content).includes('"viewData":{"marks":[]}'),
    ),
    true,
  );
});

test('chat stream sends friendly stages and only emits the completed validated Patch', async () => {
  const response = await fetch(`${apiBaseUrl}/api/ai/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instruction: 'Change the title through the live editor.',
      dsl: { title: 'Before' },
      viewData: { marks: [] },
      recentInstructions: [],
    }),
  });

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/event-stream/i);
  const text = await response.text();
  assert.match(text, /event: status/);
  assert.match(text, /"phase":"connecting"/);
  assert.match(text, /"phase":"generating"/);
  assert.match(text, /"phase":"validating"/);
  assert.match(text, /event: result/);
  assert.match(text, /event: done/);
  assert.equal(text.includes('test-secret-key'), false);

  const upstreamBody = modelRequests.at(-1);
  assert.equal(upstreamBody.stream, true);
  assert.equal(upstreamBody.response_format.type, 'json_schema');
});

test('chat stream accepts compact Patch content despite high SSE framing overhead', async () => {
  const response = await fetch(`${apiBaseUrl}/api/ai/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instruction: 'STREAM_TRANSPORT_OVERHEAD',
      dsl: { title: 'Before' },
      viewData: { marks: [] },
      recentInstructions: [],
    }),
  });

  assert.equal(response.status, 200);
  const text = await response.text();
  assert.match(text, /event: result/);
  assert.match(text, /event: done/);
  assert.equal(text.includes('UPSTREAM_RESPONSE_TOO_LARGE'), false);
  assert.equal(text.includes('MODEL_PATCH_TOO_LARGE'), false);
});

test('chat stream never relays an unvalidated credential echo from an upstream delta', async () => {
  const response = await fetch(`${apiBaseUrl}/api/ai/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instruction: 'PATCH_ECHO_SECRET_DIRECT',
      dsl: { title: 'Before' },
      viewData: { marks: [] },
      recentInstructions: [],
    }),
  });

  assert.equal(response.status, 200);
  const text = await response.text();
  assert.equal(text.includes('test-secret-key'), false);
  assert.match(text, /event: error/);
  assert.match(text, /MODEL_PATCH_CONTAINS_CREDENTIAL/);
  assert.match(text, /"status":422/);
  assert.equal(text.includes('event: result'), false);
});

test('chat stream rejects an upstream response that ends without completion', async () => {
  const response = await fetch(`${apiBaseUrl}/api/ai/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instruction: 'INCOMPLETE_STREAM',
      dsl: { title: 'Before' },
      viewData: { marks: [] },
      recentInstructions: [],
    }),
  });

  assert.equal(response.status, 200);
  const text = await response.text();
  assert.match(text, /event: error/);
  assert.match(text, /INCOMPLETE_UPSTREAM_STREAM/);
  assert.match(text, /"status":502/);
  assert.equal(text.includes('event: result'), false);
});

test('short dummy API keys do not cause Patch field or path false positives', async () => {
  try {
    for (const apiKey of ['path', 'dsl']) {
      const configResponse = await putConfig({ apiKey });
      assert.equal(configResponse.status, 200);
      assert.equal((await configResponse.json()).test.ok, true);

      const requestCountBefore = modelRequests.length;
      const response = await fetch(`${apiBaseUrl}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction: 'Change the title with a short local dummy key.',
          dsl: { title: 'Before' },
          viewData: { marks: [] },
          recentInstructions: [],
        }),
      });
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).patch, [
        { op: 'replace', path: '/dsl/title', value: 'After AI' },
      ]);
      assert.equal(modelRequests.length, requestCountBefore + 1);
    }
  } finally {
    const restore = await putConfig();
    assert.equal(restore.status, 200);
    assert.equal((await restore.json()).test.ok, true);
  }
});

test('chat accepts legacy Patch responses without requiring a summary', async () => {
  for (const instruction of ['LEGACY_RAW_PATCH', 'LEGACY_PATCH_ENVELOPE']) {
    const response = await fetch(`${apiBaseUrl}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instruction,
        dsl: { title: 'Before' },
        viewData: { marks: [] },
        recentInstructions: [],
      }),
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.deepEqual(result.patch, [
      { op: 'replace', path: '/dsl/title', value: 'After AI' },
    ]);
    assert.equal(Object.hasOwn(result, 'summary'), false);
  }
});

test('chat drops invalid summaries without rejecting or retrying a valid Patch', async () => {
  for (const instruction of [
    'INVALID_SUMMARY_EXTRA_FIELD',
    'INVALID_SUMMARY_TOO_LONG',
    'INVALID_SUMMARY_AREA',
    'INVALID_SUMMARY_TOO_MANY_CHANGES',
  ]) {
    const requestCountBefore = modelRequests.length;
    const response = await fetch(`${apiBaseUrl}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instruction,
        dsl: { title: 'Before' },
        viewData: { marks: [] },
        recentInstructions: [],
      }),
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.deepEqual(result.patch, [
      { op: 'replace', path: '/dsl/title', value: 'After AI' },
    ]);
    assert.equal(Object.hasOwn(result, 'summary'), false);
    assert.equal(modelRequests.length, requestCountBefore + 1);
  }
});

test('chat redacts configured credentials from accepted semantic summaries', async () => {
  const response = await fetch(`${apiBaseUrl}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instruction: 'SUMMARY_ECHO_SECRET',
      dsl: { title: 'Before' },
      viewData: { marks: [] },
      recentInstructions: [],
    }),
  });
  assert.equal(response.status, 200);
  const responseText = await response.text();
  assert.equal(responseText.includes('test-secret-key'), false);
  const result = JSON.parse(responseText);
  assert.match(result.summary.overview, /\[REDACTED\]/);
  assert.match(result.summary.changes[0].description, /\[REDACTED\]/);
});

test('structured-output fallback keeps the same object envelope contract', async () => {
  const requestPath = '/structured-fallback/v1/chat/completions';
  const configResponse = await putConfig({
    baseUrl: `${modelBaseUrl}/structured-fallback/v1`,
  });
  assert.equal(configResponse.status, 200);
  assert.equal((await configResponse.json()).test.ok, true);

  const requestCountBefore = requestCountFor(requestPath);
  const response = await fetch(`${apiBaseUrl}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instruction: 'Change the title through fallback.',
      dsl: { title: 'Before' },
      viewData: { marks: [] },
      recentInstructions: [],
    }),
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.meta.structuredOutput, false);
  assert.equal(result.meta.fallbackUsed, true);
  assert.equal(result.summary.title, 'Updated chart title');
  assert.equal(requestCountFor(requestPath), requestCountBefore + 2);

  const pathRequests = modelRequests.filter(
    (_request, index) => modelRequestPaths[index] === requestPath,
  );
  const [structuredRequest, fallbackRequest] = pathRequests.slice(-2);
  assert.equal(Object.hasOwn(structuredRequest, 'response_format'), true);
  assert.equal(Object.hasOwn(fallbackRequest, 'response_format'), false);
  assert.equal(
    structuredRequest.messages[0].content,
    fallbackRequest.messages[0].content,
  );
  assert.match(fallbackRequest.messages[0].content, /JSON object envelope/i);

  const restore = await putConfig();
  assert.equal(restore.status, 200);
  assert.equal((await restore.json()).test.ok, true);
});

test('connection tests require an empty Patch and ignore optional summaries', async () => {
  const response = await putConfig({
    baseUrl: `${modelBaseUrl}/non-empty-connection/v1`,
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.saved, true);
  assert.equal(result.test.ok, false);
  assert.equal(result.test.code, 'INVALID_CONNECTION_TEST_RESPONSE');
  assert.equal(Object.hasOwn(result.test, 'summary'), false);

  const restore = await putConfig();
  assert.equal(restore.status, 200);
  const restored = await restore.json();
  assert.equal(restored.test.ok, true);
  assert.equal(Object.hasOwn(restored.test, 'summary'), false);
});

test('AI rejects history and unknown-root patch paths without retrying', async () => {
  for (const instruction of [
    'FORBIDDEN_HISTORY_PATH',
    'FORBIDDEN_OTHER_ROOT',
  ]) {
    const requestCountBefore = modelRequests.length;
    const response = await fetch(`${apiBaseUrl}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instruction,
        dsl: { title: 'Before' },
        viewData: { marks: [] },
        recentInstructions: [],
      }),
    });
    assert.equal(response.status, 422);
    const result = await response.json();
    assert.equal(result.error.code, 'INVALID_MODEL_PATCH');
    assert.equal(modelRequests.length, requestCountBefore + 1);
  }
});

test('AI rejects direct and nested credential echoes in Patch values without retrying', async () => {
  for (const instruction of [
    'PATCH_ECHO_SECRET_DIRECT',
    'PATCH_ECHO_SECRET_NESTED',
  ]) {
    const requestCountBefore = modelRequests.length;
    const response = await fetch(`${apiBaseUrl}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instruction,
        dsl: { title: 'Before' },
        viewData: { marks: [] },
        recentInstructions: [],
      }),
    });
    assert.equal(response.status, 422);
    const responseText = await response.text();
    assert.equal(responseText.includes('test-secret-key'), false);
    const result = JSON.parse(responseText);
    assert.equal(result.error.code, 'MODEL_PATCH_CONTAINS_CREDENTIAL');
    assert.equal(
      result.error.message,
      'The model response contained protected credential material and was rejected.',
    );
    assert.equal(modelRequests.length, requestCountBefore + 1);
  }
});

test('DSL API uses SHA-256 optimistic concurrency and atomic force override', async () => {
  const readResponse = await fetch(
    `${apiBaseUrl}/api/dsl/basic_charts/chart.json`,
  );
  assert.equal(readResponse.status, 200);
  const initial = await readResponse.json();
  assert.equal(initial.content.title, 'Before');
  assert.match(initial.hash, /^[a-f0-9]{64}$/);

  const saveResponse = await fetch(
    `${apiBaseUrl}/api/dsl/basic_charts/chart.json`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { title: 'Saved' },
        expectedHash: initial.hash,
      }),
    },
  );
  assert.equal(saveResponse.status, 200);
  const saved = await saveResponse.json();
  assert.notEqual(saved.hash, initial.hash);

  const conflictResponse = await fetch(
    `${apiBaseUrl}/api/dsl/basic_charts/chart.json`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { title: 'Conflict' },
        expectedHash: initial.hash,
      }),
    },
  );
  assert.equal(conflictResponse.status, 409);
  const conflict = await conflictResponse.json();
  assert.equal(conflict.error.code, 'DSL_CONFLICT');
  assert.equal(conflict.error.details.currentHash, saved.hash);

  const afterConflict = await (
    await fetch(`${apiBaseUrl}/api/dsl/basic_charts/chart.json`)
  ).json();
  assert.equal(afterConflict.content.title, 'Saved');
  assert.equal(afterConflict.hash, saved.hash);

  const missingHashResponse = await fetch(
    `${apiBaseUrl}/api/dsl/basic_charts/chart.json`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: { title: 'No hash' } }),
    },
  );
  assert.equal(missingHashResponse.status, 428);
  assert.equal(
    (await missingHashResponse.json()).error.code,
    'EXPECTED_HASH_REQUIRED',
  );

  const forceResponse = await fetch(
    `${apiBaseUrl}/api/dsl/basic_charts/chart.json?force=true`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: { title: 'Forced' } }),
    },
  );
  assert.equal(forceResponse.status, 200);
  const forced = await forceResponse.json();
  assert.notEqual(forced.hash, saved.hash);
  const afterForce = await (
    await fetch(`${apiBaseUrl}/api/dsl/basic_charts/chart.json`)
  ).json();
  assert.equal(afterForce.content.title, 'Forced');
  assert.equal(afterForce.hash, forced.hash);
});

test('legacy save remains restricted to datav3 category paths', async () => {
  const denied = await fetch(
    `${apiBaseUrl}/api/save-json?file=${encodeURIComponent('../package.json')}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ overwritten: true }),
    },
  );
  assert.equal(denied.status, 403);

  const allowed = await fetch(
    `${apiBaseUrl}/api/save-json?file=${encodeURIComponent(
      'src/datav3/basic_charts/chart.json',
    )}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Legacy' }),
    },
  );
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('deprecation'), 'true');
});

test('failed save-time connection test still persists config without echoing key', async () => {
  const apiKey = 'persisted-failing-key';
  const failingBaseUrl = `${modelBaseUrl}/auth-failure/v1`;
  const requestPath = '/auth-failure/v1/chat/completions';
  const requestCountBefore = requestCountFor(requestPath);

  const response = await putConfig({
    baseUrl: failingBaseUrl,
    apiKey,
    model: 'failing-model',
  });
  assert.equal(response.status, 200);
  const responseText = await response.text();
  assert.equal(responseText.includes(apiKey), false);
  const result = JSON.parse(responseText);
  assert.equal(result.saved, true);
  assert.equal(result.test.ok, false);
  assert.equal(result.test.code, 'UPSTREAM_AUTH_ERROR');
  assert.equal(result.config.baseUrl, failingBaseUrl);
  assert.equal(result.config.model, 'failing-model');
  assert.equal(result.config.hasApiKey, true);
  assert.equal(Object.hasOwn(result.config, 'apiKey'), false);
  assert.equal(requestCountFor(requestPath), requestCountBefore + 1);

  const envText = await fs.readFile(path.join(projectRoot, '.env.local'), 'utf8');
  assert.match(envText, /AI_BASE_URL=.*auth-failure/);
  assert.match(envText, /AI_MODEL="failing-model"/);
  assert.match(envText, /AI_API_KEY="persisted-failing-key"/);

  const fetchedText = await (
    await fetch(`${apiBaseUrl}/api/ai/config`)
  ).text();
  assert.equal(fetchedText.includes(apiKey), false);
  const fetched = JSON.parse(fetchedText).config;
  assert.equal(fetched.baseUrl, failingBaseUrl);
  assert.equal(fetched.model, 'failing-model');
  assert.equal(fetched.hasApiKey, true);

  // Restore a working configuration for the following independent scenarios.
  const restore = await putConfig();
  assert.equal(restore.status, 200);
  assert.equal((await restore.json()).test.ok, true);
});

test('provider and network failures are never retried automatically', async () => {
  const scenarios = [
    {
      name: 'provider error',
      baseUrl: `${modelBaseUrl}/provider-error/v1`,
      path: '/provider-error/v1/chat/completions',
      expectedCode: 'UPSTREAM_SERVER_ERROR',
    },
    {
      name: 'network disconnect',
      baseUrl: `${modelBaseUrl}/disconnect/v1`,
      path: '/disconnect/v1/chat/completions',
      expectedCode: 'UPSTREAM_UNAVAILABLE',
    },
  ];

  for (const scenario of scenarios) {
    const beforeSaveTest = requestCountFor(scenario.path);
    const saveResponse = await putConfig({
      baseUrl: scenario.baseUrl,
      apiKey: `${scenario.name.replace(/\s/g, '-')}-key`,
    });
    assert.equal(saveResponse.status, 200);
    const saveResult = await saveResponse.json();
    assert.equal(saveResult.saved, true);
    assert.equal(saveResult.test.ok, false);
    assert.equal(saveResult.test.code, scenario.expectedCode);
    assert.equal(
      requestCountFor(scenario.path),
      beforeSaveTest + 1,
      `${scenario.name} save-time test should make one request`,
    );

    const beforeChat = requestCountFor(scenario.path);
    const chatResponse = await fetch(`${apiBaseUrl}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instruction: 'Change the title.',
        dsl: { title: 'Before' },
        viewData: {},
        recentInstructions: [],
      }),
    });
    assert.equal(chatResponse.status, 502);
    assert.equal(
      (await chatResponse.json()).error.code,
      scenario.expectedCode,
    );
    assert.equal(
      requestCountFor(scenario.path),
      beforeChat + 1,
      `${scenario.name} chat should make one request`,
    );
  }

  const restore = await putConfig();
  assert.equal(restore.status, 200);
  assert.equal((await restore.json()).test.ok, true);
});
