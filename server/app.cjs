const crypto = require('node:crypto');
const express = require('express');
const { ConfigStore, publicConfig } = require('./env-config.cjs');
const { DslStore } = require('./dsl-store.cjs');
const {
  normalizeMessages,
  requestPatch,
  requestPatchStream,
} = require('./ai-client.cjs');
const {
  AppError,
  normalizeUnknownError,
  redactSensitiveText,
} = require('./errors.cjs');

const CONFIG_BODY_LIMIT = '128kb';
const CHAT_BODY_LIMIT = '24mb';
const DSL_BODY_LIMIT = '24mb';
// Match the explicitly selected local Vite port without allowing arbitrary origins.
const devPort = Number(process.env.REVIS_DEV_PORT || 5173);
if (!Number.isInteger(devPort) || devPort < 1 || devPort > 65535) {
  throw new Error('REVIS_DEV_PORT must be an integer from 1 to 65535.');
}
const ALLOWED_BROWSER_ORIGINS = new Set([
  `http://127.0.0.1:${devPort}`,
  `http://localhost:${devPort}`,
  `http://[::1]:${devPort}`,
]);

function isAllowedOrigin(origin) {
  if (!origin) {
    return true;
  }
  try {
    return ALLOWED_BROWSER_ORIGINS.has(new URL(origin).origin);
  } catch {
    return false;
  }
}

function localCors(req, res, next) {
  const origin = req.get('Origin');
  if (!isAllowedOrigin(origin)) {
    return next(
      new AppError(
        403,
        'ORIGIN_FORBIDDEN',
        'Only local browser origins may access this server.',
      ),
    );
  }

  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, If-Match, X-Requested-With',
  );
  res.setHeader('Access-Control-Max-Age', '600');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  return next();
}

function parseForce(value) {
  return value === true || value === 'true' || value === '1';
}

function parseIfMatch(req) {
  const header = req.get('If-Match');
  return header === undefined ? undefined : header;
}

function createDisconnectSignal(req, res) {
  const controller = new AbortController();
  const abort = () => controller.abort(new Error('Client disconnected'));
  if (req.aborted || res.destroyed) {
    abort();
    return controller.signal;
  }
  req.once('aborted', abort);
  res.once('close', () => {
    if (!res.writableEnded) {
      abort();
    }
  });
  return controller.signal;
}

function writeSse(res, event, payload) {
  if (res.destroyed || res.writableEnded) {
    return false;
  }
  res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  return true;
}

function beginSse(res) {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
}

async function testAiConnection(config, externalSignal) {
  const startedAt = Date.now();
  try {
    const result = await requestPatch({
      config,
      input: {
        messages: [
          {
            role: 'user',
            content:
              'This is a connection test. Return an empty JSON Patch and make no changes.',
          },
        ],
      },
      externalSignal,
    });
    if (result.patch.length !== 0) {
      throw new AppError(
        502,
        'INVALID_CONNECTION_TEST_RESPONSE',
        'The model service did not return an empty JSON Patch for the connection test.',
      );
    }
    return {
      ok: true,
      message: 'Connection successful.',
      latencyMs: Date.now() - startedAt,
      structuredOutputSupported: !result.meta.fallbackUsed,
      model: config.model,
    };
  } catch (error) {
    if (error?.code === 'REQUEST_CANCELLED') {
      throw error;
    }
    return {
      ok: false,
      code: error instanceof AppError ? error.code : 'CONNECTION_TEST_FAILED',
      message:
        error instanceof AppError
          ? error.message
          : 'The connection test could not be completed.',
      latencyMs: Date.now() - startedAt,
    };
  }
}

function createApp({ projectRoot }) {
  if (!projectRoot) {
    throw new Error('projectRoot is required');
  }

  const app = express();
  const configStore = new ConfigStore(projectRoot);
  const dslStore = new DslStore(projectRoot);
  const configJson = express.json({ limit: CONFIG_BODY_LIMIT, strict: false });
  const chatJson = express.json({ limit: CHAT_BODY_LIMIT, strict: false });
  const dslJson = express.json({ limit: DSL_BODY_LIMIT, strict: false });

  app.disable('x-powered-by');
  app.use((req, res, next) => {
    req.requestId = crypto.randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(localCors);

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'vitejs-d3-local-api',
      host: '127.0.0.1',
    });
  });

  app.get('/api/ai/config', async (req, res) => {
    res.json({ config: await configStore.getPublic() });
  });

  app.put('/api/ai/config', configJson, async (req, res) => {
    const input = req.body?.config ?? req.body;
    const config = await configStore.update(input);
    const privateConfig = await configStore.getPrivate();
    const test = await testAiConnection(
      privateConfig,
      createDisconnectSignal(req, res),
    );
    res.json({ saved: true, config, test });
  });

  app.post('/api/ai/config/test', configJson, async (req, res) => {
    const input = req.body?.config ?? req.body ?? {};
    const config = await configStore.mergeCandidate(input);
    res.json(
      await testAiConnection(config, createDisconnectSignal(req, res)),
    );
  });

  app.post('/api/ai/chat', chatJson, async (req, res) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      throw new AppError(400, 'INVALID_AI_REQUEST', 'Request body must be an object.');
    }
    const disconnectSignal = createDisconnectSignal(req, res);
    const config = await configStore.getPrivate();
    const result = await requestPatch({
      config,
      input: req.body,
      externalSignal: disconnectSignal,
    });
    res.json(result);
  });

  app.post('/api/ai/chat/stream', chatJson, async (req, res, next) => {
    let streamStarted = false;
    const disconnectSignal = createDisconnectSignal(req, res);
    try {
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        throw new AppError(400, 'INVALID_AI_REQUEST', 'Request body must be an object.');
      }
      const config = await configStore.getPrivate();
      // Validate before opening the event stream so malformed requests retain
      // the regular JSON error contract.
      normalizeMessages(req.body, config);

      beginSse(res);
      streamStarted = true;
      writeSse(res, 'status', {
        phase: 'connecting',
        message: 'Connecting to the configured model…',
      });
      const result = await requestPatchStream({
        config,
        input: req.body,
        externalSignal: disconnectSignal,
        onProgress: (progress) => writeSse(res, 'status', progress),
      });
      writeSse(res, 'result', result);
      writeSse(res, 'done', {});
      if (!res.writableEnded) {
        res.end();
      }
    } catch (error) {
      if (!streamStarted) {
        return next(error);
      }
      const normalized = normalizeUnknownError(error, req.requestId);
      writeSse(res, 'error', {
        ...normalized.payload,
        status: normalized.status,
      });
      writeSse(res, 'done', {});
      if (!res.writableEnded) {
        res.end();
      }
      return undefined;
    }
    return undefined;
  });

  app.get('/api/dsl/:category/:file', async (req, res) => {
    const result = await dslStore.get(req.params.category, req.params.file);
    res.setHeader('ETag', `"${result.hash}"`);
    res.json(result);
  });

  app.put('/api/dsl/:category/:file', dslJson, async (req, res) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      throw new AppError(
        400,
        'INVALID_DSL_REQUEST',
        'Request body must contain content and expectedHash.',
      );
    }
    if (!Object.prototype.hasOwnProperty.call(req.body, 'content')) {
      throw new AppError(
        400,
        'INVALID_DSL_REQUEST',
        'Request body must contain content.',
      );
    }

    const expectedHash = Object.prototype.hasOwnProperty.call(
      req.body,
      'expectedHash',
    )
      ? req.body.expectedHash
      : parseIfMatch(req);
    const result = await dslStore.save(
      req.params.category,
      req.params.file,
      req.body.content,
      {
        expectedHash,
        force: parseForce(req.body.force) || parseForce(req.query.force),
      },
    );
    res.setHeader('ETag', `"${result.hash}"`);
    res.json({ success: true, ...result });
  });

  // Compatibility for the existing Gallery save call. It intentionally
  // remains forceful because the old caller does not have a read/hash phase.
  // New editor code must use PUT /api/dsl/:category/:file.
  app.post('/api/save-json', dslJson, async (req, res) => {
    const { category, fileName } = dslStore.parseLegacyPath(req.query.file);
    const expectedHash = parseIfMatch(req);
    const result = await dslStore.save(category, fileName, req.body, {
      expectedHash,
      force: expectedHash === undefined,
    });
    res.setHeader('Deprecation', 'true');
    res.setHeader('Sunset', 'Wed, 31 Dec 2026 23:59:59 GMT');
    res.setHeader('ETag', `"${result.hash}"`);
    res.json({
      success: true,
      message: 'File saved successfully',
      ...result,
    });
  });

  app.use((req, res, next) => {
    next(new AppError(404, 'NOT_FOUND', 'API endpoint was not found.'));
  });

  app.use(async (error, req, res, next) => {
    if (res.headersSent) {
      return next(error);
    }
    const normalized = normalizeUnknownError(error, req.requestId);
    if (normalized.status >= 500) {
      console.error(
        `[${req.requestId}] ${req.method} ${req.path}: ${redactSensitiveText(
          error?.code ?? error?.name ?? 'error',
        )}`,
      );
    }
    if (res.destroyed) {
      return undefined;
    }
    return res.status(normalized.status).json(normalized.payload);
  });

  app.locals.configStore = configStore;
  app.locals.dslStore = dslStore;
  return app;
}

module.exports = {
  createApp,
  isAllowedOrigin,
};
