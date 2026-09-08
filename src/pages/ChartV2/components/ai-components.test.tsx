import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AIChatDialog } from "./AIChatDialog";
import { AIWorkspace } from "./AIWorkspace";
import { EditorAIController } from "./EditorAIController";
import {
  DEFAULT_AI_CONFIG,
  type AIConfigDraft,
  type AIConfigStatus,
  type JsonPatchOperation,
} from "../model/ai";
import { AIServiceError } from "@/services/ai";

const aiMocks = vi.hoisted(() => ({
  chat: vi.fn(),
  getConfig: vi.fn(),
  saveConfig: vi.fn(),
  testConfig: vi.fn(),
}));

const editorMocks = vi.hoisted(() => ({
  applyAIPatch: vi.fn(),
  clearEditorHistory: vi.fn(),
  getModelDocument: vi.fn(),
  jumpEditorHistory: vi.fn(),
  redoEditorDocument: vi.fn(),
  state: {
    dsl_file: "07_iForest",
    dsl_json: {
      history: {
        cursor: 0,
        entries: [],
      },
    },
    isSaving: false,
  } as {
    dsl_file: string;
    dsl_json: {
      history: {
        cursor: number;
        entries: Array<{
          id: string;
          timestamp: string;
          source: "ai";
          affected_paths: string[];
          forward_patch: [];
          inverse_patch: [];
        }>;
      };
    } | undefined;
    isSaving: boolean;
  },
  undoEditorDocument: vi.fn(),
}));

vi.mock("@/services/ai", () => {
  class MockAIServiceError extends Error {
    readonly status: number;
    readonly code?: string;

    constructor(message: string, status: number, code?: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }

  return {
    AIServiceError: MockAIServiceError,
    aiClient: {
      chat: aiMocks.chat,
      getConfig: aiMocks.getConfig,
      saveConfig: aiMocks.saveConfig,
      testConfig: aiMocks.testConfig,
    },
  };
});

vi.mock("../model/editor", () => {
  class MockEditorPatchValidationError extends Error {
    readonly code = "AI_PATCH_VALIDATION_FAILED";
  }

  const useChartStore = (
    selector: (state: typeof editorMocks.state) => unknown,
  ) => selector(editorMocks.state);
  useChartStore.getState = () => editorMocks.state;

  return {
    EditorPatchValidationError: MockEditorPatchValidationError,
    applyAIPatch: editorMocks.applyAIPatch,
    clearEditorHistory: editorMocks.clearEditorHistory,
    getModelDocument: editorMocks.getModelDocument,
    jumpEditorHistory: editorMocks.jumpEditorHistory,
    redoEditorDocument: editorMocks.redoEditorDocument,
    undoEditorDocument: editorMocks.undoEditorDocument,
    useChartStore,
  };
});

const CONFIG: AIConfigStatus = {
  ...DEFAULT_AI_CONFIG,
  baseUrl: "https://model.example/v1",
  model: "test-model",
  hasApiKey: true,
};

const SUCCESSFUL_SAVE = {
  saved: true,
  config: CONFIG,
  test: {
    ok: true,
    message: "Connection successful.",
  },
};

const requiredDialogProps = {
  config: CONFIG,
  onSaveConfig: vi.fn(async () => SUCCESSFUL_SAVE),
  onSend: vi.fn(async () => undefined),
};

const localStorageValues = new Map<string, string>();
const localStorageMock: Storage = {
  get length() {
    return localStorageValues.size;
  },
  clear() {
    localStorageValues.clear();
  },
  getItem(key) {
    return localStorageValues.get(key) ?? null;
  },
  key(index) {
    return [...localStorageValues.keys()][index] ?? null;
  },
  removeItem(key) {
    localStorageValues.delete(key);
  },
  setItem(key, value) {
    localStorageValues.set(key, String(value));
  },
};

Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: localStorageMock,
});

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });

  editorMocks.state.dsl_json = {
    history: {
      cursor: 0,
      entries: [],
    },
  };
  editorMocks.state.dsl_file = "07_iForest";
  editorMocks.state.isSaving = false;
  editorMocks.getModelDocument.mockReturnValue({
    dsl: { title: "example" },
    viewData: { marks: {} },
  });
  editorMocks.applyAIPatch.mockResolvedValue(null);
  editorMocks.undoEditorDocument.mockResolvedValue(true);
  editorMocks.redoEditorDocument.mockResolvedValue(true);
  editorMocks.jumpEditorHistory.mockResolvedValue(true);
  editorMocks.clearEditorHistory.mockResolvedValue(true);

  aiMocks.getConfig.mockResolvedValue(CONFIG);
  aiMocks.saveConfig.mockResolvedValue(SUCCESSFUL_SAVE);
  aiMocks.testConfig.mockResolvedValue(SUCCESSFUL_SAVE.test);
  aiMocks.chat.mockResolvedValue({ patch: [] });
});

async function getReadyControllerComposer() {
  await waitFor(() => expect(aiMocks.getConfig).toHaveBeenCalledOnce());
  const composer = await screen.findByLabelText("Modification request");
  await waitFor(() => {
    expect(composer).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /API configuration/i }),
    ).toHaveFocus();
  });
  return composer;
}

describe("AIChatDialog", () => {
  it("defaults to long-running AI request limits", () => {
    expect(DEFAULT_AI_CONFIG.maxOutputTokens).toBe(65_536);
    expect(DEFAULT_AI_CONFIG.timeoutMs).toBe(600_000);
  });

  it("renders a structured summary for a saved AI change", () => {
    render(
      <AIChatDialog
        {...requiredDialogProps}
        open
        onOpenChange={vi.fn()}
        messages={[
          {
            id: "status-1",
            role: "status",
            status: "success",
            text: "Changes applied and saved.",
            timestamp: "2026-08-01T10:00:00.000Z",
            changeSummary: {
              counts: { added: 1, changed: 3, removed: 2 },
              entryId: "history-ai-1",
              items: [
                { operation: "changed", path: "/description" },
                { operation: "added", path: "/view_data/marks/new-mark" },
                { operation: "removed", path: "/view_data/cache/old-mark" },
                { operation: "changed", path: "/title" },
                { operation: "changed", path: "/specification/0/x" },
                { operation: "removed", path: "/unused" },
              ],
              scopes: { dsl: 3, viewData: 3 },
              semantic: {
                title: "Improved chart labels and layout",
                overview:
                  "The saved update clarifies the labels and aligns their rendered positions.",
                changes: [
                  {
                    area: "dsl",
                    description: "Clarified the chart wording.",
                  },
                  {
                    area: "viewData",
                    description: "Aligned the persisted label positions.",
                  },
                ],
              },
              timestamp: "2026-08-01T10:00:00.000Z",
              total: 6,
            },
          },
        ]}
      />,
    );

    const summary = screen.getByLabelText("Change summary");
    expect(summary).toHaveAttribute("data-history-entry-id", "history-ai-1");
    expect(within(summary).getByText("AI summary")).toBeInTheDocument();
    expect(
      within(summary).getByText("Improved chart labels and layout"),
    ).toBeInTheDocument();
    expect(
      within(summary).getByText("Aligned the persisted label positions."),
    ).toBeInTheDocument();
    expect(
      within(summary).getByText("Verified saved JSON details"),
    ).toBeInTheDocument();
    expect(within(summary).getByText("6 changes")).toBeInTheDocument();
    expect(within(summary).getByText("1 added")).toBeInTheDocument();
    expect(within(summary).getByText("3 changed")).toBeInTheDocument();
    expect(within(summary).getByText("2 removed")).toBeInTheDocument();
    expect(within(summary).getByText("/description")).toBeInTheDocument();
    expect(within(summary).getByText("+1 more path")).toBeInTheDocument();
    expect(within(summary).queryByText("/unused")).not.toBeInTheDocument();
    expect(summary.closest("article")?.querySelector("time")).toHaveAttribute(
      "datetime",
      "2026-08-01T10:00:00.000Z",
    );
  });

  it("renders HTML-like and long unbroken summary content safely", () => {
    const maliciousTitle = '<img src=x onerror="window.hacked=true">';
    const maliciousOverview = "<script>window.hacked=true</script>";
    const longDescription = "unbroken".repeat(60);

    render(
      <AIChatDialog
        {...requiredDialogProps}
        open
        onOpenChange={vi.fn()}
        messages={[
          {
            id: "status-untrusted-summary",
            role: "status",
            status: "success",
            text: "Changes applied and saved.",
            timestamp: "2026-08-01T10:00:00.000Z",
            changeSummary: {
              counts: { added: 0, changed: 1, removed: 0 },
              entryId: "history-untrusted-summary",
              items: [{ operation: "changed", path: "/description" }],
              scopes: { dsl: 1, viewData: 0 },
              semantic: {
                title: maliciousTitle,
                overview: maliciousOverview,
                changes: [
                  {
                    area: "dsl",
                    description: "<script>alert('change')</script>",
                  },
                  {
                    area: "dsl",
                    description: longDescription,
                  },
                ],
              },
              timestamp: "2026-08-01T10:00:00.000Z",
              total: 1,
            },
          },
        ]}
      />,
    );

    const summary = screen.getByLabelText("Change summary");
    const title = within(summary).getByText(maliciousTitle);
    const overview = within(summary).getByText(maliciousOverview);
    const description = within(summary).getByText(longDescription);
    for (const semanticText of [title, overview, description]) {
      expect(semanticText).toHaveClass("min-w-0", "break-words");
      expect(semanticText.getAttribute("class"))
        .toContain("[overflow-wrap:anywhere]");
    }
    expect(summary.querySelector("img")).toBeNull();
    expect(summary.querySelector("script")).toBeNull();
  });

  it("never echoes a saved key and treats a blank key as keep-existing", async () => {
    const user = userEvent.setup();
    const onSaveConfig = vi.fn(async (draft: AIConfigDraft) => {
      void draft;
      return SUCCESSFUL_SAVE;
    });

    render(
      <AIChatDialog
        {...requiredDialogProps}
        open
        onOpenChange={vi.fn()}
        onSaveConfig={onSaveConfig}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /API configuration/i }),
    );
    const keyInput = screen.getByLabelText(/API Key/i);
    expect(keyInput).toHaveValue("");
    expect(keyInput).toHaveAttribute("placeholder", "Saved securely");
    expect(document.body).not.toHaveTextContent(/sk-test-secret/i);

    await user.click(screen.getByRole("button", { name: /Save & test/i }));

    await waitFor(() => expect(onSaveConfig).toHaveBeenCalledOnce());
    expect(onSaveConfig.mock.calls[0]?.[0]).toMatchObject({ apiKey: "" });

    expect(screen.getByLabelText(/API Key/i)).toHaveValue("");
  });

  it("clears a newly entered key immediately after saving", async () => {
    const user = userEvent.setup();
    const onSaveConfig = vi.fn(async (draft: AIConfigDraft) => {
      void draft;
      return SUCCESSFUL_SAVE;
    });

    render(
      <AIChatDialog
        {...requiredDialogProps}
        open
        onOpenChange={vi.fn()}
        onSaveConfig={onSaveConfig}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /API configuration/i }),
    );
    await user.type(screen.getByLabelText(/API Key/i), "replacement-secret");
    await user.click(screen.getByRole("button", { name: /Save & test/i }));

    await waitFor(() =>
      expect(onSaveConfig.mock.calls[0]?.[0]).toMatchObject({
        apiKey: "replacement-secret",
      }),
    );
    expect(screen.getByLabelText(/API Key/i)).toHaveValue("");
    expect(document.body).not.toHaveTextContent("replacement-secret");
  });

  it("requires a new key when the Base URL destination changes", async () => {
    const user = userEvent.setup();
    const onSaveConfig = vi.fn(async () => SUCCESSFUL_SAVE);

    render(
      <AIChatDialog
        {...requiredDialogProps}
        open
        onOpenChange={vi.fn()}
        onSaveConfig={onSaveConfig}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /API configuration/i }),
    );
    await user.clear(screen.getByLabelText("Base URL"));
    await user.type(
      screen.getByLabelText("Base URL"),
      "https://another-model.example/v1",
    );

    expect(screen.getByText("(required for new Base URL)")).toBeInTheDocument();
    expect(screen.getByLabelText(/API Key/i)).toHaveAttribute(
      "placeholder",
      "Enter key for new Base URL",
    );

    await user.click(screen.getByRole("button", { name: /Save & test/i }));

    expect(onSaveConfig).not.toHaveBeenCalled();
    expect(
      screen.getByText("API Key is required for the new Base URL."),
    ).toBeInTheDocument();
  });

  it("cannot close while requesting and exposes an explicit Cancel action", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onCancel = vi.fn();

    render(
      <AIChatDialog
        {...requiredDialogProps}
        open
        isRequesting
        requestStartedAt={Date.now()}
        onOpenChange={onOpenChange}
        onCancel={onCancel}
      />,
    );

    await waitFor(() => expect(screen.getByRole("button", { name: "Close dialog" })).toBeDisabled());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /Cancel request/i }),
    );
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("renders a readable intent plan and its active live-update phase", () => {
    render(
      <AIChatDialog
        {...requiredDialogProps}
        open
        onOpenChange={vi.fn()}
        messages={[
          {
            id: "intent-1",
            role: "status",
            status: "pending",
            text: "Drafting a safe JSON Patch…",
            timestamp: "2026-08-01T10:00:00.000Z",
            intent: {
              kind: "visual",
              title: "Visual refinement",
              overview: "Prepare and validate a small visual update.",
              targets: [
                { area: "dsl", description: "DSL structure and presentation" },
              ],
              steps: ["analyzing", "connecting", "generating", "validating", "saving"],
              needsClarification: false,
            },
            progress: {
              phase: "generating",
              message: "Drafting a safe JSON Patch…",
            },
          },
        ]}
      />,
    );

    const intent = screen.getByLabelText("Intent analysis");
    expect(within(intent).getByText("Visual refinement")).toBeInTheDocument();
    expect(within(intent).getByLabelText("Edit targets")).toHaveTextContent("DSL");
    expect(within(intent).getByLabelText("Request progress")).toHaveTextContent(
      "Draft Patch",
    );
    expect(
      screen.getByText("Drafting a safe JSON Patch…"),
    ).toHaveAttribute("role", "status");
  });

  it("releases a confirmed sharing request after submission failure", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn().mockRejectedValue(new Error("Model unavailable."));
    const onConfirmDataSharing = vi.fn().mockResolvedValue(true);

    render(
      <AIChatDialog
        {...requiredDialogProps}
        open
        onOpenChange={vi.fn()}
        onSend={onSend}
        dataSharingConsent={{
          required: true,
          destination: "https://model.example/v1",
        }}
        onConfirmDataSharing={onConfirmDataSharing}
      />,
    );

    const composer = screen.getByLabelText("Modification request");
    fireEvent.change(composer, { target: { value: "Change the title" } });
    await user.click(screen.getByRole("button", { name: "Send" }));
    await user.click(
      await screen.findByRole("button", { name: "Confirm & send" }),
    );

    expect(await screen.findByText("Model unavailable.")).toBeInTheDocument();
    await waitFor(() => expect(composer).toBeEnabled());
    expect(composer).toHaveValue("Change the title");
    expect(screen.queryByText("Confirm data sharing")).not.toBeInTheDocument();
  });
});

describe("AIWorkspace", () => {
  it("handles global undo/redo shortcuts without stealing input undo", () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();

    render(
      <>
        <input aria-label="External editor input" />
        <AIWorkspace
          {...requiredDialogProps}
          canUndo
          canRedo
          onUndo={onUndo}
          onRedo={onRedo}
        />
      </>,
    );

    expect(
      within(screen.getByLabelText("AI editor controls")).getByRole("button", {
        name: "Open JSON version diff",
      }),
    ).toBeDisabled();

    fireEvent.keyDown(window, { key: "z", metaKey: true });
    fireEvent.keyDown(window, { key: "Z", ctrlKey: true, shiftKey: true });
    expect(onUndo).toHaveBeenCalledOnce();
    expect(onRedo).toHaveBeenCalledOnce();

    const input = screen.getByLabelText("External editor input");
    fireEvent.keyDown(input, { key: "z", metaKey: true });
    fireEvent.keyDown(input, { key: "Z", ctrlKey: true, shiftKey: true });
    expect(onUndo).toHaveBeenCalledOnce();
    expect(onRedo).toHaveBeenCalledOnce();
  });
});

describe("EditorAIController", () => {
  it("keeps submitted instructions visible and reuses one in the composer", async () => {
    const user = userEvent.setup();
    const firstInstruction = "Make the title blue";
    const secondInstruction = "Make the labels larger";
    window.localStorage.setItem(
      "vitejs-d3.ai.confirmed-data-destinations.v1",
      JSON.stringify(["https://model.example/v1"]),
    );

    render(<EditorAIController workspaceProps={{ defaultOpen: true }} />);

    const composer = await getReadyControllerComposer();
    await user.type(composer, firstInstruction);
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(aiMocks.chat).toHaveBeenCalledOnce());
    await waitFor(() => expect(composer).toHaveValue(""));

    await user.type(composer, secondInstruction);
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(aiMocks.chat).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(composer).toHaveValue(""));

    expect(
      screen.getByRole("button", {
        name: `Reuse request: ${firstInstruction}`,
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: `Reuse request: ${secondInstruction}`,
      }),
    ).toBeVisible();
    expect(
      screen.getAllByRole("button", { name: /Reuse request:/ }),
    ).toHaveLength(2);

    await user.click(
      screen.getByRole("button", {
        name: `Reuse request: ${firstInstruction}`,
      }),
    );

    expect(composer).toHaveValue(firstInstruction);
    expect(composer).toHaveFocus();
    expect(aiMocks.chat).toHaveBeenCalledTimes(2);
  });

  it("keeps a vague instruction editable and asks for a concrete chart outcome", async () => {
    const user = userEvent.setup();

    render(<EditorAIController workspaceProps={{ defaultOpen: true }} />);

    const composer = await getReadyControllerComposer();
    await user.type(composer, "优化一下");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(
      await screen.findByText(/Name the chart element and the desired outcome/i),
    ).toBeInTheDocument();
    expect(composer).toHaveValue("优化一下");
    expect(composer).toBeEnabled();
    expect(screen.queryByText("Confirm data sharing")).not.toBeInTheDocument();
    expect(aiMocks.chat).not.toHaveBeenCalled();
  });

  it("reflects stream status events before accepting a completed Patch", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      "vitejs-d3.ai.confirmed-data-destinations.v1",
      JSON.stringify(["https://model.example/v1"]),
    );
    let resolveChat: ((value: { patch: JsonPatchOperation[] }) => void) | undefined;
    aiMocks.chat.mockImplementation(
      (
        _request: unknown,
        options:
          | {
              onEvent?: (event: {
                type: "status";
                phase: "connecting" | "generating";
                message: string;
              }) => void;
            }
          | undefined,
      ) => {
        options?.onEvent?.({
          type: "status",
          phase: "connecting",
          message: "Connecting to the configured model…",
        });
        options?.onEvent?.({
          type: "status",
          phase: "generating",
          message: "Drafting a safe JSON Patch…",
        });
        return new Promise<{ patch: JsonPatchOperation[] }>((resolve) => {
          resolveChat = resolve;
        });
      },
    );

    render(<EditorAIController workspaceProps={{ defaultOpen: true }} />);

    const composer = await getReadyControllerComposer();
    await user.type(composer, "Make the title blue");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Drafting a safe JSON Patch…",
    );
    expect(editorMocks.applyAIPatch).not.toHaveBeenCalled();

    resolveChat?.({ patch: [] });
    expect(await screen.findByText("No changes")).toBeInTheDocument();
    expect(editorMocks.applyAIPatch).not.toHaveBeenCalled();
  });

  it("confirms first-use data sharing per Base URL and reports an empty Patch", async () => {
    const user = userEvent.setup();

    render(<EditorAIController workspaceProps={{ defaultOpen: true }} />);

    const composer = await getReadyControllerComposer();
    await user.type(composer, "Make the chart blue");
    const firstSendButton = screen.getByRole("button", { name: "Send" });
    await waitFor(() => expect(firstSendButton).toBeEnabled());
    await user.click(firstSendButton);

    expect(
      await screen.findByText("Confirm data sharing"),
    ).toBeInTheDocument();
    expect(aiMocks.chat).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: /Confirm & send/i }),
    );
    await waitFor(() => expect(aiMocks.chat).toHaveBeenCalledOnce());
    expect(await screen.findByText("No changes")).toBeInTheDocument();
    expect(screen.queryByLabelText("Change summary")).not.toBeInTheDocument();
    expect(editorMocks.applyAIPatch).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(
      "vitejs-d3.ai.confirmed-data-destinations.v1",
    )).toContain("https://model.example/v1");

    const nextComposer = screen.getByLabelText("Modification request");
    await waitFor(() => {
      expect(nextComposer).toBeEnabled();
      expect(nextComposer).toHaveValue("");
      expect(screen.queryByText("Confirm data sharing")).not.toBeInTheDocument();
    });
    aiMocks.chat.mockResolvedValueOnce({
      patch: [
        { op: "replace", path: "/dsl/title", value: "Canonical no-op" },
      ],
    });
    await user.type(nextComposer, "Make the labels larger");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(aiMocks.chat).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(editorMocks.applyAIPatch).toHaveBeenCalledOnce());
    expect(screen.getAllByText("No changes")).toHaveLength(2);
    expect(screen.queryByLabelText("Change summary")).not.toBeInTheDocument();
    expect(screen.queryByText("Confirm data sharing")).not.toBeInTheDocument();
  });

  it("clears the draft, attachment, and pending consent when the DSL file changes", async () => {
    const user = userEvent.setup();
    aiMocks.getConfig.mockResolvedValueOnce({
      ...CONFIG,
      supportsVision: true,
    });

    const { rerender } = render(
      <EditorAIController workspaceProps={{ defaultOpen: true }} />,
    );

    const composer = await getReadyControllerComposer();
    const referenceInput = document.querySelector<HTMLInputElement>(
      'input[type="file"]',
    );
    expect(referenceInput).not.toBeNull();
    await user.upload(
      referenceInput!,
      new File(["image"], "old-file.png", { type: "image/png" }),
    );
    expect(
      await screen.findByRole("button", { name: "Remove image attachment" }),
    ).toBeInTheDocument();

    await user.type(composer, "Pending request for the first file");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(
      await screen.findByText("Confirm data sharing"),
    ).toBeInTheDocument();
    expect(aiMocks.chat).not.toHaveBeenCalled();

    editorMocks.state.dsl_file = "08_bitextract";
    editorMocks.state.dsl_json = {
      history: {
        cursor: 0,
        entries: [],
      },
    };
    rerender(<EditorAIController workspaceProps={{ defaultOpen: true }} />);

    await waitFor(() => {
      expect(screen.queryByText("Confirm data sharing")).not
        .toBeInTheDocument();
      expect(screen.queryByRole("button", {
        name: "Remove image attachment",
      })).not.toBeInTheDocument();
    });
    const nextComposer = screen.getByLabelText("Modification request");
    expect(nextComposer).toBeEnabled();
    expect(nextComposer).toHaveValue("");
    expect(aiMocks.chat).not.toHaveBeenCalled();
  });

  it("shows one canonical change summary for each successful AI adjustment", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      "vitejs-d3.ai.confirmed-data-destinations.v1",
      JSON.stringify(["https://model.example/v1"]),
    );
    aiMocks.chat
      .mockResolvedValueOnce({
        patch: [
          { op: "replace", path: "/dsl/title", value: "First raw patch" },
        ],
        semanticSummary: {
          title: "First semantic update",
          overview: "The first adjustment improves the chart labels.",
          changes: [
            { area: "dsl", description: "Clarified the label wording." },
            {
              area: "viewData",
              description: "Aligned the persisted label positions.",
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        patch: [
          { op: "replace", path: "/dsl/title", value: "Second raw patch" },
        ],
        semanticSummary: {
          title: "Second semantic update",
          overview: "The second adjustment removes the old title.",
          changes: [
            { area: "dsl", description: "Removed the obsolete title." },
          ],
        },
      });
    editorMocks.applyAIPatch
      .mockResolvedValueOnce({
        affected_paths: ["/description", "/view_data/marks/label"],
        forward_patch: [
          { op: "replace", path: "/description", value: "First saved value" },
          {
            op: "add",
            path: "/view_data/marks/label",
            value: { text: "Label" },
          },
          {
            op: "replace",
            path: "/metadata/updated_at",
            value: "2026-08-01T10:00:00.000Z",
          },
        ],
        id: "history-ai-1",
        inverse_patch: [],
        source: "ai",
        timestamp: "2026-08-01T10:00:00.000Z",
      })
      .mockResolvedValueOnce({
        affected_paths: ["/title"],
        forward_patch: [
          { op: "remove", path: "/title" },
          {
            op: "replace",
            path: "/metadata/updated_at",
            value: "2026-08-01T10:01:00.000Z",
          },
        ],
        id: "history-ai-2",
        inverse_patch: [],
        source: "ai",
        timestamp: "2026-08-01T10:01:00.000Z",
      });

    render(<EditorAIController workspaceProps={{ defaultOpen: true }} />);

    const composer = await getReadyControllerComposer();
    await user.type(composer, "Apply the first adjustment");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => {
      expect(screen.getAllByLabelText("Change summary")).toHaveLength(1);
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Modification request")).toBeEnabled();
    });
    await user.type(
      screen.getByLabelText("Modification request"),
      "Apply the second adjustment",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getAllByLabelText("Change summary")).toHaveLength(2);
    });
    const summaries = screen.getAllByLabelText("Change summary");
    expect(summaries[0]).toHaveAttribute(
      "data-history-entry-id",
      "history-ai-1",
    );
    expect(within(summaries[0]).getByText("1 added")).toBeInTheDocument();
    expect(within(summaries[0]).getByText("1 changed")).toBeInTheDocument();
    expect(within(summaries[0]).getByText("First semantic update"))
      .toBeInTheDocument();
    expect(within(summaries[0]).getByText("/description")).toBeInTheDocument();
    expect(within(summaries[0]).getByText("/view_data/marks/label"))
      .toBeInTheDocument();
    expect(summaries[1]).toHaveAttribute(
      "data-history-entry-id",
      "history-ai-2",
    );
    expect(within(summaries[1]).getByText("1 removed")).toBeInTheDocument();
    expect(within(summaries[1]).getByText("Second semantic update"))
      .toBeInTheDocument();
    expect(within(summaries[1]).getByText("/title")).toBeInTheDocument();
    expect(screen.getAllByText("Changes applied and saved.")).toHaveLength(2);
  });

  it("isolates conversation state and cancels requests when the DSL file changes", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      "vitejs-d3.ai.confirmed-data-destinations.v1",
      JSON.stringify(["https://model.example/v1"]),
    );
    let pendingSignal: AbortSignal | undefined;
    aiMocks.chat
      .mockResolvedValueOnce({
        patch: [
          { op: "replace", path: "/dsl/title", value: "First file title" },
        ],
        semanticSummary: {
          title: "Updated the first file",
          overview: "The first DSL now has a clearer title.",
          changes: [
            { area: "dsl", description: "Changed the first file title." },
          ],
        },
      })
      .mockImplementationOnce(
        (
          _request: unknown,
          options: { signal?: AbortSignal } | undefined,
        ) => {
          pendingSignal = options?.signal;
          return new Promise((_resolve, reject) => {
            pendingSignal?.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          });
        },
      )
      .mockResolvedValueOnce({ patch: [] });
    editorMocks.applyAIPatch.mockResolvedValueOnce({
      affected_paths: ["/title"],
      forward_patch: [
        { op: "replace", path: "/title", value: "First file title" },
      ],
      id: "history-first-file",
      inverse_patch: [],
      source: "ai",
      timestamp: "2026-08-01T10:03:00.000Z",
    });

    const { rerender } = render(
      <EditorAIController workspaceProps={{ defaultOpen: true }} />,
    );

    const firstComposer = await getReadyControllerComposer();
    await user.type(firstComposer, "Update the first file");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Updated the first file")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByLabelText("Modification request")).toBeEnabled();
    });
    await user.type(
      screen.getByLabelText("Modification request"),
      "Keep changing the first file",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(aiMocks.chat).toHaveBeenCalledTimes(2));

    editorMocks.state.dsl_file = "08_bitextract";
    editorMocks.state.dsl_json = {
      history: {
        cursor: 0,
        entries: [],
      },
    };
    rerender(<EditorAIController workspaceProps={{ defaultOpen: true }} />);

    await waitFor(() => expect(pendingSignal?.aborted).toBe(true));
    await waitFor(() => {
      expect(screen.queryByText("Updated the first file")).not
        .toBeInTheDocument();
      expect(screen.queryByText("Update the first file")).not
        .toBeInTheDocument();
      expect(screen.queryByText("Keep changing the first file")).not
        .toBeInTheDocument();
    });

    const nextComposer = screen.getByLabelText("Modification request");
    await waitFor(() => expect(nextComposer).toBeEnabled());
    expect(nextComposer).toHaveValue("");
    await user.type(nextComposer, "Update the second file");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(aiMocks.chat).toHaveBeenCalledTimes(3));
    expect(aiMocks.chat.mock.calls[2]?.[0]).toMatchObject({
      instruction: "Update the second file",
      recentInstructions: [],
    });
  });

  it("does not report a saved-change summary when applying the Patch fails", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      "vitejs-d3.ai.confirmed-data-destinations.v1",
      JSON.stringify(["https://model.example/v1"]),
    );
    aiMocks.chat.mockResolvedValueOnce({
      patch: [
        { op: "replace", path: "/dsl/title", value: "Unsaved title" },
      ],
    });
    editorMocks.applyAIPatch.mockRejectedValueOnce(
      new Error("The document could not be saved."),
    );

    render(<EditorAIController workspaceProps={{ defaultOpen: true }} />);

    const composer = await getReadyControllerComposer();
    await user.type(composer, "Apply a change that cannot be saved");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(
      await screen.findAllByText("The document could not be saved."),
    ).not.toHaveLength(0);
    expect(screen.queryByLabelText("Change summary")).not.toBeInTheDocument();
    expect(screen.queryByText("Changes applied and saved.")).not
      .toBeInTheDocument();
  });

  it("aborts the active model request from the Cancel action", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      "vitejs-d3.ai.confirmed-data-destinations.v1",
      JSON.stringify(["https://model.example/v1"]),
    );
    let requestSignal: AbortSignal | undefined;
    aiMocks.chat.mockImplementation(
      (
        _request: unknown,
        options: { signal?: AbortSignal } | undefined,
      ) => {
        requestSignal = options?.signal;
        return new Promise((_resolve, reject) => {
          requestSignal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        });
      },
    );

    render(<EditorAIController workspaceProps={{ defaultOpen: true }} />);

    const composer = await getReadyControllerComposer();
    fireEvent.change(composer, { target: { value: "Move the title" } });
    expect(composer).toHaveValue("Move the title");
    const sendButton = screen.getByRole("button", { name: "Send" });
    await waitFor(() => expect(sendButton).toBeEnabled());
    await user.click(sendButton);
    await waitFor(() => {
      if (
        aiMocks.chat.mock.calls.length === 0 &&
        !screen.queryByRole("button", { name: /Confirm & send/i })
      ) {
        throw new Error("The request has not started.");
      }
    });
    const confirmButton = screen.queryByRole("button", {
      name: /Confirm & send/i,
    });
    if (confirmButton) {
      await user.click(confirmButton);
    }
    await waitFor(() => expect(aiMocks.chat).toHaveBeenCalledOnce());

    await waitFor(() => expect(screen.getByRole("button", { name: "Close dialog" })).toBeDisabled());
    await user.click(
      screen.getByRole("button", { name: /Cancel request/i }),
    );
    await waitFor(() => expect(requestSignal?.aborted).toBe(true));
    expect(await screen.findByText("Request cancelled.")).toBeInTheDocument();
  });

  it("discards a response when the editor document changes in flight", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      "vitejs-d3.ai.confirmed-data-destinations.v1",
      JSON.stringify(["https://model.example/v1"]),
    );
    let resolveChat:
      | ((value: { patch: JsonPatchOperation[] }) => void)
      | undefined;
    aiMocks.chat.mockImplementationOnce(
      () =>
        new Promise<{ patch: JsonPatchOperation[] }>((resolve) => {
          resolveChat = resolve;
        }),
    );

    render(<EditorAIController workspaceProps={{ defaultOpen: true }} />);

    const composer = await getReadyControllerComposer();
    await user.type(composer, "Change the chart title");
    const sendButton = screen.getByRole("button", { name: "Send" });
    await waitFor(() => expect(sendButton).toBeEnabled());
    await user.click(sendButton);
    await waitFor(() => expect(aiMocks.chat).toHaveBeenCalledOnce());

    editorMocks.state.dsl_json = {
      history: {
        cursor: 0,
        entries: [],
      },
    };
    resolveChat?.({
      patch: [
        {
          op: "replace",
          path: "/dsl/title",
          value: "A stale response",
        },
      ],
    });

    expect(
      await screen.findAllByText(/editor document changed.*response was discarded/i),
    ).not.toHaveLength(0);
    expect(editorMocks.applyAIPatch).not.toHaveBeenCalled();
  });

  it("repairs a model-response Patch error but does not retry network errors", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      "vitejs-d3.ai.confirmed-data-destinations.v1",
      JSON.stringify(["https://model.example/v1"]),
    );
    aiMocks.chat
      .mockRejectedValueOnce(
        new AIServiceError(
          "The model did not return valid JSON Patch.",
          422,
          "INVALID_MODEL_PATCH",
        ),
      )
      .mockResolvedValueOnce({
        patch: [
          { op: "replace", path: "/dsl/title", value: "Repaired title" },
        ],
        semanticSummary: {
          title: "Repaired chart labels",
          overview: "The repaired response safely updates the chart title.",
          changes: [
            { area: "dsl", description: "Updated the chart title." },
          ],
        },
      });
    editorMocks.applyAIPatch.mockResolvedValueOnce({
      affected_paths: ["/title"],
      forward_patch: [
        { op: "replace", path: "/title", value: "Repaired title" },
      ],
      id: "history-ai-repaired",
      inverse_patch: [],
      source: "ai",
      timestamp: "2026-08-01T10:02:00.000Z",
    });

    render(<EditorAIController workspaceProps={{ defaultOpen: true }} />);

    const composer = await getReadyControllerComposer();
    await user.type(composer, "Repair the labels");
    const firstSendButton = screen.getByRole("button", { name: "Send" });
    await waitFor(() => expect(firstSendButton).toBeEnabled());
    await user.click(firstSendButton);

    await waitFor(() => expect(aiMocks.chat).toHaveBeenCalledTimes(2));
    expect(aiMocks.chat.mock.calls[1]?.[0]).toMatchObject({
      instruction: expect.stringContaining("Repair attempt 1 of 3"),
    });
    expect(aiMocks.chat.mock.calls[1]?.[0]).toMatchObject({
      instruction: expect.stringContaining('a `summary` object'),
    });
    const repairedSummary = await screen.findByLabelText("Change summary");
    expect(repairedSummary).toHaveAttribute(
      "data-history-entry-id",
      "history-ai-repaired",
    );
    expect(within(repairedSummary).getByText("/title")).toBeInTheDocument();
    expect(within(repairedSummary).getByText("Repaired chart labels"))
      .toBeInTheDocument();
    expect(screen.getAllByLabelText("Change summary")).toHaveLength(1);

    await waitFor(() => {
      expect(screen.getByLabelText("Modification request")).toBeEnabled();
    });
    aiMocks.chat.mockReset();
    aiMocks.chat.mockRejectedValueOnce(
      new AIServiceError(
        "The model service could not be reached.",
        502,
        "UPSTREAM_UNAVAILABLE",
      ),
    );
    await user.type(
      screen.getByLabelText("Modification request"),
      "This must not retry",
    );
    const secondSendButton = screen.getByRole("button", { name: "Send" });
    await waitFor(() => expect(secondSendButton).toBeEnabled());
    await user.click(secondSendButton);

    await waitFor(() => expect(aiMocks.chat).toHaveBeenCalledOnce());
    expect(
      await screen.findAllByText("The model service could not be reached."),
    ).not.toHaveLength(0);
    expect(screen.getAllByLabelText("Change summary")).toHaveLength(1);
  });
});
