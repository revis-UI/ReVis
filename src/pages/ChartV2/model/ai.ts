export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonPatchOperation =
  | { op: "add"; path: string; value: JsonValue }
  | { op: "remove"; path: string }
  | { op: "replace"; path: string; value: JsonValue }
  | { op: "move"; from: string; path: string }
  | { op: "copy"; from: string; path: string }
  | { op: "test"; path: string; value: JsonValue };

export interface AIConfigStatus {
  baseUrl: string;
  model: string;
  temperature: number;
  maxOutputTokens: number;
  timeoutMs: number;
  contextWindow: number;
  supportsVision: boolean;
  hasApiKey: boolean;
}

/**
 * A blank apiKey means "keep the already stored key". The server never returns
 * the stored secret, so this is intentionally separate from AIConfigStatus.
 */
export interface AIConfigDraft extends Omit<AIConfigStatus, "hasApiKey"> {
  apiKey: string;
}

export const DEFAULT_AI_CONFIG: AIConfigStatus = {
  baseUrl: "",
  model: "",
  temperature: 0,
  maxOutputTokens: 65_536,
  timeoutMs: 600_000,
  contextWindow: 128_000,
  supportsVision: false,
  hasApiKey: false,
};

export function createAIConfigDraft(
  config: AIConfigStatus,
): AIConfigDraft {
  return {
    baseUrl: config.baseUrl,
    model: config.model,
    temperature: config.temperature,
    maxOutputTokens: config.maxOutputTokens,
    timeoutMs: config.timeoutMs,
    contextWindow: config.contextWindow,
    supportsVision: config.supportsVision,
    apiKey: "",
  };
}

export interface AIConnectionTestResult {
  ok: boolean;
  message: string;
  latencyMs?: number;
}

export interface AIConfigSaveResult {
  saved: boolean;
  config?: AIConfigStatus;
  test: AIConnectionTestResult;
}

export type AIMessageStatus =
  | "info"
  | "pending"
  | "success"
  | "error"
  | "cancelled";

export type AIRequestPhase =
  | "analyzing"
  | "connecting"
  | "generating"
  | "validating"
  | "saving"
  | "repairing";

export type AIIntentKind =
  | "visual"
  | "content"
  | "structure"
  | "data"
  | "mixed"
  | "clarification";

export interface AIIntentTarget {
  area: "dsl" | "viewData";
  description: string;
}

/**
 * A local, user-visible preflight plan. It is explanatory only: the validated
 * Patch returned by the server remains the sole authority for document edits.
 */
export interface AIIntentAnalysis {
  kind: AIIntentKind;
  title: string;
  overview: string;
  targets: AIIntentTarget[];
  steps: AIRequestPhase[];
  needsClarification: boolean;
  clarification?: string;
}

export interface AIRequestProgress {
  phase: AIRequestPhase;
  message: string;
}

export type AIChangeSummaryOperation = "added" | "removed" | "changed";

export interface AIChangeSummaryItem {
  operation: AIChangeSummaryOperation;
  path: string;
}

export interface AISemanticSummary {
  title: string;
  overview: string;
  changes: Array<{
    area: "dsl" | "viewData";
    description: string;
  }>;
}

export interface AIChangeSummary {
  counts: {
    added: number;
    removed: number;
    changed: number;
  };
  entryId: string;
  items: AIChangeSummaryItem[];
  scopes: {
    dsl: number;
    viewData: number;
  };
  semantic: AISemanticSummary;
  timestamp: string | number;
  total: number;
}

export interface AIConversationMessage {
  id: string;
  role: "user" | "status";
  text: string;
  timestamp: string | number;
  status?: AIMessageStatus;
  intent?: AIIntentAnalysis;
  progress?: AIRequestProgress;
  changeSummary?: AIChangeSummary;
}

export type AIHistorySource =
  | "ai"
  | "form"
  | "json"
  | "data-control"
  | "system"
  | "undo"
  | "redo"
  | "migration";

export interface AIHistoryEntry {
  id: string;
  source: AIHistorySource;
  timestamp: string | number;
  affectedPaths?: readonly string[];
  affected_paths?: readonly string[];
}

export type AIImageAttachmentSource = "current-preview" | "reference-image";

export interface AIImageAttachment {
  source: AIImageAttachmentSource;
  dataUrl: string;
  mediaType: string;
  name?: string;
}

export interface AIEditRequest {
  instruction: string;
  dsl: unknown;
  viewData: unknown;
  recentInstructions: readonly string[];
  attachment?: AIImageAttachment;
}

export interface AIUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface AIEditResult {
  patch: JsonPatchOperation[];
  repairAttempts?: number;
  semanticSummary?: AISemanticSummary;
  usage?: AIUsage;
}

/** Events emitted by the local API's SSE endpoint. */
export type AIChatStreamEvent =
  | {
      type: "status";
      phase: AIRequestPhase;
      message: string;
    }
  | {
      type: "result";
      result: AIEditResult;
    }
  | {
      type: "error";
      message: string;
      code?: string;
      status?: number;
    }
  | { type: "done" };

export interface AIDataSharingConsent {
  required: boolean;
  destination: string;
}

export function getPatchAffectedPaths(
  patch: readonly JsonPatchOperation[],
): string[] {
  const paths = new Set<string>();

  for (const operation of patch) {
    paths.add(operation.path);
    if ("from" in operation) {
      paths.add(operation.from);
    }
  }

  return [...paths];
}
