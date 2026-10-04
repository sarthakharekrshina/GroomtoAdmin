"use client";

import { useRef, useState, useTransition } from "react";
import { cancelReferral, moderateReview, setOfferActive } from "@/app/actions/userApp";

/**
 * Confirm-first admin actions for the User App pages. Each dialog has its own
 * local ref and inline handlers (the pattern components/payments/
 * PaymentActions.tsx uses — see CLAUDE.md on react-hooks/refs).
 */

const SMALL_BUTTON =
  "rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground hover:bg-slate-50";
const DIALOG = "rounded-xl border border-border p-0 shadow-lg backdrop:bg-black/30";
const NOTE =
  "mt-3 w-full rounded-md border border-border px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

export function CancelReferralButton({ referralId, summary }: { referralId: string; summary: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className={SMALL_BUTTON}>
        Cancel
      </button>
      <dialog ref={ref} className={DIALOG}>
        <div className="w-96 p-5">
          <h3 className="text-sm font-semibold text-foreground">Cancel this referral?</h3>
          <p className="mt-1 text-sm text-muted">{summary}</p>
          <p className="mt-2 text-sm text-muted">
            It will never award points — even when the friend completes their first
            booking. This can&apos;t be undone from the admin panel.
          </p>
          <textarea
            placeholder="Reason (saved in Audit Logs)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className={NOTE}
          />
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => ref.current?.close()}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-muted hover:bg-slate-50"
            >
              Keep it
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  const result = await cancelReferral(referralId, note);
                  if (!result.ok) {
                    setError(result.error ?? "Failed.");
                    return;
                  }
                  ref.current?.close();
                })
              }
              className="rounded-md bg-danger px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
            >
              {isPending ? "Working…" : "Cancel referral"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

export function OfferToggleButton({
  offerId,
  active,
  title,
}: {
  offerId: string;
  active: boolean;
  title: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const turningOff = active;

  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className={SMALL_BUTTON}>
        {turningOff ? "Pause" : "Resume"}
      </button>
      <dialog ref={ref} className={DIALOG}>
        <div className="w-96 p-5">
          <h3 className="text-sm font-semibold text-foreground">
            {turningOff ? "Pause this offer?" : "Turn this offer back on?"}
          </h3>
          <p className="mt-1 text-sm font-medium text-foreground">{title}</p>
          <p className="mt-2 text-sm text-muted">
            {turningOff
              ? "Customers stop seeing it straight away. The salon gets a notification and can turn it back on from its own app."
              : "Customers see it again if it's within its dates. It still counts against the salon's plan limit for live offers."}
          </p>
          <textarea
            placeholder={turningOff ? "Reason — shown to the salon" : "Note — shown to the salon (optional)"}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className={NOTE}
          />
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => ref.current?.close()}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-muted hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  const result = await setOfferActive(offerId, !active, note);
                  if (!result.ok) {
                    setError(
                      /PLAN_LIMIT_OFFERS/.test(result.error ?? "")
                        ? "The salon is already running as many live offers as its plan allows."
                        : (result.error ?? "Failed."),
                    );
                    return;
                  }
                  ref.current?.close();
                })
              }
              className={`rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60 ${
                turningOff ? "bg-danger hover:bg-red-700" : "bg-brand hover:bg-brand-dark"
              }`}
            >
              {isPending ? "Working…" : turningOff ? "Pause offer" : "Turn back on"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

export function ReviewModerationButtons({
  reviewId,
  hasComment,
}: {
  reviewId: string;
  hasComment: boolean;
}) {
  const clearRef = useRef<HTMLDialogElement>(null);
  const deleteRef = useRef<HTMLDialogElement>(null);
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap gap-1.5">
      {hasComment && (
        <button
          type="button"
          onClick={() => {
            setError(null);
            clearRef.current?.showModal();
          }}
          className={SMALL_BUTTON}
        >
          Remove comment
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          setError(null);
          deleteRef.current?.showModal();
        }}
        className={SMALL_BUTTON}
      >
        Delete
      </button>

      <dialog ref={clearRef} className={DIALOG}>
        <div className="w-96 p-5">
          <h3 className="text-sm font-semibold text-foreground">Remove this comment?</h3>
          <p className="mt-2 text-sm text-muted">
            The text disappears from the salon page; the star rating stays, so the
            salon&apos;s rating doesn&apos;t change. The original text is kept in
            Audit Logs.
          </p>
          <textarea
            placeholder="Reason (saved in Audit Logs)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className={NOTE}
          />
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => clearRef.current?.close()}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-muted hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  const result = await moderateReview(reviewId, "clear_comment", note);
                  if (!result.ok) {
                    setError(result.error ?? "Failed.");
                    return;
                  }
                  clearRef.current?.close();
                })
              }
              className="rounded-md bg-danger px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
            >
              {isPending ? "Working…" : "Remove comment"}
            </button>
          </div>
        </div>
      </dialog>

      <dialog ref={deleteRef} className={DIALOG}>
        <div className="w-96 p-5">
          <h3 className="text-sm font-semibold text-foreground">Delete this whole review?</h3>
          <p className="mt-2 text-sm text-muted">
            Stars and text are removed and the salon&apos;s rating is recalculated
            from its remaining reviews (unless an admin rating override is on). If
            it was the customer&apos;s latest visit, their app may ask them to rate
            it again. The full review is kept in Audit Logs.
          </p>
          <textarea
            placeholder="Reason (saved in Audit Logs)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className={NOTE}
          />
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => deleteRef.current?.close()}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-muted hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  const result = await moderateReview(reviewId, "delete", note);
                  if (!result.ok) {
                    setError(result.error ?? "Failed.");
                    return;
                  }
                  deleteRef.current?.close();
                })
              }
              className="rounded-md bg-danger px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
            >
              {isPending ? "Working…" : "Delete review"}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
