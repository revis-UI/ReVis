import type { DSLCategory } from '@/pages/ChartV2/utils';

export interface DSLFileResponse<T = unknown> {
  content: T;
  hash: string;
  category: DSLCategory;
  file: string;
}

export const usesLocalDSLService = !import.meta.env.PROD || import.meta.env.VITE_DSL_API === 'true';
// Static demos keep editable documents in this tab. Export JSON to retain them.
const sessionDocuments = new Map<string, DSLFileResponse>();
let sessionRevision = 0;

interface DSLSaveResponse {
  success: true;
  hash: string;
  category: DSLCategory;
  file: string;
}

const readError = async (response: Response) => {
  const payload = await response.json().catch(() => null) as {
    error?: string | { code?: string; message?: string };
    code?: string;
    message?: string;
  } | null;
  const nested = payload?.error && typeof payload.error === 'object'
    ? payload.error
    : null;
  const message = typeof payload?.error === 'string'
    ? payload.error
    : nested?.message || payload?.message;
  const error = new Error(message || `DSL request failed (${response.status})`);
  Object.assign(error, {
    status: response.status,
    code: nested?.code || payload?.code,
  });
  return error;
};

export const loadDSLFile = async <T>(
  category: DSLCategory,
  file: string,
): Promise<DSLFileResponse<T>> => {
  if (!usesLocalDSLService) {
    const key = `${category}/${file}`;
    if (!sessionDocuments.has(key)) {
      const bundled = import.meta.glob<{default: unknown}>('../datav3/*/*.json');
      const loader = bundled[`../datav3/${key}`];
      if (!loader) throw new Error('Use the bundled demo document.');
      const content = (await loader()).default;
      if (!sessionDocuments.has(key)) sessionDocuments.set(key, {content,hash:`bundled-${key}`,category,file});
    }
    return structuredClone(sessionDocuments.get(key)) as DSLFileResponse<T>;
  }
  const response = await fetch(`/api/dsl/${category}/${encodeURIComponent(file)}`);
  if (!response.ok) {
    throw await readError(response);
  }
  return response.json() as Promise<DSLFileResponse<T>>;
};

export const saveDSLFile = async <T>(
  category: DSLCategory,
  file: string,
  content: T,
  expectedHash: string | null,
  force = false,
): Promise<DSLSaveResponse> => {
  if (!usesLocalDSLService) {
    const key = `${category}/${file}`, stored = sessionDocuments.get(key);
    if (!force && expectedHash !== null && stored?.hash !== expectedHash) {
      throw Object.assign(new Error('The demo document changed. Reload before saving.'), {status:409,code:'DSL_CONFLICT'});
    }
    const hash = `session-${++sessionRevision}`;
    sessionDocuments.set(key, {content:structuredClone(content),hash,category,file});
    return {success:true,hash,category,file};
  }
  const response = await fetch(`/api/dsl/${category}/${encodeURIComponent(file)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content,
      expectedHash,
      force,
    }),
  });

  if (!response.ok) {
    throw await readError(response);
  }
  return response.json() as Promise<DSLSaveResponse>;
};
