"use client";

import { useRef, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/app/actions/auth";

/**
 * Wraps a destructive/state-changing admin action behind a confirmation
 * dialog. `action` should be a server action bound to its arguments already
 * (e.g. `confirmPayment.bind(null, payment.id, true)`).
 */
export function ConfirmButton({
  label,
  confirmTitle,
  confirmDescription,
  action,
  tone = "brand",
  children,
}: {
  label: string;
  confirmTitle: string;
  confirmDescription: string;
  action: () => Promise<ActionResult>;
  tone?: "brand" | "danger";
  children?: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toneClasses =
    tone === "danger"
      ? "bg-danger hover:bg-red-700"
      : "bg-brand hover:bg-brand-dark";

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      dialogRef.current?.close();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-slate-50"
      >
        {label}
      </button>

      <dialog
        ref={dialogRef}
        className="rounded-xl border border-border p-0 shadow-lg backdrop:bg-black/30"
      >
        <div className="w-80 p-5">
          <h3 className="text-sm font-semibold text-foreground">
            {confirmTitle}
          </h3>
          <p className="mt-1 text-sm text-muted">{confirmDescription}</p>
          {children && <div className="mt-3">{children}</div>}
          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-muted hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isPending}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60",
                toneClasses,
              )}
            >
              {isPending ? "Working…" : "Confirm"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
