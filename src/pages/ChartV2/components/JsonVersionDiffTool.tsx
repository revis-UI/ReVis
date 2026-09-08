import * as React from "react";
import { FileDiff } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ChartDocument } from "../model/document";
import {
  createDocumentVersionDiff,
  type VersionDiffChange,
  type VersionDiffOperation,
} from "../model/versionDiff";

interface JsonVersionDiffToolProps {
  chartDocument?: ChartDocument | null;
  disabled?: boolean;
  className?: string;
}

const OPERATION_STYLE: Record<
  VersionDiffOperation,
  { badge: string; label: string; panel: string }
> = {
  add: {
    badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    label: "Added",
    panel: "border-emerald-500/25 bg-emerald-500/5",
  },
  remove: {
    badge: "bg-red-500/15 text-red-700 dark:text-red-300",
    label: "Removed",
    panel: "border-red-500/25 bg-red-500/5",
  },
  replace: {
    badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    label: "Changed",
    panel: "border-amber-500/25 bg-amber-500/5",
  },
};

const formatJsonValue = (value: VersionDiffChange["before"]) =>
  value === undefined ? "Not present" : JSON.stringify(value, null, 2);

function ValuePanel({
  label,
  missing,
  value,
}: {
  label: string;
  missing: boolean;
  value: VersionDiffChange["before"];
}) {
  return (
    <div className="min-w-0">
      <div className="text-muted-foreground mb-1 text-[11px] font-semibold uppercase tracking-wide">
        {label}
      </div>
      <pre
        className={cn(
          "max-h-52 overflow-auto rounded-md border p-3 font-mono text-xs leading-5 whitespace-pre-wrap break-words",
          missing
            ? "text-muted-foreground border-dashed italic"
            : "bg-background/80",
        )}
      >
        {formatJsonValue(value)}
      </pre>
    </div>
  );
}

function ChangeCard({ change }: { change: VersionDiffChange }) {
  const style = OPERATION_STYLE[change.operation];
  return (
    <article
      className={cn("rounded-lg border p-3", style.panel)}
      aria-label={`${style.label}: ${change.path || "/"}`}
    >
      <div className="mb-3 flex min-w-0 items-center gap-2">
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
            style.badge,
          )}
        >
          {style.label}
        </span>
        <code className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-medium">
          {change.path || "/"}
        </code>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <ValuePanel
          label="Previous"
          missing={change.before === undefined}
          value={change.before}
        />
        <ValuePanel
          label="Current"
          missing={change.after === undefined}
          value={change.after}
        />
      </div>
    </article>
  );
}

export function JsonVersionDiffTool({
  chartDocument,
  disabled = false,
  className,
}: JsonVersionDiffToolProps) {
  const [open, setOpen] = React.useState(false);
  const hasPreviousVersion = Boolean(
    chartDocument && chartDocument.history.cursor > 0,
  );
  const comparison = React.useMemo(() => {
    if (!open || !hasPreviousVersion) {
      return { diff: null, error: null };
    }
    try {
      return {
        diff: createDocumentVersionDiff(chartDocument),
        error: null,
      };
    } catch (error) {
      return {
        diff: null,
        error:
          error instanceof Error
            ? error.message
            : "The previous version could not be reconstructed.",
      };
    }
  }, [chartDocument, hasPreviousVersion, open]);
  const triggerDisabled = disabled || !hasPreviousVersion;
  const counts = comparison.diff?.changes.reduce(
    (result, change) => ({
      ...result,
      [change.operation]: result[change.operation] + 1,
    }),
    { add: 0, remove: 0, replace: 0 },
  );

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={cn(
          "bg-background size-10 rounded-full shadow-lg",
          className,
        )}
        aria-label="Open JSON version diff"
        aria-haspopup="dialog"
        aria-expanded={open}
        title={
          hasPreviousVersion
            ? "Compare current and previous JSON versions"
            : "No previous version available"
        }
        disabled={triggerDisabled}
        onClick={() => setOpen(true)}
      >
        <FileDiff className="size-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="flex max-w-6xl flex-col overflow-hidden"
          closeLabel="Close JSON version diff"
        >
          <DialogHeader className="border-b px-6 py-5 pr-14">
            <DialogTitle>JSON version diff</DialogTitle>
            <DialogDescription>
              Compares the current document with its immediate previous history
              version. History metadata and updated_at are omitted.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-auto p-6">
            {comparison.error ? (
              <div
                role="alert"
                className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border p-4 text-sm"
              >
                Unable to reconstruct the previous version: {comparison.error}
              </div>
            ) : comparison.diff ? (
              <div className="space-y-4">
                <div className="bg-muted/40 flex flex-wrap items-center gap-2 rounded-lg border px-4 py-3 text-sm">
                  <span className="font-medium">
                    Previous · position {comparison.diff.previousCursor}
                  </span>
                  <span aria-hidden="true" className="text-muted-foreground">
                    →
                  </span>
                  <span className="font-medium">
                    Current · position {comparison.diff.currentCursor}
                  </span>
                  <span className="text-muted-foreground ml-auto text-xs">
                    {comparison.diff.entry.source} · {comparison.diff.changes.length}{" "}
                    {comparison.diff.changes.length === 1 ? "change" : "changes"}
                  </span>
                </div>

                {counts && comparison.diff.changes.length > 0 && (
                  <div className="text-muted-foreground flex flex-wrap gap-3 text-xs">
                    <span>{counts.add} added</span>
                    <span>{counts.remove} removed</span>
                    <span>{counts.replace} changed</span>
                  </div>
                )}

                <div
                  aria-label="JSON differences"
                  aria-live="polite"
                  className="space-y-3"
                >
                  {comparison.diff.changes.length === 0 ? (
                    <div className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
                      No semantic JSON differences were found.
                    </div>
                  ) : (
                    comparison.diff.changes.map((change, index) => (
                      <ChangeCard
                        key={`${change.operation}:${change.path}:${index}`}
                        change={change}
                      />
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
                No previous version is available for this document.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
