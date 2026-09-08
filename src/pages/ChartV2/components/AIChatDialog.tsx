import * as React from "react";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Eye,
  FileDiff,
  FlaskConical,
  History,
  ImagePlus,
  Info,
  LoaderCircle,
  RotateCcw,
  RotateCw,
  Send,
  Settings2,
  Square,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  createAIConfigDraft,
  type AIChangeSummary,
  type AIConfigDraft,
  type AIConfigSaveResult,
  type AIConfigStatus,
  type AIConnectionTestResult,
  type AIConversationMessage,
  type AIDataSharingConsent,
  type AIHistoryEntry,
  type AIImageAttachment,
  type AIIntentAnalysis,
  type AIRequestPhase,
  type AIRequestProgress,
} from "../model/ai";
import { analyzeAIIntent } from "../model/intent";

export interface AIChatSubmission {
  instruction: string;
  attachment?: AIImageAttachment;
}

export interface AIChatSubmissionResult {
  accepted?: boolean;
  message?: string;
}

export interface AIChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: AIConfigStatus;
  messages?: readonly AIConversationMessage[];
  history?: readonly AIHistoryEntry[];
  currentHistoryId?: string | null;
  preview?: React.ReactNode;
  isRequesting?: boolean;
  requestStartedAt?: number;
  requestProgress?: AIRequestProgress;
  documentReady?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  onSaveConfig: (config: AIConfigDraft) => Promise<AIConfigSaveResult>;
  onTestConfig?: (
    config: AIConfigDraft,
  ) => Promise<AIConnectionTestResult>;
  onSend: (
    submission: AIChatSubmission,
  ) => Promise<AIChatSubmissionResult | void> | AIChatSubmissionResult | void;
  onCancel?: () => void;
  onCapturePreview?: () => Promise<AIImageAttachment | null>;
  onUndo?: () => void;
  onRedo?: () => void;
  onJumpToHistory?: (entry: AIHistoryEntry) => void;
  onClearHistory?: () => void;
  dataSharingConsent?: AIDataSharingConsent;
  onConfirmDataSharing?: (
    destination: string,
  ) => Promise<boolean> | boolean;
}

type Feedback = {
  kind: "success" | "warning" | "error" | "info";
  message: string;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function validateConfig(
  draft: AIConfigDraft,
  canReuseStoredApiKey: boolean,
  baseUrlChanged: boolean,
): string | null {
  if (!draft.baseUrl.trim()) {
    return "Base URL is required.";
  }

  try {
    const url = new URL(draft.baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "Base URL must use http or https.";
    }
    if (
      url.protocol === "http:" &&
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    ) {
      return "Remote Base URLs must use HTTPS.";
    }
    if (url.username || url.password) {
      return "Base URL cannot contain embedded credentials.";
    }
    if (url.search || url.hash) {
      return "Base URL cannot contain a query string or fragment.";
    }
  } catch {
    return "Base URL must be a valid URL.";
  }

  if (!draft.model.trim()) {
    return "Model is required.";
  }
  if (!draft.apiKey.trim() && !canReuseStoredApiKey) {
    return baseUrlChanged
      ? "API Key is required for the new Base URL."
      : "API Key is required.";
  }
  if (draft.temperature < 0 || draft.temperature > 2) {
    return "Temperature must be between 0 and 2.";
  }
  if (!Number.isInteger(draft.maxOutputTokens) || draft.maxOutputTokens < 1) {
    return "Maximum output tokens must be a positive integer.";
  }
  if (!Number.isInteger(draft.timeoutMs) || draft.timeoutMs < 1_000) {
    return "Request timeout must be at least 1 second.";
  }
  if (!Number.isInteger(draft.contextWindow) || draft.contextWindow < 1) {
    return "Context window must be a positive integer.";
  }

  return null;
}

interface ConfigurationPanelProps {
  config: AIConfigStatus;
  disabled: boolean;
  onSave: (config: AIConfigDraft) => Promise<AIConfigSaveResult>;
  onTest?: (config: AIConfigDraft) => Promise<AIConnectionTestResult>;
}

function ConfigurationPanel({
  config,
  disabled,
  onSave,
  onTest,
}: ConfigurationPanelProps) {
  const [expanded, setExpanded] = React.useState(
    () => !config.hasApiKey || !config.baseUrl || !config.model,
  );
  const [draft, setDraft] = React.useState<AIConfigDraft>(() =>
    createAIConfigDraft(config),
  );
  const [feedback, setFeedback] = React.useState<Feedback | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const fieldPrefix = React.useId();
  const {
    baseUrl,
    contextWindow,
    hasApiKey,
    maxOutputTokens,
    model,
    supportsVision,
    temperature,
    timeoutMs,
  } = config;

  React.useEffect(() => {
    setDraft({
      baseUrl,
      contextWindow,
      maxOutputTokens,
      model,
      supportsVision,
      temperature,
      timeoutMs,
      apiKey: "",
    });
  }, [
    baseUrl,
    contextWindow,
    hasApiKey,
    maxOutputTokens,
    model,
    supportsVision,
    temperature,
    timeoutMs,
  ]);

  const updateDraft = <Key extends keyof AIConfigDraft>(
    key: Key,
    value: AIConfigDraft[Key],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const baseUrlChanged =
    normalizeBaseUrl(draft.baseUrl) !== normalizeBaseUrl(config.baseUrl);
  const canReuseStoredApiKey = config.hasApiKey && !baseUrlChanged;

  const handleSave = async () => {
    const validationError = validateConfig(
      draft,
      canReuseStoredApiKey,
      baseUrlChanged,
    );
    if (validationError) {
      setFeedback({ kind: "error", message: validationError });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const result = await onSave({
        ...draft,
        baseUrl: normalizeBaseUrl(draft.baseUrl),
        model: draft.model.trim(),
      });
      setDraft((current) => ({ ...current, apiKey: "" }));

      if (!result.saved) {
        setFeedback({
          kind: "error",
          message: "The configuration could not be saved.",
        });
      } else if (result.test.ok) {
        setFeedback({
          kind: "success",
          message: result.test.latencyMs
            ? `${result.test.message} (${result.test.latencyMs} ms)`
            : result.test.message,
        });
      } else {
        setFeedback({
          kind: "warning",
          message: `Settings saved. Connection test failed: ${result.test.message}`,
        });
      }
    } catch (error) {
      setFeedback({ kind: "error", message: getErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!onTest) {
      return;
    }

    const validationError = validateConfig(
      draft,
      canReuseStoredApiKey,
      baseUrlChanged,
    );
    if (validationError) {
      setFeedback({ kind: "error", message: validationError });
      return;
    }

    setTesting(true);
    setFeedback(null);
    try {
      const result = await onTest({
        ...draft,
        baseUrl: normalizeBaseUrl(draft.baseUrl),
        model: draft.model.trim(),
      });
      setFeedback({
        kind: result.ok ? "success" : "warning",
        message:
          result.ok && result.latencyMs
            ? `${result.message} (${result.latencyMs} ms)`
            : result.message,
      });
    } catch (error) {
      setFeedback({ kind: "error", message: getErrorMessage(error) });
    } finally {
      setTesting(false);
    }
  };

  const fieldDisabled = disabled || saving || testing;

  return (
    <section className="border-b bg-muted/20">
      <button
        type="button"
        className="hover:bg-accent/60 focus-visible:ring-ring/50 flex w-full items-center gap-3 px-5 py-3 text-left outline-none transition-colors focus-visible:ring-[3px]"
        aria-expanded={expanded}
        aria-controls={`${fieldPrefix}-configuration`}
        onClick={() => setExpanded((value) => !value)}
      >
        <Settings2 className="text-muted-foreground size-4" />
        <span className="font-medium">API configuration</span>
        <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
          {config.baseUrl && config.model
            ? `${config.model} · ${config.baseUrl}`
            : "Configure an OpenAI-compatible service"}
        </span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs",
            config.hasApiKey
              ? "bg-emerald-100 text-emerald-700"
              : "bg-amber-100 text-amber-700",
          )}
        >
          {config.hasApiKey ? "Key saved" : "Key required"}
        </span>
        {expanded ? (
          <ChevronUp className="size-4" />
        ) : (
          <ChevronDown className="size-4" />
        )}
      </button>

      {expanded && (
        <div
          id={`${fieldPrefix}-configuration`}
          className="border-t px-5 py-4"
        >
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-5 space-y-1.5">
              <Label htmlFor={`${fieldPrefix}-base-url`}>Base URL</Label>
              <Input
                id={`${fieldPrefix}-base-url`}
                type="url"
                value={draft.baseUrl}
                disabled={fieldDisabled}
                placeholder="https://api.example.com/v1"
                autoComplete="url"
                onChange={(event) => updateDraft("baseUrl", event.target.value)}
              />
            </div>
            <div className="col-span-3 space-y-1.5">
              <Label htmlFor={`${fieldPrefix}-model`}>Model</Label>
              <Input
                id={`${fieldPrefix}-model`}
                value={draft.model}
                disabled={fieldDisabled}
                placeholder="model-name"
                autoComplete="off"
                onChange={(event) => updateDraft("model", event.target.value)}
              />
            </div>
            <div className="col-span-4 space-y-1.5">
              <Label htmlFor={`${fieldPrefix}-api-key`}>
                API Key
                {canReuseStoredApiKey && (
                  <span className="text-muted-foreground ml-1 font-normal">
                    (leave blank to keep saved key)
                  </span>
                )}
                {config.hasApiKey && baseUrlChanged && (
                  <span className="text-amber-700 ml-1 font-normal">
                    (required for new Base URL)
                  </span>
                )}
              </Label>
              <Input
                id={`${fieldPrefix}-api-key`}
                type="password"
                value={draft.apiKey}
                disabled={fieldDisabled}
                placeholder={
                  canReuseStoredApiKey
                    ? "Saved securely"
                    : baseUrlChanged
                      ? "Enter key for new Base URL"
                      : "Enter API key"
                }
                autoComplete="new-password"
                onChange={(event) => updateDraft("apiKey", event.target.value)}
              />
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label htmlFor={`${fieldPrefix}-temperature`}>
                Temperature
              </Label>
              <Input
                id={`${fieldPrefix}-temperature`}
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={draft.temperature}
                disabled={fieldDisabled}
                onChange={(event) =>
                  updateDraft("temperature", Number(event.target.value))
                }
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor={`${fieldPrefix}-max-tokens`}>
                Max output
              </Label>
              <Input
                id={`${fieldPrefix}-max-tokens`}
                type="number"
                min={1}
                step={1}
                value={draft.maxOutputTokens}
                disabled={fieldDisabled}
                onChange={(event) =>
                  updateDraft("maxOutputTokens", Number(event.target.value))
                }
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor={`${fieldPrefix}-timeout`}>
                Timeout (sec)
              </Label>
              <Input
                id={`${fieldPrefix}-timeout`}
                type="number"
                min={1}
                step={1}
                value={draft.timeoutMs / 1_000}
                disabled={fieldDisabled}
                onChange={(event) =>
                  updateDraft(
                    "timeoutMs",
                    Math.round(Number(event.target.value) * 1_000),
                  )
                }
              />
            </div>
            <div className="col-span-3 space-y-1.5">
              <Label htmlFor={`${fieldPrefix}-context-window`}>
                Context window
              </Label>
              <Input
                id={`${fieldPrefix}-context-window`}
                type="number"
                min={1}
                step={1}
                value={draft.contextWindow}
                disabled={fieldDisabled}
                onChange={(event) =>
                  updateDraft("contextWindow", Number(event.target.value))
                }
              />
            </div>
            <div className="col-span-3 flex items-end">
              <div className="flex h-7 items-center gap-2">
                <Switch
                  id={`${fieldPrefix}-vision`}
                  checked={draft.supportsVision}
                  disabled={fieldDisabled}
                  onCheckedChange={(checked) =>
                    updateDraft("supportsVision", checked)
                  }
                />
                <Label htmlFor={`${fieldPrefix}-vision`}>Vision input</Label>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => void handleSave()}
              disabled={fieldDisabled}
            >
              {saving ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Settings2 />
              )}
              Save &amp; test
            </Button>
            {onTest && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void handleTest()}
                disabled={fieldDisabled}
              >
                {testing ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <FlaskConical />
                )}
                Test only
              </Button>
            )}
            <span className="text-muted-foreground text-xs">
              The saved key is never returned to the browser.
            </span>
          </div>

          {feedback && (
            <FeedbackBanner feedback={feedback} className="mt-3" />
          )}
        </div>
      )}
    </section>
  );
}

function FeedbackBanner({
  feedback,
  className,
}: {
  feedback: Feedback;
  className?: string;
}) {
  const Icon =
    feedback.kind === "success"
      ? CheckCircle2
      : feedback.kind === "error" || feedback.kind === "warning"
        ? AlertCircle
        : Info;

  return (
    <div
      role={feedback.kind === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2 text-xs",
        feedback.kind === "success" &&
          "border-emerald-200 bg-emerald-50 text-emerald-800",
        feedback.kind === "warning" &&
          "border-amber-200 bg-amber-50 text-amber-800",
        feedback.kind === "error" &&
          "border-red-200 bg-red-50 text-red-800",
        feedback.kind === "info" &&
          "border-blue-200 bg-blue-50 text-blue-800",
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <span>{feedback.message}</span>
    </div>
  );
}

function formatTime(timestamp: string | number): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function formatDateTime(timestamp: string | number): string | undefined {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function MessageIcon({ message }: { message: AIConversationMessage }) {
  if (message.status === "pending") {
    return <LoaderCircle className="size-4 animate-spin" />;
  }
  if (message.status === "success") {
    return <CheckCircle2 className="size-4" />;
  }
  if (message.status === "error") {
    return <AlertCircle className="size-4" />;
  }
  if (message.status === "cancelled") {
    return <Square className="size-3.5 fill-current" />;
  }
  return <Info className="size-4" />;
}

const CHANGE_SUMMARY_LABELS = {
  added: "Added",
  changed: "Changed",
  removed: "Removed",
} as const;

const CHANGE_SUMMARY_STYLES = {
  added: "bg-emerald-500/15 text-emerald-800",
  changed: "bg-amber-500/15 text-amber-800",
  removed: "bg-red-500/15 text-red-800",
} as const;

const SEMANTIC_AREA_LABELS = {
  dsl: "DSL",
  viewData: "View data",
} as const;

function ChangeSummary({ summary }: { summary: AIChangeSummary }) {
  const visibleItems = summary.items.slice(0, 5);
  const remainingItems = summary.total - visibleItems.length;
  const scopeParts = [
    summary.scopes.dsl > 0 ? `${summary.scopes.dsl} DSL` : null,
    summary.scopes.viewData > 0
      ? `${summary.scopes.viewData} view data`
      : null,
  ].filter((part): part is string => Boolean(part));

  return (
    <section
      aria-label="Change summary"
      data-history-entry-id={summary.entryId}
      className="mt-3 min-w-0 rounded-md border border-emerald-300/60 bg-background/70 p-3 text-xs text-foreground"
    >
      <div aria-label="AI summary" className="min-w-0">
        <div className="flex items-center gap-2">
          <FileDiff className="size-4 shrink-0 text-emerald-700" />
          <h3 className="font-semibold">AI summary</h3>
        </div>
        <p className="mt-2 min-w-0 break-words font-medium [overflow-wrap:anywhere]">
          {summary.semantic.title}
        </p>
        <p className="text-muted-foreground mt-1 min-w-0 break-words [overflow-wrap:anywhere]">
          {summary.semantic.overview}
        </p>
        <ul className="mt-2 space-y-1.5">
          {summary.semantic.changes.map((change, index) => (
            <li
              key={`${change.area}:${change.description}:${index}`}
              className="flex min-w-0 items-start gap-2"
            >
              <span className="bg-sky-500/15 mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800">
                {SEMANTIC_AREA_LABELS[change.area]}
              </span>
              <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                {change.description}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-3 border-t pt-3">
        <div className="flex items-center gap-2">
          <h4 className="font-semibold">Verified saved JSON details</h4>
          <span className="text-muted-foreground ml-auto">
            {summary.total} {summary.total === 1 ? "change" : "changes"}
          </span>
        </div>

        <p className="text-muted-foreground mt-1.5">
          Saved {scopeParts.join(" and ")} changes to the document.
        </p>

        <div
          aria-label="Change counts"
          className="mt-2 flex flex-wrap gap-1.5"
        >
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-800">
            {summary.counts.added} added
          </span>
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-800">
            {summary.counts.changed} changed
          </span>
          <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-red-800">
            {summary.counts.removed} removed
          </span>
        </div>

        <ul className="mt-2 space-y-1.5">
          {visibleItems.map((item, index) => (
            <li
              key={`${item.operation}:${item.path}:${index}`}
              className="flex min-w-0 items-center gap-2"
            >
              <span
                className={cn(
                  "w-16 shrink-0 rounded px-1.5 py-0.5 text-center text-[10px] font-semibold uppercase tracking-wide",
                  CHANGE_SUMMARY_STYLES[item.operation],
                )}
              >
                {CHANGE_SUMMARY_LABELS[item.operation]}
              </span>
              <code
                className="min-w-0 break-all rounded bg-muted px-1.5 py-0.5 text-[11px]"
              >
                {item.path || "/"}
              </code>
            </li>
          ))}
        </ul>

        {remainingItems > 0 && (
          <p className="text-muted-foreground mt-2 text-[11px]">
            +{remainingItems} more {remainingItems === 1 ? "path" : "paths"}
          </p>
        )}
      </div>
    </section>
  );
}

const REQUEST_PHASE_LABELS: Record<AIRequestPhase, string> = {
  analyzing: "Understand request",
  connecting: "Connect model",
  generating: "Draft Patch",
  validating: "Validate change",
  saving: "Save result",
  repairing: "Repair response",
};

function IntentProgressCard({
  intent,
  progress,
  status,
}: {
  intent: AIIntentAnalysis;
  progress?: AIRequestProgress;
  status?: AIConversationMessage["status"];
}) {
  const savingIndex = intent.steps.indexOf("saving");
  const steps =
    progress?.phase === "repairing" && !intent.steps.includes("repairing")
      ? [
          ...intent.steps.slice(0, savingIndex < 0 ? intent.steps.length : savingIndex),
          "repairing" as const,
          ...intent.steps.slice(savingIndex < 0 ? intent.steps.length : savingIndex),
        ]
      : intent.steps;
  const activeStep = progress ? steps.indexOf(progress.phase) : -1;
  const completeAll = status === "success";

  return (
    <section
      aria-label="Intent analysis"
      className="mt-3 rounded-md border border-sky-200 bg-sky-50/70 p-3 text-xs text-sky-950"
    >
      <div className="flex items-center gap-2">
        <Info className="size-4 shrink-0" />
        <h3 className="font-semibold">Intent analysis</h3>
      </div>
      <p className="mt-2 font-medium">{intent.title}</p>
      <p className="mt-1 leading-relaxed text-sky-900/80">{intent.overview}</p>

      {intent.targets.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Edit targets">
          {intent.targets.map((target) => (
            <span
              key={`${target.area}:${target.description}`}
              className="rounded-full border border-sky-200 bg-background/70 px-2 py-0.5 text-[10px] font-medium"
            >
              {target.area === "dsl" ? "DSL" : "View data"}
              {": "}
              {target.description}
            </span>
          ))}
        </div>
      )}

      <ol className="mt-3 grid gap-1.5" aria-label="Request progress">
        {steps.map((phase, index) => {
          const isCurrent = index === activeStep && status === "pending";
          const isTerminal =
            index === activeStep &&
            (status === "error" || status === "cancelled");
          const isComplete =
            completeAll ||
            (activeStep >= 0 &&
              (index < activeStep || (status === "info" && index === activeStep)));
          return (
            <li key={phase} className="flex items-center gap-2">
              {isComplete ? (
                <CheckCircle2 className="size-3.5 shrink-0 text-emerald-700" />
              ) : isCurrent ? (
                <LoaderCircle className="size-3.5 shrink-0 animate-spin" />
              ) : isTerminal && status === "error" ? (
                <AlertCircle className="size-3.5 shrink-0 text-red-700" />
              ) : isTerminal ? (
                <Square className="size-3 shrink-0 fill-current text-amber-700" />
              ) : (
                <span className="size-3.5 shrink-0 rounded-full border border-sky-300" />
              )}
              <span
                className={cn(
                  isCurrent && "font-medium",
                  !isCurrent && !isComplete && "text-sky-900/60",
                )}
              >
                {REQUEST_PHASE_LABELS[phase]}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Conversation({
  messages,
  onReuseInstruction,
  reuseDisabled = false,
}: {
  messages: readonly AIConversationMessage[];
  onReuseInstruction: (instruction: string) => void;
  reuseDisabled?: boolean;
}) {
  const endRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="text-muted-foreground flex h-full flex-col items-center justify-center px-8 text-center">
        <div className="bg-muted mb-3 flex size-11 items-center justify-center rounded-full">
          <Send className="size-5" />
        </div>
        <p className="text-foreground text-sm font-medium">
          Describe a semantic change
        </p>
        <p className="mt-1 max-w-sm text-xs">
          The assistant edits the complete DSL and view data using a validated
          JSON Patch. It does not answer general questions.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      {messages.map((message) => (
        <article
          key={message.id}
          className={cn(
            "max-w-[88%] rounded-lg border px-3 py-2 text-sm",
            message.role === "user"
              ? "ml-auto border-blue-200 bg-blue-50 text-blue-950"
              : "mr-auto bg-muted/60",
            message.status === "error" && "border-red-200 bg-red-50 text-red-900",
            message.status === "success" &&
              "border-emerald-200 bg-emerald-50 text-emerald-900",
            message.status === "cancelled" &&
              "border-amber-200 bg-amber-50 text-amber-900",
          )}
        >
          <div className="flex items-start gap-2">
            {message.role === "status" && (
              <span className="mt-0.5 shrink-0">
                <MessageIcon message={message} />
              </span>
            )}
            <p
              className="min-w-0 whitespace-pre-wrap break-words"
              {...(message.role === "status"
                ? message.status === "error"
                  ? { role: "alert", "aria-atomic": true }
                  : { role: "status", "aria-live": "polite", "aria-atomic": true }
                : {})}
            >
              {message.text}
            </p>
          </div>
          {message.intent && (
            <IntentProgressCard
              intent={message.intent}
              progress={message.progress}
              status={message.status}
            />
          )}
          {message.changeSummary && (
            <ChangeSummary summary={message.changeSummary} />
          )}
          {message.role === "user" && (
            <div className="mt-2 flex justify-end">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                aria-label={`Reuse request: ${message.text}`}
                disabled={reuseDisabled || message.text.trim().length === 0}
                onClick={() => onReuseInstruction(message.text)}
              >
                <RotateCcw className="size-3.5" />
                Reuse
              </Button>
            </div>
          )}
          <time
            className="mt-1 block text-right text-[10px] opacity-60"
            dateTime={formatDateTime(
              message.changeSummary?.timestamp ?? message.timestamp,
            )}
          >
            {formatTime(
              message.changeSummary?.timestamp ?? message.timestamp,
            )}
          </time>
        </article>
      ))}
      <div ref={endRef} />
    </div>
  );
}

function useElapsedSeconds(startedAt: number | undefined, active: boolean) {
  const fallbackStartedAt = React.useRef<number | null>(null);
  const [elapsed, setElapsed] = React.useState(0);

  React.useEffect(() => {
    if (!active) {
      fallbackStartedAt.current = null;
      setElapsed(0);
      return;
    }

    fallbackStartedAt.current = startedAt ?? Date.now();
    const updateElapsed = () => {
      const start = startedAt ?? fallbackStartedAt.current ?? Date.now();
      setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1_000)));
    };
    updateElapsed();
    const interval = window.setInterval(updateElapsed, 1_000);

    return () => window.clearInterval(interval);
  }, [active, startedAt]);

  return elapsed;
}

function readImageFile(file: File): Promise<AIImageAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read the image."));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Unable to read the image."));
        return;
      }
      resolve({
        source: "reference-image",
        dataUrl: reader.result,
        mediaType: file.type || "application/octet-stream",
        name: file.name,
      });
    };
    reader.readAsDataURL(file);
  });
}

interface ComposerProps {
  instruction: string;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
  supportsVision: boolean;
  configured: boolean;
  documentReady: boolean;
  busy: boolean;
  requestStartedAt?: number;
  requestProgress?: AIRequestProgress;
  onSend: (
    submission: AIChatSubmission,
  ) => Promise<AIChatSubmissionResult | void> | AIChatSubmissionResult | void;
  onCancel?: () => void;
  onCapturePreview?: () => Promise<AIImageAttachment | null>;
  dataSharingConsent?: AIDataSharingConsent;
  onConfirmDataSharing?: (
    destination: string,
  ) => Promise<boolean> | boolean;
  onInstructionChange: (instruction: string) => void;
  onBusyChange: (busy: boolean) => void;
}

function Composer({
  instruction,
  inputRef,
  supportsVision,
  configured,
  documentReady,
  busy,
  requestStartedAt,
  requestProgress,
  onSend,
  onCancel,
  onCapturePreview,
  dataSharingConsent,
  onConfirmDataSharing,
  onInstructionChange,
  onBusyChange,
}: ComposerProps) {
  const [attachment, setAttachment] =
    React.useState<AIImageAttachment | null>(null);
  const [feedback, setFeedback] = React.useState<Feedback | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [capturing, setCapturing] = React.useState(false);
  const [pendingConsent, setPendingConsent] =
    React.useState<AIChatSubmission | null>(null);
  const referenceInputRef = React.useRef<HTMLInputElement | null>(null);
  const elapsedSeconds = useElapsedSeconds(
    requestStartedAt,
    busy || submitting,
  );
  const unavailable =
    !configured || !documentReady || busy || submitting || pendingConsent !== null;

  const submit = async (submission: AIChatSubmission) => {
    setSubmitting(true);
    onBusyChange(true);
    setFeedback(null);
    setPendingConsent(null);
    try {
      const result = await onSend(submission);
      if (result?.accepted === false) {
        // The controller adds the clarification alongside the submitted
        // instruction, so preserve the editable draft without duplicating
        // the same message below the composer.
        return;
      }
      onInstructionChange("");
      setAttachment(null);
      setPendingConsent(null);
    } catch (error) {
      setFeedback({ kind: "error", message: getErrorMessage(error) });
    } finally {
      setSubmitting(false);
      onBusyChange(false);
    }
  };

  const handleSend = () => {
    const trimmed = instruction.trim();
    if (!trimmed) {
      setFeedback({ kind: "error", message: "Enter a modification request." });
      return;
    }

    const submission = {
      instruction: trimmed,
      ...(attachment ? { attachment } : {}),
    };
    if (analyzeAIIntent(trimmed).needsClarification) {
      void submit(submission);
      return;
    }
    if (dataSharingConsent?.required) {
      setPendingConsent(submission);
      return;
    }

    void submit(submission);
  };

  const confirmAndSend = async () => {
    if (!pendingConsent || !dataSharingConsent || !onConfirmDataSharing) {
      return;
    }

    try {
      const confirmed = await onConfirmDataSharing(
        dataSharingConsent.destination,
      );
      if (confirmed) {
        await submit(pendingConsent);
      }
    } catch (error) {
      setFeedback({ kind: "error", message: getErrorMessage(error) });
    }
  };

  const handleReferenceImage = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      setFeedback({ kind: "error", message: "Select an image file." });
      return;
    }
    if (
      !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)
    ) {
      setFeedback({
        kind: "error",
        message: "Use a PNG, JPEG, WebP, or GIF image.",
      });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setFeedback({
        kind: "error",
        message: "Reference images must be 8 MB or smaller.",
      });
      return;
    }

    try {
      setAttachment(await readImageFile(file));
      setFeedback(null);
    } catch (error) {
      setFeedback({ kind: "error", message: getErrorMessage(error) });
    }
  };

  const handleCapturePreview = async () => {
    if (!onCapturePreview) {
      return;
    }
    setCapturing(true);
    setFeedback(null);
    try {
      const image = await onCapturePreview();
      if (image) {
        setAttachment({ ...image, source: "current-preview" });
      }
    } catch (error) {
      setFeedback({ kind: "error", message: getErrorMessage(error) });
    } finally {
      setCapturing(false);
    }
  };

  const sendDisabled = unavailable || instruction.trim().length === 0;
  const attachmentDisabled =
    !supportsVision || busy || submitting || pendingConsent !== null;

  return (
    <div className="border-t bg-background p-3">
      {pendingConsent && dataSharingConsent && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">Confirm data sharing</p>
              <p className="mt-1">
                The complete DSL, view data, and recent instructions will be
                sent to <strong>{dataSharingConsent.destination}</strong>.
              </p>
              <div className="mt-2 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void confirmAndSend()}
                  disabled={!onConfirmDataSharing || submitting}
                >
                  Confirm &amp; send
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={submitting}
                  onClick={() => setPendingConsent(null)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {attachment && (
        <div className="mb-2 flex items-center gap-2 rounded-md border bg-muted/40 p-2">
          <img
            src={attachment.dataUrl}
            alt=""
            className="size-10 rounded border bg-white object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">
              {attachment.source === "current-preview"
                ? "Current preview"
                : attachment.name || "Reference image"}
            </p>
            <p className="text-muted-foreground text-[11px]">
              Used for this request only
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Remove image attachment"
            disabled={busy || submitting}
            onClick={() => setAttachment(null)}
          >
            <X />
          </Button>
        </div>
      )}

      <textarea
        ref={inputRef}
        aria-label="Modification request"
        value={instruction}
        rows={4}
        disabled={unavailable}
        placeholder={
          !configured
            ? "Configure an API connection before sending a request."
            : !documentReady
              ? "Load a DSL document before sending a request."
              : "Describe how to modify the DSL and visualization…"
        }
        className="border-input focus-visible:border-ring focus-visible:ring-ring/50 min-h-24 w-full resize-none rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-60"
        onChange={(event) => onInstructionChange(event.target.value)}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            (event.metaKey || event.ctrlKey) &&
            !sendDisabled
          ) {
            event.preventDefault();
            handleSend();
          }
        }}
      />

      <div className="mt-2 flex items-center gap-1.5">
        <input
          ref={referenceInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          tabIndex={-1}
          onChange={(event) => void handleReferenceImage(event)}
        />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={attachmentDisabled || !onCapturePreview || capturing}
          title={
            supportsVision
              ? "Attach the current preview to this request"
              : "Enable Vision input in API configuration"
          }
          onClick={() => void handleCapturePreview()}
        >
          {capturing ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <Camera />
          )}
          Current preview
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={attachmentDisabled}
          title={
            supportsVision
              ? "Attach a reference image to this request"
              : "Enable Vision input in API configuration"
          }
          onClick={() => referenceInputRef.current?.click()}
        >
          <ImagePlus />
          Reference image
        </Button>

        <span className="text-muted-foreground ml-auto text-[11px]">
          {busy || submitting ? (
            <>
              {requestProgress?.message ?? "Preparing the AI request…"}
              <span aria-hidden="true"> · {elapsedSeconds}s</span>
            </>
          ) : (
            "⌘/Ctrl + Enter to send"
          )}
        </span>
        {busy || submitting ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!onCancel}
            onClick={onCancel}
          >
            <Square className="fill-current" />
            Cancel request
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            disabled={sendDisabled}
            onClick={handleSend}
          >
            <Send />
            Send
          </Button>
        )}
      </div>

      {feedback && <FeedbackBanner feedback={feedback} className="mt-2" />}
    </div>
  );
}

const HISTORY_SOURCE_LABELS: Record<AIHistoryEntry["source"], string> = {
  ai: "AI",
  form: "Form",
  json: "JSON",
  "data-control": "Data Control",
  system: "System",
  undo: "Undo",
  redo: "Redo",
  migration: "Migration",
};

function getHistoryAffectedPaths(entry: AIHistoryEntry): readonly string[] {
  return entry.affectedPaths ?? entry.affected_paths ?? [];
}

interface HistoryPanelProps {
  entries: readonly AIHistoryEntry[];
  currentHistoryId?: string | null;
  busy: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onJump?: (entry: AIHistoryEntry) => void;
  onClear?: () => void;
}

function HistoryPanel({
  entries,
  currentHistoryId,
  busy,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onJump,
  onClear,
}: HistoryPanelProps) {
  const visibleEntries = entries.slice(-20).reverse();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b p-3">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!canUndo || busy || !onUndo}
          onClick={onUndo}
        >
          <RotateCcw />
          Undo
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!canRedo || busy || !onRedo}
          onClick={onRedo}
        >
          <RotateCw />
          Redo
        </Button>
        {onClear && entries.length > 0 && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-auto text-destructive hover:text-destructive"
            disabled={busy}
            onClick={onClear}
          >
            <Trash2 />
            Clear
          </Button>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {visibleEntries.length === 0 ? (
          <div className="text-muted-foreground flex h-48 flex-col items-center justify-center px-8 text-center">
            <History className="mb-2 size-6" />
            <p className="text-sm">No persisted edits yet.</p>
          </div>
        ) : (
          <ol className="space-y-2 p-3">
            {visibleEntries.map((entry) => {
              const selected = entry.id === currentHistoryId;
              const affectedPaths = getHistoryAffectedPaths(entry);
              const paths = affectedPaths.slice(0, 3);
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    disabled={busy || !onJump}
                    aria-current={selected ? "step" : undefined}
                    onClick={() => onJump?.(entry)}
                    className={cn(
                      "hover:bg-accent focus-visible:ring-ring/50 w-full rounded-md border p-3 text-left outline-none transition-colors focus-visible:ring-[3px] disabled:cursor-default disabled:opacity-70",
                      selected && "border-blue-300 bg-blue-50",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                        {HISTORY_SOURCE_LABELS[entry.source]}
                      </span>
                      <time className="text-muted-foreground ml-auto flex items-center gap-1 text-[10px]">
                        <Clock3 className="size-3" />
                        {formatTime(entry.timestamp)}
                      </time>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {paths.length === 0 ? (
                        <span className="text-muted-foreground text-[11px]">
                          No affected paths
                        </span>
                      ) : (
                        paths.map((path) => (
                          <code
                            key={path}
                            className="max-w-full truncate rounded bg-muted px-1.5 py-0.5 text-[10px]"
                            title={path}
                          >
                            {path}
                          </code>
                        ))
                      )}
                      {affectedPaths.length > paths.length && (
                        <span className="text-muted-foreground px-1 text-[10px]">
                          +{affectedPaths.length - paths.length} more
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </ScrollArea>
    </div>
  );
}

export function AIChatDialog({
  open,
  onOpenChange,
  config,
  messages = [],
  history = [],
  currentHistoryId,
  preview,
  isRequesting = false,
  requestStartedAt,
  requestProgress,
  documentReady = true,
  canUndo = false,
  canRedo = false,
  onSaveConfig,
  onTestConfig,
  onSend,
  onCancel,
  onCapturePreview,
  onUndo,
  onRedo,
  onJumpToHistory,
  onClearHistory,
  dataSharingConsent,
  onConfirmDataSharing,
}: AIChatDialogProps) {
  const [activeTab, setActiveTab] = React.useState<"preview" | "history">(
    "preview",
  );
  const [composerBusy, setComposerBusy] = React.useState(false);
  const [instruction, setInstruction] = React.useState("");
  const composerInputRef = React.useRef<HTMLTextAreaElement | null>(null);
  const busy = isRequesting || composerBusy;
  const configured =
    Boolean(config.baseUrl) && Boolean(config.model) && config.hasApiKey;

  const handleReuseInstruction = React.useCallback((text: string) => {
    setInstruction(text);
    composerInputRef.current?.focus();
  }, []);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && busy) {
      return;
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        preventClose={busy}
        className="flex h-[min(860px,calc(100vh-3rem))] w-[min(1240px,calc(100vw-3rem))] max-w-none flex-col overflow-hidden"
      >
        <DialogHeader className="shrink-0 border-b px-5 py-4 pr-14">
          <DialogTitle>AI semantic editor</DialogTitle>
          <DialogDescription>
            Modify the complete DSL and view data through validated,
            reversible JSON Patch operations.
            {busy && " Cancel the active request before closing."}
          </DialogDescription>
        </DialogHeader>

        <ConfigurationPanel
          config={config}
          disabled={busy}
          onSave={onSaveConfig}
          onTest={onTestConfig}
        />

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)]">
          <section
            className="flex min-h-0 min-w-0 flex-col border-r"
            aria-label="AI conversation"
          >
            <ScrollArea className="min-h-0 flex-1 [&_[data-radix-scroll-area-viewport]>div]:h-full">
              <Conversation
                messages={messages}
                onReuseInstruction={handleReuseInstruction}
                reuseDisabled={busy}
              />
            </ScrollArea>
            <Composer
              instruction={instruction}
              inputRef={composerInputRef}
              supportsVision={config.supportsVision}
              configured={configured}
              documentReady={documentReady}
              busy={busy}
              requestStartedAt={requestStartedAt}
              requestProgress={requestProgress}
              onSend={onSend}
              onCancel={onCancel}
              onCapturePreview={onCapturePreview}
              dataSharingConsent={dataSharingConsent}
              onConfirmDataSharing={onConfirmDataSharing}
              onInstructionChange={setInstruction}
              onBusyChange={setComposerBusy}
            />
          </section>

          <section className="flex min-h-0 min-w-0 flex-col">
            <div
              role="tablist"
              aria-label="Result details"
              className="flex shrink-0 border-b bg-muted/20 px-2 pt-2"
            >
              <button
                type="button"
                role="tab"
                id="ai-preview-tab"
                aria-selected={activeTab === "preview"}
                aria-controls="ai-preview-panel"
                onClick={() => setActiveTab("preview")}
                className={cn(
                  "focus-visible:ring-ring/50 flex items-center gap-2 rounded-t-md border border-b-0 px-4 py-2 text-sm outline-none focus-visible:ring-[3px]",
                  activeTab === "preview"
                    ? "bg-background font-medium"
                    : "text-muted-foreground border-transparent",
                )}
              >
                <Eye className="size-4" />
                Preview
              </button>
              <button
                type="button"
                role="tab"
                id="ai-history-tab"
                aria-selected={activeTab === "history"}
                aria-controls="ai-history-panel"
                onClick={() => setActiveTab("history")}
                className={cn(
                  "focus-visible:ring-ring/50 flex items-center gap-2 rounded-t-md border border-b-0 px-4 py-2 text-sm outline-none focus-visible:ring-[3px]",
                  activeTab === "history"
                    ? "bg-background font-medium"
                    : "text-muted-foreground border-transparent",
                )}
              >
                <History className="size-4" />
                History
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
                  {Math.min(history.length, 20)}
                </span>
              </button>
            </div>

            <div
              id="ai-preview-panel"
              role="tabpanel"
              aria-labelledby="ai-preview-tab"
              hidden={activeTab !== "preview"}
              className="min-h-0 flex-1 bg-muted/30 p-4"
            >
              {preview ?? (
                <div className="text-muted-foreground flex h-full min-h-52 items-center justify-center rounded-lg border border-dashed bg-background text-sm">
                  Preview is not available.
                </div>
              )}
            </div>

            <div
              id="ai-history-panel"
              role="tabpanel"
              aria-labelledby="ai-history-tab"
              hidden={activeTab !== "history"}
              className="min-h-0 flex-1"
            >
              <HistoryPanel
                entries={history}
                currentHistoryId={currentHistoryId}
                busy={busy}
                canUndo={canUndo}
                canRedo={canRedo}
                onUndo={onUndo}
                onRedo={onRedo}
                onJump={onJumpToHistory}
                onClear={onClearHistory}
              />
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
