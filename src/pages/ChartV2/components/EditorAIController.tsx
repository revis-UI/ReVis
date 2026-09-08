import * as React from "react";
import { usesLocalDSLService } from "@/services/dsl";
import { showToast } from "@/components/toast";
import { useShallow } from "zustand/shallow";

import { aiClient, AIServiceError } from "@/services/ai";
import {
  AIWorkspace,
  type AIWorkspaceProps,
} from "./AIWorkspace";
import type { AIChatSubmission } from "./AIChatDialog";
import {
  DEFAULT_AI_CONFIG,
  type AIConfigDraft,
  type AIConfigSaveResult,
  type AIConfigStatus,
  type AIConversationMessage,
  type AIHistoryEntry,
  type AIImageAttachment,
  type AIRequestProgress,
  type JsonPatchOperation,
} from "../model/ai";
import { createAIChangeSummary } from "../model/changeSummary";
import { analyzeAIIntent } from "../model/intent";
import {
  EditorPatchValidationError,
  applyAIPatch,
  clearEditorHistory,
  getModelDocument,
  jumpEditorHistory,
  redoEditorDocument,
  undoEditorDocument,
  useChartStore,
} from "../model/editor";

const MAX_RECENT_INSTRUCTIONS = 10;
const MAX_REPAIR_ATTEMPTS = 3;
const DATA_SHARING_STORAGE_KEY =
  "vitejs-d3.ai.confirmed-data-destinations.v1";

type WorkspaceOverrides = Partial<
  Omit<
    AIWorkspaceProps,
    | "config"
    | "messages"
    | "history"
    | "currentHistoryId"
    | "preview"
    | "isRequesting"
    | "requestStartedAt"
    | "requestProgress"
    | "documentReady"
    | "canUndo"
    | "canRedo"
    | "onSaveConfig"
    | "onTestConfig"
    | "onSend"
    | "onCancel"
    | "onCapturePreview"
    | "onUndo"
    | "onRedo"
    | "onJumpToHistory"
    | "onClearHistory"
    | "dataSharingConsent"
    | "onConfirmDataSharing"
  >
>;

export interface EditorAIControllerProps {
  workspaceProps?: WorkspaceOverrides;
}

type ConversationMessageOptions = Pick<
  AIConversationMessage,
  "changeSummary" | "intent" | "progress"
>;

let messageSequence = 0;

function createMessageId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  messageSequence += 1;
  return `ai-message-${Date.now()}-${messageSequence}`;
}

function normalizeDestination(baseUrl: string): string {
  const value = baseUrl.trim();
  if (!value) {
    return "";
  }
  try {
    return new URL(value).toString().replace(/\/+$/, "");
  } catch {
    return value.replace(/\/+$/, "");
  }
}

function readConfirmedDestinations(): Set<string> {
  if (typeof window === "undefined") {
    return new Set();
  }

  try {
    const value = JSON.parse(
      window.localStorage.getItem(DATA_SHARING_STORAGE_KEY) ?? "[]",
    );
    return Array.isArray(value)
      ? new Set(value.filter((item): item is string => typeof item === "string"))
      : new Set();
  } catch {
    return new Set();
  }
}

function writeConfirmedDestinations(destinations: Set<string>) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      DATA_SHARING_STORAGE_KEY,
      JSON.stringify([...destinations]),
    );
  } catch {
    // The current page session still remembers consent if storage is blocked.
  }
}

function isCancelledError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof AIServiceError &&
      (error.status === 499 || error.code === "REQUEST_CANCELLED"))
  );
}

function isRepairablePatchError(
  error: unknown,
): error is EditorPatchValidationError {
  return (
    error instanceof EditorPatchValidationError ||
    (error instanceof Error &&
      "code" in error &&
      error.code === "AI_PATCH_VALIDATION_FAILED")
  );
}

function isRepairableModelResponseError(error: unknown): boolean {
  return (
    error instanceof AIServiceError
    && [
      "INVALID_MODEL_PATCH",
      "INVALID_PATCH_RESPONSE",
      "MODEL_OUTPUT_TRUNCATED",
    ].includes(error.code ?? "")
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sanitizedValidationMessage(error: unknown): string {
  return errorMessage(error)
    .replace(/\b(?:sk|key)-[A-Za-z0-9_-]{8,}\b/gi, "[redacted]")
    .replace(/bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
    .slice(0, 2_000);
}

function repairInstruction(
  originalInstruction: string,
  invalidPatch: readonly JsonPatchOperation[],
  validationError: unknown,
  attempt: number,
): string {
  return [
    `Repair attempt ${attempt} of ${MAX_REPAIR_ATTEMPTS}.`,
    "The previous Patch failed local document validation or isolated rendering.",
    "Return one strict JSON object with a corrected RFC 6902 `patch` array and a `summary` object.",
    "The summary must contain `title`, `overview`, and `changes`; each change must contain an `area` (`dsl` or `viewData`) and a plain-text `description`.",
    "Do not include Markdown or prose outside the JSON object.",
    `Original modification instruction:\n${originalInstruction}`,
    `Sanitized validation error:\n${sanitizedValidationMessage(validationError)}`,
    `Rejected Patch:\n${JSON.stringify(invalidPatch)}`,
  ].join("\n\n");
}

function findPreviewSvg(): SVGSVGElement | null {
  return document.querySelector<SVGSVGElement>(
    ".editor-preview svg, svg.editor-preview",
  );
}

function getSvgDimensions(svg: SVGSVGElement) {
  const rectangle = svg.getBoundingClientRect();
  const viewBox = svg.viewBox.baseVal;
  const width =
    rectangle.width ||
    svg.width.baseVal.value ||
    (viewBox?.width > 0 ? viewBox.width : 0);
  const height =
    rectangle.height ||
    svg.height.baseVal.value ||
    (viewBox?.height > 0 ? viewBox.height : 0);

  if (width <= 0 || height <= 0) {
    throw new Error("The current preview has no renderable dimensions.");
  }
  return { height, width };
}

async function svgToPngDataUrl(svg: SVGSVGElement): Promise<string> {
  const { height, width } = getSvgDimensions(svg);
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const sourceContainers = svg.querySelectorAll<SVGElement>(".container");
  const clonedContainers = clone.querySelectorAll<SVGElement>(".container");
  sourceContainers.forEach((source, index) => {
    const target = clonedContainers[index];
    if (!target) {
      return;
    }
    const computed = window.getComputedStyle(source);
    target.style.opacity = computed.opacity;
    target.style.display = computed.display;
    target.style.visibility = computed.visibility;
  });
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  if (!clone.getAttribute("viewBox")) {
    clone.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }

  const serialized = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([serialized], {
    type: "image/svg+xml;charset=utf-8",
  });
  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () =>
        reject(new Error("The current SVG preview could not be captured."));
      element.src = objectUrl;
    });
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas rendering is not available.");
    }
    context.scale(scale, scale);
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function capturePreviewAttachment(): Promise<AIImageAttachment> {
  const svg = findPreviewSvg();
  if (!svg) {
    throw new Error("The current visualization preview is not available.");
  }
  return {
    source: "current-preview",
    dataUrl: await svgToPngDataUrl(svg),
    mediaType: "image/png",
    name: "current-preview.png",
  };
}

function PreviewImage({ dataUrl }: { dataUrl: string | null }) {
  return (
    <div className="flex h-full min-h-52 items-center justify-center overflow-hidden rounded-lg border bg-background p-3">
      {dataUrl ? (
        <img
          src={dataUrl}
          alt="Current visualization preview"
          className="max-h-full max-w-full object-contain"
        />
      ) : (
        <p className="text-muted-foreground text-sm">
          Current preview is not available.
        </p>
      )}
    </div>
  );
}

export function EditorAIController({
  workspaceProps,
}: EditorAIControllerProps) {
  const { document, dslFile, isSaving } = useChartStore(
    useShallow((state) => ({
      document: state.dsl_json,
      dslFile: state.dsl_file,
      isSaving: state.isSaving,
    })),
  );
  const [config, setConfig] =
    React.useState<AIConfigStatus>(DEFAULT_AI_CONFIG);
  const [configLoaded, setConfigLoaded] = React.useState(false);
  const [messages, setMessages] = React.useState<AIConversationMessage[]>([]);
  const [isRequesting, setIsRequesting] = React.useState(false);
  const [requestStartedAt, setRequestStartedAt] = React.useState<
    number | undefined
  >();
  const [requestProgress, setRequestProgress] = React.useState<
    AIRequestProgress | undefined
  >();
  const [previewDataUrl, setPreviewDataUrl] = React.useState<string | null>(
    null,
  );
  const [confirmedDestinations, setConfirmedDestinations] = React.useState(
    readConfirmedDestinations,
  );
  const recentInstructionsRef = React.useRef<string[]>([]);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const previousDslFileRef = React.useRef(dslFile);

  const appendMessage = React.useCallback(
    (
      role: AIConversationMessage["role"],
      text: string,
      status?: AIConversationMessage["status"],
      options: ConversationMessageOptions = {},
    ) => {
      const message: AIConversationMessage = {
        id: createMessageId(),
        role,
        text,
        timestamp: Date.now(),
        ...(status ? { status } : {}),
        ...options,
      };
      setMessages((current) => [...current, message]);
      return message.id;
    },
    [],
  );

  const updateMessage = React.useCallback(
    (
      id: string,
      text: string,
      status: AIConversationMessage["status"],
      options: ConversationMessageOptions = {},
    ) => {
      setMessages((current) =>
        current.map((message) =>
          message.id === id
            ? {
                ...message,
                status,
                text,
                ...options,
              }
            : message,
        ),
      );
    },
    [],
  );

  React.useEffect(() => {
    if (!usesLocalDSLService) { setConfigLoaded(true); return; }
    const controller = new AbortController();
    let active = true;
    void aiClient
      .getConfig({ signal: controller.signal })
      .then((loadedConfig) => {
        if (active) {
          setConfig(loadedConfig);
        }
      })
      .catch((error: unknown) => {
        if (active && !isCancelledError(error)) {
          appendMessage(
            "status",
            `Unable to load API configuration: ${errorMessage(error)}`,
            "error",
          );
        }
      })
      .finally(() => {
        if (active) {
          setConfigLoaded(true);
        }
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [appendMessage]);

  React.useEffect(
    () => () => {
      abortControllerRef.current?.abort();
    },
    [],
  );

  React.useEffect(() => {
    if (previousDslFileRef.current === dslFile) {
      return;
    }

    previousDslFileRef.current = dslFile;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    recentInstructionsRef.current = [];
    setMessages([]);
    setIsRequesting(false);
    setRequestStartedAt(undefined);
    setRequestProgress(undefined);
    setPreviewDataUrl(null);
  }, [dslFile]);

  React.useEffect(() => {
    if (!document || !usesLocalDSLService) {
      setPreviewDataUrl(null);
      return;
    }

    let cancelled = false;
    let frame: number | null = null;
    let mutationObserver: MutationObserver | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const capture = () => {
      frame = null;
      const svg = findPreviewSvg();
      if (!svg) {
        return;
      }
      void svgToPngDataUrl(svg)
        .then((dataUrl) => {
          if (!cancelled) {
            setPreviewDataUrl(dataUrl);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setPreviewDataUrl(null);
          }
        });
    };

    const scheduleCapture = () => {
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
      frame = window.requestAnimationFrame(capture);
    };

    const attach = () => {
      const svg = findPreviewSvg();
      if (!svg) {
        scheduleCapture();
        return;
      }
      mutationObserver = new MutationObserver(scheduleCapture);
      mutationObserver.observe(svg, {
        attributes: true,
        childList: true,
        subtree: true,
      });
      resizeObserver = new ResizeObserver(scheduleCapture);
      resizeObserver.observe(svg);
      scheduleCapture();
    };

    frame = window.requestAnimationFrame(attach);

    return () => {
      cancelled = true;
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
    };
  }, [document]);

  const handleSaveConfig = React.useCallback(
    async (draft: AIConfigDraft): Promise<AIConfigSaveResult> => {
      const result = await aiClient.saveConfig(draft);
      if (result.config) {
        setConfig(result.config);
        return result;
      }

      const refreshed = await aiClient.getConfig();
      setConfig(refreshed);
      return { ...result, config: refreshed };
    },
    [],
  );

  const handleTestConfig = React.useCallback(
    (draft: AIConfigDraft) => aiClient.testConfig(draft),
    [],
  );

  const handleSend = React.useCallback(
    async ({ instruction, attachment }: AIChatSubmission) => {
      if (abortControllerRef.current) {
        throw new Error("An AI request is already running.");
      }
      const requestState = useChartStore.getState();
      const requestDocument = requestState.dsl_json;
      const requestDslFile = requestState.dsl_file;
      if (!requestDocument) {
        throw new Error("No DSL document is loaded.");
      }
      const assertRequestDocumentIsCurrent = () => {
        const activeState = useChartStore.getState();
        if (
          activeState.dsl_json !== requestDocument ||
          activeState.dsl_file !== requestDslFile
        ) {
          throw new Error(
            "The editor document changed while the model request was running. "
              + "The response was discarded; send the instruction again.",
          );
        }
      };

      const intent = analyzeAIIntent(instruction);
      appendMessage("user", instruction);
      if (intent.needsClarification) {
        appendMessage(
          "status",
          intent.clarification ??
            "Please describe the chart element and the outcome you want.",
          "info",
          {
            intent,
            progress: {
              phase: "analyzing",
              message: "The request needs a more specific editable outcome.",
            },
          },
        );
        return {
          accepted: false,
          message: intent.clarification,
        };
      }

      const previousInstructions =
        recentInstructionsRef.current.slice(-MAX_RECENT_INSTRUCTIONS);
      recentInstructionsRef.current = [
        ...recentInstructionsRef.current,
        instruction,
      ].slice(-MAX_RECENT_INSTRUCTIONS);
      const controller = new AbortController();
      let latestProgress: AIRequestProgress = {
        phase: "analyzing",
        message: "Intent understood. Preparing a safe editing plan…",
      };
      const statusId = appendMessage(
        "status",
        latestProgress.message,
        "pending",
        { intent, progress: latestProgress },
      );
      const updateProgress = (progress: AIRequestProgress) => {
        if (
          controller.signal.aborted ||
          abortControllerRef.current !== controller
        ) {
          return;
        }
        latestProgress = progress;
        setRequestProgress(progress);
        updateMessage(statusId, progress.message, "pending", {
          intent,
          progress,
        });
      };
      abortControllerRef.current = controller;
      setIsRequesting(true);
      setRequestStartedAt(Date.now());
      setRequestProgress(latestProgress);

      try {
        let repairAttempt = 0;
        let nextInstruction = instruction;
        let rejectedPatch: readonly JsonPatchOperation[] = [];

        for (;;) {
          assertRequestDocumentIsCurrent();
          const snapshot = getModelDocument();
          let result;
          try {
            result = await aiClient.chat(
              {
                instruction: nextInstruction,
                dsl: snapshot.dsl,
                viewData: snapshot.viewData,
                recentInstructions: previousInstructions,
                ...(attachment ? { attachment } : {}),
              },
              {
                signal: controller.signal,
                onEvent: (event) => {
                  if (event.type === "status") {
                    updateProgress({
                      phase: event.phase,
                      message: event.message,
                    });
                  }
                },
              },
            );
          } catch (error) {
            assertRequestDocumentIsCurrent();
            if (
              !isRepairableModelResponseError(error) ||
              repairAttempt >= MAX_REPAIR_ATTEMPTS
            ) {
              throw error;
            }
            repairAttempt += 1;
            updateProgress({
              phase: "repairing",
              message: `Patch validation failed. Repairing (${repairAttempt}/${MAX_REPAIR_ATTEMPTS})…`,
            });
            nextInstruction = repairInstruction(
              instruction,
              rejectedPatch,
              error,
              repairAttempt,
            );
            continue;
          }
          assertRequestDocumentIsCurrent();

          if (result.patch.length === 0) {
            latestProgress = {
              phase: "validating",
              message: "The request is valid, but it does not require a document change.",
            };
            updateMessage(statusId, "No changes", "info", {
              intent,
              progress: latestProgress,
            });
            return;
          }

          try {
            updateProgress({
              phase: "saving",
              message: "Applying the verified change and saving it…",
            });
            const historyEntry = await applyAIPatch(result.patch);
            updateMessage(
              statusId,
              historyEntry ? "Changes applied and saved." : "No changes",
              historyEntry ? "success" : "info",
              {
                intent,
                progress: {
                  phase: "saving",
                  message: historyEntry
                    ? "The verified change was saved successfully."
                    : "No document changes were saved.",
                },
                ...(historyEntry
                  ? {
                      changeSummary: createAIChangeSummary(
                        historyEntry,
                        result.semanticSummary,
                      ),
                    }
                  : {}),
              },
            );
            return;
          } catch (error) {
            if (
              !isRepairablePatchError(error)
              || repairAttempt >= MAX_REPAIR_ATTEMPTS
            ) {
              throw error;
            }
            rejectedPatch = result.patch;
            repairAttempt += 1;
            updateProgress({
              phase: "repairing",
              message: `Patch validation failed. Repairing (${repairAttempt}/${MAX_REPAIR_ATTEMPTS})…`,
            });
            nextInstruction = repairInstruction(
              instruction,
              rejectedPatch,
              error,
              repairAttempt,
            );
          }
        }
      } catch (error) {
        if (isCancelledError(error) || controller.signal.aborted) {
          updateMessage(statusId, "Request cancelled.", "cancelled", {
            intent,
            progress: latestProgress,
          });
          return;
        }
        updateMessage(statusId, errorMessage(error), "error", {
          intent,
          progress: latestProgress,
        });
        throw error;
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
          setIsRequesting(false);
          setRequestStartedAt(undefined);
          setRequestProgress(undefined);
        }
      }
    },
    [appendMessage, updateMessage],
  );

  const handleCancel = React.useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const handleUndo = React.useCallback(async () => {
    try {
      const changed = await undoEditorDocument();
      appendMessage(
        "status",
        changed ? "Undo completed." : "Nothing to undo.",
        changed ? "success" : "info",
      );
    } catch (error) {
      showToast(`Undo failed: ${errorMessage(error)}`);
      appendMessage("status", `Undo failed: ${errorMessage(error)}`, "error");
    }
  }, [appendMessage]);

  const handleRedo = React.useCallback(async () => {
    try {
      const changed = await redoEditorDocument();
      appendMessage(
        "status",
        changed ? "Redo completed." : "Nothing to redo.",
        changed ? "success" : "info",
      );
    } catch (error) {
      showToast(`Redo failed: ${errorMessage(error)}`);
      appendMessage("status", `Redo failed: ${errorMessage(error)}`, "error");
    }
  }, [appendMessage]);

  const handleJumpToHistory = React.useCallback(
    async (entry: AIHistoryEntry) => {
      const history = useChartStore.getState().dsl_json?.history;
      const index = history?.entries.findIndex(
        (candidate) => candidate.id === entry.id,
      );
      if (index === undefined || index < 0) {
        appendMessage("status", "History entry is no longer available.", "error");
        return;
      }

      try {
        const changed = await jumpEditorHistory(index + 1);
        appendMessage(
          "status",
          changed ? "History position restored." : "Already at this position.",
          changed ? "success" : "info",
        );
      } catch (error) {
        appendMessage(
          "status",
          `History jump failed: ${errorMessage(error)}`,
          "error",
        );
      }
    },
    [appendMessage],
  );

  const handleClearHistory = React.useCallback(async () => {
    if (
      !window.confirm(
        "Clear all persisted undo and redo history for this DSL file?",
      )
    ) {
      return;
    }

    try {
      const changed = await clearEditorHistory();
      appendMessage(
        "status",
        changed ? "History cleared." : "History is already empty.",
        changed ? "success" : "info",
      );
    } catch (error) {
      appendMessage(
        "status",
        `Unable to clear history: ${errorMessage(error)}`,
        "error",
      );
    }
  }, [appendMessage]);

  const confirmDataSharing = React.useCallback(
    (destination: string) => {
      const normalized = normalizeDestination(destination);
      if (!normalized) {
        return false;
      }
      const next = new Set(confirmedDestinations);
      next.add(normalized);
      setConfirmedDestinations(next);
      writeConfirmedDestinations(next);
      return true;
    },
    [confirmedDestinations],
  );

  const history = document?.history;
  const normalizedBaseUrl = normalizeDestination(config.baseUrl);
  const needsDataSharingConsent =
    Boolean(normalizedBaseUrl) &&
    !confirmedDestinations.has(normalizedBaseUrl);

  if (!configLoaded) {
    return null;
  }

  return (
    <AIWorkspace
      key={dslFile}
      {...workspaceProps}
      config={config}
      messages={messages}
      history={history?.entries ?? []}
      chartDocument={document}
      versionDiffDisabled={isSaving}
      currentHistoryId={
        history && history.cursor > 0
          ? history.entries[history.cursor - 1]?.id
          : null
      }
      aiUnavailableMessage={usesLocalDSLService ? undefined : "Static demo: AI requires a separate backend. Manual editing and undo/redo are available."}
      preview={<PreviewImage dataUrl={previewDataUrl} />}
      isRequesting={isRequesting}
      requestStartedAt={requestStartedAt}
      requestProgress={requestProgress}
      documentReady={Boolean(document) && !isSaving}
      canUndo={Boolean(history && history.cursor > 0) && !isSaving}
      canRedo={
        Boolean(history && history.cursor < history.entries.length) && !isSaving
      }
      onSaveConfig={handleSaveConfig}
      onTestConfig={handleTestConfig}
      onSend={handleSend}
      onCancel={handleCancel}
      onCapturePreview={capturePreviewAttachment}
      onUndo={() => void handleUndo()}
      onRedo={() => void handleRedo()}
      onJumpToHistory={(entry) => void handleJumpToHistory(entry)}
      onClearHistory={() => void handleClearHistory()}
      dataSharingConsent={
        needsDataSharingConsent
          ? { required: true, destination: config.baseUrl }
          : undefined
      }
      onConfirmDataSharing={confirmDataSharing}
    />
  );
}
