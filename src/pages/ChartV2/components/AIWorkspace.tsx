import * as React from "react";
import { RotateCcw, RotateCw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AIChatDialog,
  type AIChatDialogProps,
} from "./AIChatDialog";
import { JsonVersionDiffTool } from "./JsonVersionDiffTool";
import type { ChartDocument } from "../model/document";

export type AIWorkspaceProps = Omit<
  AIChatDialogProps,
  "open" | "onOpenChange"
> & {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  showGlobalHistoryControls?: boolean;
  chartDocument?: ChartDocument | null;
  versionDiffDisabled?: boolean;
  className?: string;
  aiUnavailableMessage?: string;
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}

export function AIWorkspace({
  open,
  defaultOpen = false,
  onOpenChange,
  showGlobalHistoryControls = true,
  chartDocument,
  versionDiffDisabled = false,
  className,
  aiUnavailableMessage,
  canUndo = false,
  canRedo = false,
  isRequesting = false,
  onUndo,
  onRedo,
  ...dialogProps
}: AIWorkspaceProps) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const resolvedOpen = open ?? internalOpen;

  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && isRequesting) {
        return;
      }
      if (open === undefined) {
        setInternalOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [isRequesting, onOpenChange, open],
  );

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        isRequesting ||
        isEditableTarget(event.target) ||
        (!event.metaKey && !event.ctrlKey)
      ) {
        return;
      }

      if (event.key.toLowerCase() !== "z") {
        return;
      }

      if (event.shiftKey) {
        if (canRedo && onRedo) {
          event.preventDefault();
          onRedo();
        }
      } else if (canUndo && onUndo) {
        event.preventDefault();
        onUndo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canRedo, canUndo, isRequesting, onRedo, onUndo]);

  return (
    <>
      <div
        className={cn(
          "fixed bottom-6 right-6 z-40 flex items-center gap-2",
          className,
  aiUnavailableMessage,
        )}
        aria-label="AI editor controls"
      >
        {showGlobalHistoryControls && (
          <div className="bg-background flex items-center gap-1 rounded-full border p-1 shadow-lg">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 rounded-full"
              aria-label="Undo last edit"
              aria-keyshortcuts="Control+Z Meta+Z"
              title="Undo (Cmd/Ctrl+Z)"
              disabled={!canUndo || isRequesting || !onUndo}
              onClick={onUndo}
            >
              <RotateCcw />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 rounded-full"
              aria-label="Redo last edit"
              aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z"
              title="Redo (Cmd/Ctrl+Shift+Z)"
              disabled={!canRedo || isRequesting || !onRedo}
              onClick={onRedo}
            >
              <RotateCw />
            </Button>
          </div>
        )}

        <JsonVersionDiffTool
          chartDocument={chartDocument}
          disabled={versionDiffDisabled}
        />

        <Button
          type="button"
          size="icon"
          className="size-12 rounded-full shadow-xl"
          aria-label="Open AI semantic editor"
          aria-haspopup="dialog"
          aria-expanded={resolvedOpen}
          title={aiUnavailableMessage || "Open AI semantic editor"}
          disabled={Boolean(aiUnavailableMessage)}
          onClick={() => setOpen(true)}
        >
          <Sparkles className="size-5" />
        </Button>
      </div>

      {aiUnavailableMessage && <p role="status" className="fixed bottom-20 right-6 z-40 max-w-64 rounded border bg-white p-2 text-xs text-gray-600">{aiUnavailableMessage}</p>}
      {!aiUnavailableMessage && <AIChatDialog
        {...dialogProps}
        open={resolvedOpen}
        onOpenChange={setOpen}
        canUndo={canUndo}
        canRedo={canRedo}
        isRequesting={isRequesting}
        onUndo={onUndo}
        onRedo={onRedo}
      />}
    </>
  );
}
