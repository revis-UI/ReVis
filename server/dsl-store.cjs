const fs = require('node:fs/promises');
const path = require('node:path');
const { atomicWriteFile, readFileIfPresent, sha256 } = require('./atomic-file.cjs');
const { AppError } = require('./errors.cjs');

const ALLOWED_CATEGORIES = new Set(['basic_charts', 'composite']);
const FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*\.json$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/i;
const MAX_DSL_BYTES = 24 * 1024 * 1024;

function normalizeExpectedHash(value) {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new AppError(
      400,
      'INVALID_EXPECTED_HASH',
      'expectedHash must be a SHA-256 hash or null.',
    );
  }
  const normalized = value.trim().replace(/^W\//, '').replace(/^"|"$/g, '');
  if (!HASH_PATTERN.test(normalized)) {
    throw new AppError(
      400,
      'INVALID_EXPECTED_HASH',
      'expectedHash must be a 64-character SHA-256 hash.',
    );
  }
  return normalized.toLowerCase();
}

function serializeDsl(content) {
  let parsed = content;
  if (typeof content === 'string') {
    if (Buffer.byteLength(content) > MAX_DSL_BYTES) {
      throw new AppError(413, 'DSL_TOO_LARGE', 'The DSL file is too large.');
    }
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new AppError(400, 'INVALID_DSL_JSON', 'DSL content is not valid JSON.');
    }
  }

  if (parsed === undefined) {
    throw new AppError(400, 'INVALID_DSL_JSON', 'DSL content is required.');
  }

  let serialized;
  try {
    serialized = `${JSON.stringify(parsed, null, 2)}\n`;
  } catch {
    throw new AppError(
      400,
      'INVALID_DSL_JSON',
      'DSL content cannot be serialized as JSON.',
    );
  }

  if (Buffer.byteLength(serialized) > MAX_DSL_BYTES) {
    throw new AppError(413, 'DSL_TOO_LARGE', 'The DSL file is too large.');
  }
  return serialized;
}

class DslStore {
  constructor(projectRoot) {
    this.dataRoot = path.join(projectRoot, 'src', 'datav3');
    this.writeQueues = new Map();
  }

  resolve(category, fileName) {
    if (!ALLOWED_CATEGORIES.has(category)) {
      throw new AppError(
        400,
        'INVALID_DSL_CATEGORY',
        'DSL category must be basic_charts or composite.',
      );
    }
    if (
      typeof fileName !== 'string' ||
      !FILE_NAME_PATTERN.test(fileName) ||
      path.basename(fileName) !== fileName
    ) {
      throw new AppError(
        400,
        'INVALID_DSL_FILENAME',
        'DSL filename must be a simple .json filename.',
      );
    }

    const categoryRoot = path.join(this.dataRoot, category);
    const filePath = path.join(categoryRoot, fileName);
    if (path.dirname(filePath) !== categoryRoot) {
      throw new AppError(403, 'DSL_PATH_FORBIDDEN', 'DSL path is not allowed.');
    }
    return filePath;
  }

  parseLegacyPath(requestedPath) {
    if (typeof requestedPath !== 'string' || requestedPath.includes('\\')) {
      throw new AppError(
        400,
        'INVALID_DSL_PATH',
        'A datav3 DSL file path is required.',
      );
    }

    const match = requestedPath.match(
      /^(?:\.\/)?src\/datav3\/(basic_charts|composite)\/([^/]+\.json)$/,
    );
    if (!match) {
      throw new AppError(
        403,
        'DSL_PATH_FORBIDDEN',
        'Only src/datav3/basic_charts and src/datav3/composite are allowed.',
      );
    }

    this.resolve(match[1], match[2]);
    return { category: match[1], fileName: match[2] };
  }

  async readRaw(filePath, { allowMissing = false } = {}) {
    try {
      const entry = await fs.lstat(filePath);
      if (entry.isSymbolicLink()) {
        throw new AppError(
          403,
          'DSL_SYMLINK_FORBIDDEN',
          'Symbolic links cannot be used as DSL files.',
        );
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }

    const content = await readFileIfPresent(filePath);
    if (content === null) {
      if (allowMissing) {
        return null;
      }
      throw new AppError(404, 'DSL_NOT_FOUND', 'DSL file was not found.');
    }
    if (content.length > MAX_DSL_BYTES) {
      throw new AppError(413, 'DSL_TOO_LARGE', 'The DSL file is too large.');
    }

    let parsed;
    try {
      parsed = JSON.parse(content.toString('utf8'));
    } catch {
      throw new AppError(
        500,
        'DSL_FILE_CORRUPT',
        'The stored DSL file is not valid JSON.',
      );
    }
    const stat = await fs.stat(filePath);
    return {
      content: parsed,
      raw: content,
      hash: sha256(content),
      size: content.length,
      modifiedAt: stat.mtime.toISOString(),
    };
  }

  async get(category, fileName) {
    const filePath = this.resolve(category, fileName);
    const result = await this.readRaw(filePath);
    return {
      file: { category, name: fileName },
      content: result.content,
      hash: result.hash,
      size: result.size,
      modifiedAt: result.modifiedAt,
    };
  }

  withWriteLock(filePath, callback) {
    const previous = this.writeQueues.get(filePath) ?? Promise.resolve();
    const operation = previous.catch(() => {}).then(callback);
    this.writeQueues.set(filePath, operation);
    operation.finally(() => {
      if (this.writeQueues.get(filePath) === operation) {
        this.writeQueues.delete(filePath);
      }
    }).catch(() => {});
    return operation;
  }

  async save(
    category,
    fileName,
    content,
    { expectedHash, force = false } = {},
  ) {
    const filePath = this.resolve(category, fileName);
    const serialized = serializeDsl(content);

    if (!force && expectedHash === undefined) {
      throw new AppError(
        428,
        'EXPECTED_HASH_REQUIRED',
        'expectedHash is required unless force is true.',
      );
    }
    const normalizedExpected = force
      ? undefined
      : normalizeExpectedHash(expectedHash);

    return this.withWriteLock(filePath, async () => {
      const initial = await this.readRaw(filePath, { allowMissing: true });
      const initialHash = initial?.hash ?? null;

      if (!force && normalizedExpected !== initialHash) {
        throw new AppError(
          409,
          'DSL_CONFLICT',
          'The DSL file changed after it was loaded.',
          {
            expectedHash: normalizedExpected,
            currentHash: initialHash,
            modifiedAt: initial?.modifiedAt ?? null,
          },
        );
      }

      let mode = 0o644;
      if (initial) {
        mode = (await fs.stat(filePath)).mode & 0o777;
      }

      await atomicWriteFile(filePath, serialized, {
        mode,
        beforeRename: async () => {
          if (force) {
            return;
          }
          const latest = await readFileIfPresent(filePath);
          const latestHash = latest === null ? null : sha256(latest);
          if (latestHash !== initialHash) {
            throw new AppError(
              409,
              'DSL_CONFLICT',
              'The DSL file changed while it was being saved.',
              {
                expectedHash: normalizedExpected,
                currentHash: latestHash,
              },
            );
          }
        },
      });

      const saved = await this.readRaw(filePath);
      return {
        file: { category, name: fileName },
        hash: saved.hash,
        size: saved.size,
        modifiedAt: saved.modifiedAt,
        previousHash: initialHash,
      };
    });
  }
}

module.exports = {
  DslStore,
  ALLOWED_CATEGORIES,
  FILE_NAME_PATTERN,
  MAX_DSL_BYTES,
  normalizeExpectedHash,
  serializeDsl,
};
