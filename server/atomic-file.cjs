const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function syncDirectory(directory) {
  let handle;
  try {
    handle = await fs.open(directory, 'r');
    await handle.sync();
  } catch {
    // Some filesystems do not support fsync on directories. The file itself
    // has already been synced, so this is a best-effort durability step.
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function atomicWriteFile(
  filePath,
  content,
  { mode = 0o600, beforeRename } = {},
) {
  const directory = path.dirname(filePath);
  const temporaryPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${crypto.randomUUID()}.tmp`,
  );
  let handle;

  await fs.mkdir(directory, { recursive: true });

  try {
    handle = await fs.open(temporaryPath, 'wx', mode);
    await handle.writeFile(content);
    await handle.sync();
    await handle.close();
    handle = undefined;

    if (beforeRename) {
      await beforeRename();
    }

    await fs.rename(temporaryPath, filePath);
    await syncDirectory(directory);
  } catch (error) {
    await handle?.close().catch(() => {});
    await fs.unlink(temporaryPath).catch(() => {});
    throw error;
  }
}

async function readFileIfPresent(filePath) {
  try {
    return await fs.readFile(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

module.exports = {
  atomicWriteFile,
  readFileIfPresent,
  sha256,
};
