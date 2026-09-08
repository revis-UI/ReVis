const fs = require('node:fs/promises');
const path = require('node:path');
const { atomicWriteFile } = require('./atomic-file.cjs');
const { AppError } = require('./errors.cjs');

const DEFAULT_CONFIG = Object.freeze({
  baseUrl: '',
  apiKey: '',
  model: '',
  temperature: 0,
  maxOutputTokens: 65536,
  timeoutMs: 600000,
  contextWindow: 128000,
  supportsVision: false,
});

const ENV_KEYS = Object.freeze({
  baseUrl: 'AI_BASE_URL',
  apiKey: 'AI_API_KEY',
  model: 'AI_MODEL',
  temperature: 'AI_TEMPERATURE',
  maxOutputTokens: 'AI_MAX_OUTPUT_TOKENS',
  timeoutMs: 'AI_REQUEST_TIMEOUT_MS',
  contextWindow: 'AI_CONTEXT_WINDOW',
  supportsVision: 'AI_SUPPORTS_VISION',
});

function parseEnvValue(rawValue) {
  const value = rawValue.trim();
  if (value.startsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, value.endsWith('"') ? -1 : undefined);
    }
  }
  if (value.startsWith("'")) {
    return value.slice(1, value.endsWith("'") ? -1 : undefined);
  }
  return value.replace(/\s+#.*$/, '').trim();
}

function parseEnvFile(text) {
  const values = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (match) {
      values.set(match[1], parseEnvValue(match[2]));
    }
  }
  return values;
}

function parseFiniteNumber(value, fallback) {
  if (value === undefined || value === '') {
    return fallback;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function parseBoolean(value, fallback) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value !== 'string') {
    return fallback;
  }
  if (/^(1|true|yes|on)$/i.test(value)) {
    return true;
  }
  if (/^(0|false|no|off)$/i.test(value)) {
    return false;
  }
  return fallback;
}

function configFromEnv(values) {
  return {
    baseUrl: values.get(ENV_KEYS.baseUrl) ?? DEFAULT_CONFIG.baseUrl,
    apiKey: values.get(ENV_KEYS.apiKey) ?? DEFAULT_CONFIG.apiKey,
    model: values.get(ENV_KEYS.model) ?? DEFAULT_CONFIG.model,
    temperature: parseFiniteNumber(
      values.get(ENV_KEYS.temperature),
      DEFAULT_CONFIG.temperature,
    ),
    maxOutputTokens: parseFiniteNumber(
      values.get(ENV_KEYS.maxOutputTokens),
      DEFAULT_CONFIG.maxOutputTokens,
    ),
    timeoutMs: parseFiniteNumber(
      values.get(ENV_KEYS.timeoutMs),
      DEFAULT_CONFIG.timeoutMs,
    ),
    contextWindow: parseFiniteNumber(
      values.get(ENV_KEYS.contextWindow),
      DEFAULT_CONFIG.contextWindow,
    ),
    supportsVision: parseBoolean(
      values.get(ENV_KEYS.supportsVision),
      DEFAULT_CONFIG.supportsVision,
    ),
  };
}

function ensureString(value, field, maxLength) {
  if (typeof value !== 'string') {
    throw new AppError(400, 'INVALID_CONFIG', `${field} must be a string.`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new AppError(400, 'INVALID_CONFIG', `${field} is too long.`);
  }
  if (/[\r\n]/.test(normalized)) {
    throw new AppError(400, 'INVALID_CONFIG', `${field} cannot contain line breaks.`);
  }
  return normalized;
}

function validateBaseUrl(value) {
  const baseUrl = ensureString(value, 'baseUrl', 2048);
  if (!baseUrl) {
    return '';
  }

  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new AppError(400, 'INVALID_CONFIG', 'baseUrl must be a valid URL.');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new AppError(400, 'INVALID_CONFIG', 'baseUrl must use HTTP or HTTPS.');
  }
  if (
    url.protocol === 'http:' &&
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  ) {
    throw new AppError(
      400,
      'INVALID_CONFIG',
      'baseUrl must use HTTPS unless it targets the local machine.',
    );
  }
  if (url.username || url.password) {
    throw new AppError(
      400,
      'INVALID_CONFIG',
      'baseUrl cannot contain embedded credentials.',
    );
  }
  if (url.search || url.hash) {
    throw new AppError(
      400,
      'INVALID_CONFIG',
      'baseUrl cannot contain a query string or fragment.',
    );
  }

  return baseUrl.replace(/\/+$/, '');
}

function ensureNumber(value, field, minimum, maximum, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new AppError(400, 'INVALID_CONFIG', `${field} must be a number.`);
  }
  if (integer && !Number.isInteger(value)) {
    throw new AppError(400, 'INVALID_CONFIG', `${field} must be an integer.`);
  }
  if (value < minimum || (maximum !== undefined && value > maximum)) {
    throw new AppError(
      400,
      'INVALID_CONFIG',
      maximum === undefined
        ? `${field} must be at least ${minimum}.`
        : `${field} must be between ${minimum} and ${maximum}.`,
    );
  }
  return value;
}

function validateConfig(config, { requireCredentials = false } = {}) {
  const normalized = {
    baseUrl: validateBaseUrl(config.baseUrl),
    apiKey: ensureString(config.apiKey, 'apiKey', 8192),
    model: ensureString(config.model, 'model', 256),
    temperature: ensureNumber(config.temperature, 'temperature', 0, 2),
    maxOutputTokens: ensureNumber(
      config.maxOutputTokens,
      'maxOutputTokens',
      1,
      undefined,
      true,
    ),
    timeoutMs: ensureNumber(
      config.timeoutMs,
      'timeoutMs',
      1000,
      600000,
      true,
    ),
    contextWindow: ensureNumber(
      config.contextWindow,
      'contextWindow',
      1,
      undefined,
      true,
    ),
    supportsVision: config.supportsVision,
  };

  if (typeof normalized.supportsVision !== 'boolean') {
    throw new AppError(
      400,
      'INVALID_CONFIG',
      'supportsVision must be a boolean.',
    );
  }
  if (
    requireCredentials &&
    (!normalized.baseUrl || !normalized.apiKey || !normalized.model)
  ) {
    throw new AppError(
      400,
      'AI_CONFIG_INCOMPLETE',
      'Base URL, API key, and model are required.',
    );
  }

  return normalized;
}

function mergeConfigUpdate(currentConfig, input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new AppError(400, 'INVALID_CONFIG', 'Configuration must be an object.');
  }

  const merged = { ...currentConfig };
  const mutableFields = [
    'baseUrl',
    'model',
    'temperature',
    'maxOutputTokens',
    'timeoutMs',
    'contextWindow',
    'supportsVision',
  ];

  for (const field of mutableFields) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      merged[field] = input[field];
    }
  }
  // Accept the earlier server field name during migration, but always expose
  // the agreed front-end name: timeoutMs.
  if (
    Object.prototype.hasOwnProperty.call(input, 'requestTimeoutMs') &&
    !Object.prototype.hasOwnProperty.call(input, 'timeoutMs')
  ) {
    merged.timeoutMs = input.requestTimeoutMs;
  }

  if (input.clearApiKey === true) {
    merged.apiKey = '';
  } else if (
    typeof input.apiKey === 'string' &&
    input.apiKey.trim().length > 0
  ) {
    merged.apiKey = input.apiKey;
  } else if (
    Object.prototype.hasOwnProperty.call(input, 'apiKey') &&
    input.apiKey !== ''
  ) {
    throw new AppError(
      400,
      'INVALID_CONFIG',
      'apiKey must be a string. Use clearApiKey to remove it.',
    );
  }

  const normalized = validateConfig(merged);
  const suppliedReplacementKey =
    typeof input.apiKey === 'string' && input.apiKey.trim().length > 0;
  if (
    normalized.baseUrl !== currentConfig.baseUrl
    && !suppliedReplacementKey
  ) {
    // A credential is scoped to its configured destination. Reusing it for a
    // different host would let a local page redirect the saved secret to an
    // attacker-controlled service.
    normalized.apiKey = '';
  }
  return normalized;
}

function publicConfig(config) {
  return {
    baseUrl: config.baseUrl,
    model: config.model,
    temperature: config.temperature,
    maxOutputTokens: config.maxOutputTokens,
    timeoutMs: config.timeoutMs,
    contextWindow: config.contextWindow,
    supportsVision: config.supportsVision,
    hasApiKey: Boolean(config.apiKey),
  };
}

function serializeEnvValue(value) {
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(String(value));
}

function updateEnvText(originalText, updates) {
  const eol = originalText.includes('\r\n') ? '\r\n' : '\n';
  const hadFinalNewline = /\r?\n$/.test(originalText);
  const lines = originalText ? originalText.split(/\r?\n/) : [];
  if (hadFinalNewline) {
    lines.pop();
  }

  const seen = new Set();
  const output = [];

  for (const line of lines) {
    const match = line.match(
      /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/,
    );
    const key = match?.[1];

    if (!key || !updates.has(key)) {
      output.push(line);
      continue;
    }
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    const value = updates.get(key);
    if (value !== null) {
      output.push(`${key}=${serializeEnvValue(value)}`);
    }
  }

  for (const [key, value] of updates) {
    if (!seen.has(key) && value !== null) {
      output.push(`${key}=${serializeEnvValue(value)}`);
    }
  }

  return output.length ? `${output.join(eol)}${eol}` : '';
}

class ConfigStore {
  constructor(projectRoot) {
    this.filePath = path.join(projectRoot, '.env.local');
    this.updateQueue = Promise.resolve();
  }

  async readText() {
    try {
      const stat = await fs.stat(this.filePath);
      if (stat.size > 1024 * 1024) {
        throw new AppError(
          500,
          'CONFIG_FILE_TOO_LARGE',
          'The local configuration file is unexpectedly large.',
        );
      }
      return await fs.readFile(this.filePath, 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return '';
      }
      throw error;
    }
  }

  async getPrivate() {
    return validateConfig(configFromEnv(parseEnvFile(await this.readText())));
  }

  async getPublic() {
    return publicConfig(await this.getPrivate());
  }

  async mergeCandidate(input) {
    return mergeConfigUpdate(await this.getPrivate(), input);
  }

  async update(input) {
    const operation = this.updateQueue.then(async () => {
      const originalText = await this.readText();
      const current = validateConfig(configFromEnv(parseEnvFile(originalText)));
      const next = mergeConfigUpdate(current, input);
      const updates = new Map([
        [ENV_KEYS.baseUrl, next.baseUrl],
        [ENV_KEYS.model, next.model],
        [ENV_KEYS.temperature, next.temperature],
        [ENV_KEYS.maxOutputTokens, next.maxOutputTokens],
        [ENV_KEYS.timeoutMs, next.timeoutMs],
        [ENV_KEYS.contextWindow, next.contextWindow],
        [ENV_KEYS.supportsVision, next.supportsVision],
        [ENV_KEYS.apiKey, next.apiKey || null],
      ]);

      await atomicWriteFile(
        this.filePath,
        updateEnvText(originalText, updates),
        // The file contains an API key. Replacing an older permissive file
        // also corrects its permissions.
        { mode: 0o600 },
      );
      return publicConfig(next);
    });

    this.updateQueue = operation.catch(() => {});
    return operation;
  }
}

module.exports = {
  ConfigStore,
  DEFAULT_CONFIG,
  ENV_KEYS,
  mergeConfigUpdate,
  parseEnvFile,
  publicConfig,
  updateEnvText,
  validateConfig,
};
