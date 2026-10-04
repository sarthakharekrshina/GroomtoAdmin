"use client";

import { useRef, useState, useTransition } from "react";
import {
  confirmPayment,
  markPaid,
  resolveDispute,
  waivePenalty,
} from "@/app/actions/admin";

export function ConfirmPaymentButtons({ paymentId }: { paymentId: string }) {
  const confirmRef = useRef<HTMLDialogElement>(null);
  const rejectRef = useRef<HTMLDialogElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(confirm: boolean, dialog: HTMLDialogElement | null) {
    setError(null);
    startTransition(async () => {
      const result = await confirmPayment(paymentId, confirm);
      if (!result.ok) {
        setError(result.error ?? "Failed.");
        return;
      }
      dialog?.close();
    });
  }

  return (
    <div className="flex gap-1.5">
      <button
        type="button"
        onClick={() => confirmRef.current?.showModal()}
        className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-slate-50"
      >
        Confirm
      </button>
      <dialog
        ref={confirmRef}
        className="rounded-xl border border-border p-0 shadow-lg backdrop:bg-black/30"
      >
        <div className="w-80 p-5">
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            Confirm this payment?
          </h3>
          <p className="text-sm text-muted">
            This marks the submitted payment as confirmed and the statement
            as paid.
          </p>
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(true, confirmRef.current)}
            className="mt-3 w-full rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {isPending ? "Working…" : "Confirm payment"}
          </button>
        </div>
      </dialog>

      <button
        type="button"
        onClick={() => rejectRef.current?.showModal()}
        className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-danger hover:bg-red-50"
      >
        Reject
      </button>
      <dialog
        ref={rejectRef}
        className="rounded-xl border border-border p-0 shadow-lg backdrop:bg-black/30"
      >
        <div className="w-80 p-5">
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            Reject this payment?
          </h3>
          <p className="text-sm text-muted">
            The statement returns to the payment queue, not to paid.
          </p>
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(false, rejectRef.current)}
            className="mt-3 w-full rounded-md bg-danger px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
          >
            {isPending ? "Working…" : "Reject payment"}
          </button>
        </div>
      </dialog>
    </div>
  );
}

export function MarkPaidButton({ payoutId }: { payoutId: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [reference, setReference] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-slate-50"
      >
        Mark paid
      </button>
      <dialog
        ref={ref}
        className="rounded-xl border border-border p-0 shadow-lg backdrop:bg-black/30"
      >
        <div className="w-80 p-5">
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            Record this statement as paid
          </h3>
          <p className="text-sm text-muted">
            Use this for a bank transfer, cash, or write-off the platform
            decided on outside the app.
          </p>
          <input
            type="text"
            placeholder="Reference (optional)"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="mt-3 w-full rounded-md border border-border px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const result = await markPaid(payoutId, reference || undefined);
                if (!result.ok) {
                  setError(result.error ?? "Failed.");
                  return;
                }
                ref.current?.close();
              })
            }
            className="mt-3 w-full rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {isPending ? "Working…" : "Mark paid"}
          </button>
        </div>
      </dialog>
    </>
  );
}

export function WaivePenaltyButton({ penaltyId }: { penaltyId: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-slate-50"
      >
        Waive
      </button>
      <dialog
        ref={ref}
        className="rounded-xl border border-border p-0 shadow-lg backdrop:bg-black/30"
      >
        <div className="w-80 p-5">
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            Waive this cancellation fee?
          </h3>
          <p className="text-sm text-muted">
            The charge is removed from the salon&apos;s account and they are
            notified. Only an admin can waive a penalty, and it cannot be
            re-applied from here.
          </p>
          <textarea
            placeholder="Internal note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="mt-3 w-full rounded-md border border-border px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const result = await waivePenalty(penaltyId, note || undefined);
                if (!result.ok) {
                  setError(result.error ?? "Failed.");
                  return;
                }
                ref.current?.close();
              })
            }
            className="mt-3 w-full rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {isPending ? "Working…" : "Waive fee"}
          </button>
        </div>
      </dialog>
    </>
  );
}

export function ResolveDisputeButtons({ disputeId }: { disputeId: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [resolution, setResolution] = useState("");
  const [credit, setCredit] = useState("0");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(uphold: boolean) {
    setError(null);
    startTransition(async () => {
      const creditAmount = uphold ? Number(credit) || 0 : 0;
      const result = await resolveDispute(
        disputeId,
        uphold,
        resolution || undefined,
        creditAmount,
      );
      if (!result.ok) {
        setError(result.error ?? "Failed.");
        return;
      }
      ref.current?.close();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-slate-50"
      >
        Resolve dispute
      </button>
      <dialog
        ref={ref}
        className="rounded-xl border border-border p-0 shadow-lg backdrop:bg-black/30"
      >
        <div className="w-80 p-5">
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            Resolve this dispute
          </h3>
          <textarea
            placeholder="Resolution note (shown to the salon)"
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-border px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-muted">
              Credit note amount (if upheld)
            </label>
            <input
              type="number"
              min={0}
              value={credit}
              onChange={(e) => setCredit(e.target.value)}
              className="w-32 rounded-md border border-border px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(true)}
              className="flex-1 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
            >
              Uphold
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(false)}
              className="flex-1 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-slate-50 disabled:opacity-60"
            >
              Reject
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
