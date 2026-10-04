"use client";

import { useRef, useState, useTransition } from "react";
import { closeCycles } from "@/app/actions/admin";

/**
 * Force-runs the weekly settlement close. This creates real payout statements
 * for salons, so it gets a confirm dialog — its own local useRef with inline
 * onClick handlers, per the pattern note in CLAUDE.md.
 */
export function CloseCyclesForm() {
  const ref = useRef<HTMLDialogElement>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Runs the same settlement close pg_cron runs weekly (Mon–Sun cycles),
        netting each salon&apos;s transactions and penalties into a statement due
        3 days later. Leave the dates blank to close the default period. Creating
        statements is not reversible from this app — the close is written to the
        Audit Log.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">
            Period start (optional)
          </label>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="w-full rounded-md border border-border px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">
            Period end (optional)
          </label>
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="w-full rounded-md border border-border px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
      </div>

      {message && (
        <p className={`text-sm ${message.ok ? "text-success" : "text-danger"}`}>
          {message.text}
        </p>
      )}

      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="rounded-md border border-border px-4 py-1.5 text-sm font-medium text-foreground hover:bg-slate-50"
      >
        Run settlement close…
      </button>

      <dialog
        ref={ref}
        className="rounded-xl border border-border p-0 shadow-lg backdrop:bg-black/30"
      >
        <div className="w-96 p-5">
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            Run the settlement close now?
          </h3>
          <p className="text-sm text-muted">
            This creates payout statements for every salon with unsettled
            activity in {start || end ? "the selected period" : "the default period"}.
            Salons are notified and the statements become due. There is no
            undo from this app.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  setMessage(null);
                  const result = await closeCycles(start, end);
                  if (!result.ok) {
                    setMessage({
                      ok: false,
                      text: result.error ?? "Close failed.",
                    });
                    return;
                  }
                  setMessage({
                    ok: true,
                    text:
                      result.count === undefined
                        ? "Settlement close ran."
                        : `Settlement close ran — ${result.count} statement${
                            result.count === 1 ? "" : "s"
                          } created.`,
                  });
                  ref.current?.close();
                })
              }
              className="flex-1 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
            >
              {isPending ? "Running…" : "Run close"}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => ref.current?.close()}
              className="flex-1 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-slate-50 disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
