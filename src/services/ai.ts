import {
  DEFAULT_AI_CONFIG,
  type AIConfigDraft,
  type AIConfigSaveResult,
  type AIConfigStatus,
  type AIChatStreamEvent,
  type AIConnectionTestResult,
  type AIEditRequest,
  type AIEditResult,
  type AIRequestPhase,
  type AISemanticSummary,
  type AIUsage,
  type JsonPatchOperation,
} from "@/pages/ChartV2/model/ai";

export interface AIClientOptions {
  basePath?: string;
  fetchImpl?: typeof fetch;
}

export interface AIRequestOptions {
  signal?: AbortSignal;
  onEvent?: (event: AIChatStreamEvent) => void;
}

export class AIServiceError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "AIServiceError";
    this.status = status;
    this.code = code;
  }
}

type JsonRecord = Record<string, unknown>;

const AI_REQUEST_PHASES = new Set<AIRequestPhase>([
  "analyzing",
  "connecting",
  "generating",
  "validating",
  "saving",
  "repairing",
]);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function unwrapData(payload: unknown): unknown {
  return isRecord(payload) && "data" in payload ? payload.data : payload;
}

function normalizeConfig(payload: unknown): AIConfigStatus {
  const unwrapped = unwrapData(payload);
  const candidate =
    isRecord(unwrapped) && isRecord(unwrapped.config)
      ? unwrapped.config
      : unwrapped;
  const record = isRecord(candidate) ? candidate : {};

  return {
    baseUrl: stringValue(record.baseUrl, DEFAULT_AI_CONFIG.baseUrl),
    model: stringValue(record.model, DEFAULT_AI_CONFIG.model),
    temperature: numberValue(
      record.temperature,
      DEFAULT_AI_CONFIG.temperature,
    ),
    maxOutputTokens: numberValue(
      record.maxOutputTokens,
      DEFAULT_AI_CONFIG.maxOutputTokens,
    ),
    timeoutMs: numberValue(
      record.timeoutMs ?? record.requestTimeoutMs,
      DEFAULT_AI_CONFIG.timeoutMs,
    ),
    contextWindow: numberValue(
      record.contextWindow,
      DEFAULT_AI_CONFIG.contextWindow,
    ),
    supportsVision: booleanValue(
      record.supportsVision,
      DEFAULT_AI_CONFIG.supportsVision,
    ),
    hasApiKey: booleanValue(record.hasApiKey, false),
  };
}

function normalizeConnectionTest(payload: unknown): AIConnectionTestResult {
  const unwrapped = unwrapData(payload);
  const candidate =
    isRecord(unwrapped) && isRecord(unwrapped.test)
      ? unwrapped.test
      : isRecord(unwrapped) && isRecord(unwrapped.connectionTest)
        ? unwrapped.connectionTest
        : unwrapped;
  const record = isRecord(candidate) ? candidate : {};
  const ok = booleanValue(record.ok, booleanValue(record.success, false));
  const latencyMs =
    typeof record.latencyMs === "number" ? record.latencyMs : undefined;

  return {
    ok,
    message: stringValue(
      record.message,
      ok ? "Connection successful." : "Connection test failed.",
    ),
    ...(latencyMs === undefined ? {} : { latencyMs }),
  };
}

function normalizeSaveResult(payload: unknown): AIConfigSaveResult {
  const unwrapped = unwrapData(payload);
  const record = isRecord(unwrapped) ? unwrapped : {};
  const hasConfig = isRecord(record.config);

  return {
    saved: booleanValue(record.saved, booleanValue(record.success, true)),
    ...(hasConfig ? { config: normalizeConfig(record.config) } : {}),
    test: normalizeConnectionTest(
      record.test ?? record.connectionTest ?? record,
    ),
  };
}

function hasConnectionTest(payload: unknown): boolean {
  const unwrapped = unwrapData(payload);
  if (!isRecord(unwrapped)) {
    return false;
  }
  return (
    isRecord(unwrapped.test) ||
    isRecord(unwrapped.connectionTest) ||
    typeof unwrapped.ok === "boolean"
  );
}

function normalizeUsage(value: unknown): AIUsage | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    ...(typeof value.promptTokens === "number"
      ? { promptTokens: value.promptTokens }
      : {}),
    ...(typeof value.completionTokens === "number"
      ? { completionTokens: value.completionTokens }
      : {}),
    ...(typeof value.totalTokens === "number"
      ? { totalTokens: value.totalTokens }
      : {}),
  };
}

const SEMANTIC_SUMMARY_LIMITS = {
  title: 120,
  overview: 600,
  changes: 6,
  description: 240,
} as const;

function stripUnsafeControlCharacters(value: string): string {
  return Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code <= 8 || code === 11 || code === 12 ||
      (code >= 14 && code <= 31) || code === 127
      ? ""
      : character;
  }).join("");
}

function normalizeSummaryText(
  value: unknown,
  maxLength: number,
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = stripUnsafeControlCharacters(value)
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maxLength)
    .trim();
  return normalized || undefined;
}

function normalizeSemanticSummary(value: unknown): AISemanticSummary | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const title = normalizeSummaryText(
    value.title,
    SEMANTIC_SUMMARY_LIMITS.title,
  );
  const overview = normalizeSummaryText(
    value.overview,
    SEMANTIC_SUMMARY_LIMITS.overview,
  );
  if (!title || !overview || !Array.isArray(value.changes)) {
    return undefined;
  }

  const changes = value.changes
    .slice(0, SEMANTIC_SUMMARY_LIMITS.changes)
    .flatMap((change) => {
      if (
        !isRecord(change) ||
        (change.area !== "dsl" && change.area !== "viewData")
      ) {
        return [];
      }
      const description = normalizeSummaryText(
        change.description,
        SEMANTIC_SUMMARY_LIMITS.description,
      );
      return description ? [{ area: change.area, description }] : [];
    });

  return changes.length > 0 ? { title, overview, changes } : undefined;
}

function isPatchOperation(value: unknown): value is JsonPatchOperation {
  if (!isRecord(value) || typeof value.op !== "string") {
    return false;
  }

  if (typeof value.path !== "string") {
    return false;
  }

  switch (value.op) {
    case "add":
    case "replace":
    case "test":
      return "value" in value;
    case "remove":
      return true;
    case "move":
    case "copy":
      return typeof value.from === "string";
    default:
      return false;
  }
}

function normalizeEditResult(payload: unknown): AIEditResult {
  const unwrapped = unwrapData(payload);
  const patchCandidate = Array.isArray(unwrapped)
    ? unwrapped
    : isRecord(unwrapped)
      ? unwrapped.patch
      : undefined;

  if (
    !Array.isArray(patchCandidate) ||
    !patchCandidate.every(isPatchOperation)
  ) {
    throw new AIServiceError(
      "The AI service returned an invalid JSON Patch response.",
      502,
      "INVALID_PATCH_RESPONSE",
    );
  }

  const record = isRecord(unwrapped) ? unwrapped : {};
  const meta = isRecord(record.meta) ? record.meta : {};
  const repairAttempts =
    typeof record.repairAttempts === "number"
      ? record.repairAttempts
      : typeof meta.repairAttempts === "number"
        ? meta.repairAttempts
      : undefined;
  const usage = normalizeUsage(record.usage ?? meta.usage);
  const semanticSummary = normalizeSemanticSummary(
    record.summary ?? record.semanticSummary,
  );

  return {
    patch: patchCandidate,
    ...(semanticSummary === undefined ? {} : { semanticSummary }),
    ...(repairAttempts === undefined ? {} : { repairAttempts }),
    ...(usage === undefined ? {} : { usage }),
  };
}

function createChatPayload(editRequest: AIEditRequest): JsonRecord {
  return {
    instruction: editRequest.instruction,
    dsl: editRequest.dsl,
    viewData: editRequest.viewData,
    recentInstructions: editRequest.recentInstructions.slice(-10),
    ...(editRequest.attachment
      ? { attachment: editRequest.attachment }
      : {}),
  };
}

async function readResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return text ? { message: text } : {};
}

function errorMessage(payload: unknown, fallback: string): string {
  if (!isRecord(payload)) {
    return fallback;
  }

  if (typeof payload.error === "string") {
    return payload.error;
  }

  if (isRecord(payload.error) && typeof payload.error.message === "string") {
    return payload.error.message;
  }

  return stringValue(payload.message, fallback);
}

function errorCode(payload: unknown): string | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  if (typeof payload.code === "string") {
    return payload.code;
  }

  return isRecord(payload.error) && typeof payload.error.code === "string"
    ? payload.error.code
    : undefined;
}

function errorStatus(payload: unknown): number | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }
  const candidate = isRecord(payload.error) ? payload.error : payload;
  const status = candidate.status ?? payload.status;
  return typeof status === "number" &&
      Number.isInteger(status) &&
      status >= 400 &&
      status <= 599
    ? status
    : undefined;
}

function isRequestPhase(value: unknown): value is AIRequestPhase {
  return typeof value === "string" && AI_REQUEST_PHASES.has(value as AIRequestPhase);
}

function parseSseEvent(frame: string): AIChatStreamEvent | undefined {
  let eventName = "message";
  const dataLines: string[] = [];

  for (const line of frame.split(/\r?\n/u)) {
    if (!line || line.startsWith(":")) {
      continue;
    }
    if (line.startsWith("event:")) {
      eventName = line.slice("event:".length).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  const data = dataLines.join("\n");
  if (!data || data === "[DONE]") {
    return undefined;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(data);
  } catch {
    throw new AIServiceError(
      "The AI service returned an invalid live-update event.",
      502,
      "INVALID_STREAM_EVENT",
    );
  }

  if (eventName === "status") {
    if (!isRecord(payload) || !isRequestPhase(payload.phase)) {
      return undefined;
    }
    const message = normalizeSummaryText(payload.message, 240);
    return message ? { type: "status", phase: payload.phase, message } : undefined;
  }

  if (eventName === "result") {
    return { type: "result", result: normalizeEditResult(payload) };
  }

  if (eventName === "error") {
    const error = isRecord(payload) && isRecord(payload.error)
      ? payload.error
      : payload;
    return {
      type: "error",
      message: errorMessage(error, "The AI request could not be completed."),
      ...(errorCode(error) ? { code: errorCode(error) } : {}),
      ...(errorStatus(payload) ? { status: errorStatus(payload) } : {}),
    };
  }

  return eventName === "done" ? { type: "done" } : undefined;
}

async function readSseChatResponse(
  response: Response,
  onEvent: (event: AIChatStreamEvent) => void,
): Promise<AIEditResult> {
  if (!response.body) {
    throw new AIServiceError(
      "The AI service did not provide a live response body.",
      502,
      "MISSING_STREAM_BODY",
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: AIEditResult | undefined;
  let completed = false;

  const consumeFrame = (frame: string) => {
    const event = parseSseEvent(frame);
    if (!event) {
      return;
    }
    if (completed) {
      throw new AIServiceError(
        "The AI service sent data after completing the live response.",
        502,
        "INVALID_STREAM_EVENT",
      );
    }
    if (event.type === "error") {
      throw new AIServiceError(event.message, event.status ?? 502, event.code);
    }
    if (event.type === "result") {
      result = event.result;
    }
    if (event.type === "done") {
      completed = true;
    }
    onEvent(event);
  };

  const consumeAvailableFrames = () => {
    for (;;) {
      const separator = /\r?\n\r?\n/u.exec(buffer);
      if (!separator || separator.index === undefined) {
        return;
      }
      const frame = buffer.slice(0, separator.index);
      buffer = buffer.slice(separator.index + separator[0].length);
      consumeFrame(frame);
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      consumeAvailableFrames();
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      consumeFrame(buffer);
    }

    if (!result || !completed) {
      throw new AIServiceError(
        "The AI stream ended without a completed validated result.",
        502,
        "INCOMPLETE_STREAM",
      );
    }
    return result;
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export function createAIClient(options: AIClientOptions = {}) {
  const basePath = (options.basePath ?? "/api/ai").replace(/\/+$/, "");
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);

  const request = async (
    path: string,
    init: RequestInit = {},
  ): Promise<unknown> => {
    const response = await fetchImpl(`${basePath}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...init.headers,
      },
    });
    const payload = await readResponseBody(response);

    if (!response.ok) {
      throw new AIServiceError(
        errorMessage(payload, `AI request failed (${response.status}).`),
        response.status,
        errorCode(payload),
      );
    }

    return payload;
  };

  const requestChatStream = async (
    editRequest: AIEditRequest,
    requestOptions: AIRequestOptions,
  ): Promise<AIEditResult> => {
    const response = await fetchImpl(`${basePath}/chat/stream`, {
      method: "POST",
      body: JSON.stringify(createChatPayload(editRequest)),
      signal: requestOptions.signal,
      headers: {
        Accept: "text/event-stream, application/json",
        "Content-Type": "application/json",
      },
    });
    const contentType = response.headers.get("content-type") ?? "";

    if (!response.ok) {
      const payload = await readResponseBody(response);
      throw new AIServiceError(
        errorMessage(payload, `AI request failed (${response.status}).`),
        response.status,
        errorCode(payload),
      );
    }

    if (contentType.includes("application/json")) {
      return normalizeEditResult(await readResponseBody(response));
    }

    return readSseChatResponse(response, requestOptions.onEvent ?? (() => {}));
  };

  return {
    async getConfig(
      requestOptions: AIRequestOptions = {},
    ): Promise<AIConfigStatus> {
      return normalizeConfig(
        await request("/config", { signal: requestOptions.signal }),
      );
    },

    async saveConfig(
      config: AIConfigDraft,
      requestOptions: AIRequestOptions = {},
    ): Promise<AIConfigSaveResult> {
      const savedPayload = await request("/config", {
        method: "PUT",
        body: JSON.stringify(config),
        signal: requestOptions.signal,
      });

      if (hasConnectionTest(savedPayload)) {
        return normalizeSaveResult(savedPayload);
      }

      const savedConfig = normalizeConfig(savedPayload);
      try {
        const testPayload = await request("/config/test", {
          method: "POST",
          body: JSON.stringify({ ...config, apiKey: "" }),
          signal: requestOptions.signal,
        });
        return {
          saved: true,
          config: savedConfig,
          test: normalizeConnectionTest(testPayload),
        };
      } catch (error) {
        return {
          saved: true,
          config: savedConfig,
          test: {
            ok: false,
            message: getServiceErrorMessage(error),
          },
        };
      }
    },

    async testConfig(
      config: AIConfigDraft,
      requestOptions: AIRequestOptions = {},
    ): Promise<AIConnectionTestResult> {
      return normalizeConnectionTest(
        await request("/config/test", {
          method: "POST",
          body: JSON.stringify(config),
          signal: requestOptions.signal,
        }),
      );
    },

    async chat(
      editRequest: AIEditRequest,
      requestOptions: AIRequestOptions = {},
    ): Promise<AIEditResult> {
      if (requestOptions.onEvent) {
        try {
          return await requestChatStream(editRequest, requestOptions);
        } catch (error) {
          if (!(error instanceof AIServiceError) || error.status !== 404) {
            throw error;
          }
          requestOptions.onEvent({
            type: "status",
            phase: "connecting",
            message: "Live updates are unavailable; waiting for the complete result…",
          });
        }
      }
      return normalizeEditResult(
        await request("/chat", {
          method: "POST",
          body: JSON.stringify(createChatPayload(editRequest)),
          signal: requestOptions.signal,
        }),
      );
    },
  };
}

function getServiceErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Connection test failed.";
}

export type AIClient = ReturnType<typeof createAIClient>;

export const aiClient = createAIClient();

export const getAIConfig: AIClient["getConfig"] = (...args) =>
  aiClient.getConfig(...args);

export const saveAIConfig: AIClient["saveConfig"] = (...args) =>
  aiClient.saveConfig(...args);

export const testAIConfig: AIClient["testConfig"] = (...args) =>
  aiClient.testConfig(...args);

export const sendAIChat: AIClient["chat"] = (...args) =>
  aiClient.chat(...args);
