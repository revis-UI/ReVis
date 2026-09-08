import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

interface DialogContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titleId: string;
  descriptionId: string;
}

const DialogContext = React.createContext<DialogContextValue | null>(null);

function useDialogContext(): DialogContextValue {
  const context = React.useContext(DialogContext);
  if (!context) {
    throw new Error("Dialog components must be rendered inside <Dialog>.");
  }
  return context;
}

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

function Dialog({ open, onOpenChange, children }: DialogProps) {
  const reactId = React.useId();
  const value = React.useMemo(
    () => ({
      open,
      onOpenChange,
      titleId: `${reactId}-title`,
      descriptionId: `${reactId}-description`,
    }),
    [onOpenChange, open, reactId],
  );

  return (
    <DialogContext.Provider value={value}>{children}</DialogContext.Provider>
  );
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selector = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
    "[contenteditable='true']",
  ].join(",");

  return Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(
    (element) =>
      !element.hasAttribute("hidden") &&
      element.getAttribute("aria-hidden") !== "true" &&
      !element.closest("[hidden], [aria-hidden='true']"),
  );
}

function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") {
    ref(value);
  } else if (ref) {
    ref.current = value;
  }
}

interface DialogContentProps extends React.ComponentProps<"div"> {
  preventClose?: boolean;
  closeOnOutsideClick?: boolean;
  showCloseButton?: boolean;
  closeLabel?: string;
}

function DialogContent({
  className,
  children,
  preventClose = false,
  closeOnOutsideClick = true,
  showCloseButton = true,
  closeLabel = "Close dialog",
  ref,
  ...props
}: DialogContentProps) {
  const { open, onOpenChange, titleId, descriptionId } = useDialogContext();
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const onOpenChangeRef = React.useRef(onOpenChange);
  const preventCloseRef = React.useRef(preventClose);
  onOpenChangeRef.current = onOpenChange;
  preventCloseRef.current = preventClose;
  const setContentRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      contentRef.current = node;
      assignRef(ref, node);
    },
    [ref],
  );

  React.useEffect(() => {
    if (!open) {
      return;
    }

    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusFrame = window.requestAnimationFrame(() => {
      const content = contentRef.current;
      if (!content) {
        return;
      }
      // A user may already have clicked a field before this animation frame.
      if (content.contains(document.activeElement)) return;
      (getFocusableElements(content)[0] ?? content).focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      const content = contentRef.current;
      if (!content) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        if (!preventCloseRef.current) {
          onOpenChangeRef.current(false);
        }
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusable = getFocusableElements(content);
      if (focusable.length === 0) {
        event.preventDefault();
        content.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
        data-slot="dialog-overlay"
        onMouseDown={(event) => {
          if (
            event.currentTarget === event.target &&
            closeOnOutsideClick &&
            !preventClose
          ) {
            onOpenChange(false);
          }
        }}
      />
      <div
        {...props}
        ref={setContentRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        data-slot="dialog-content"
        className={cn(
          "bg-background text-foreground relative z-10 max-h-[calc(100vh-3rem)] w-full rounded-xl border shadow-2xl outline-none",
          className,
        )}
      >
        {children}
        {showCloseButton && (
          <button
            type="button"
            aria-label={closeLabel}
            disabled={preventClose}
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/50 absolute right-4 top-4 z-10 inline-flex size-8 items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

function DialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-1.5 text-left", className)}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<"h2">) {
  const { titleId } = useDialogContext();
  return (
    <h2
      id={titleId}
      data-slot="dialog-title"
      className={cn("text-lg font-semibold leading-none", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  const { descriptionId } = useDialogContext();
  return (
    <p
      id={descriptionId}
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

function DialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

function DialogClose({
  onClick,
  ...props
}: React.ComponentProps<"button">) {
  const { onOpenChange } = useDialogContext();
  return (
    <button
      type="button"
      data-slot="dialog-close"
      {...props}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          onOpenChange(false);
        }
      }}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
};
