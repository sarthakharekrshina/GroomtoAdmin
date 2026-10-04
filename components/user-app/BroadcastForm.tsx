"use client";

import { useRef, useState, useTransition } from "react";
import { previewBroadcast, sendBroadcast, type BroadcastResult } from "@/app/actions/userApp";

const TITLE_MAX = 65;
const BODY_MAX = 240;
const INPUT =
  "w-full rounded-md border border-border px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";
const LABEL = "mb-1 block text-xs font-medium text-muted";

export function BroadcastForm({
  initialCustomerId,
  initialCustomerName,
}: {
  initialCustomerId?: string;
  initialCustomerName?: string;
}) {
  const confirmRef = useRef<HTMLDialogElement>(null);
  const [audience, setAudience] = useState<"all" | "customer">(initialCustomerId ? "customer" : "all");
  const [customerId, setCustomerId] = useState(initialCustomerId ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [count, setCount] = useState<{ devices: number; customers: number } | null>(null);
  const [result, setResult] = useState<BroadcastResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const input = () => ({ audience, customerId: audience === "customer" ? customerId.trim() : undefined });

  function check(thenConfirm: boolean) {
    setError(null);
    setResult(null);
    if (thenConfirm && (!title.trim() || !body.trim())) {
      setError("Write a title and a message first.");
      return;
    }
    if (audience === "customer" && !customerId.trim()) {
      setError("Enter the customer's ID (open them under Customers and use “Send a push”).");
      return;
    }
    startTransition(async () => {
      const r = await previewBroadcast(input());
      if (!r.ok) {
        setError(r.error ?? "Could not count recipients.");
        return;
      }
      const c = { devices: r.devices ?? 0, customers: r.customers ?? 0 };
      setCount(c);
      if (thenConfirm) {
        if (c.devices === 0) {
          setError("Nobody to send to — no device has notifications registered for this audience.");
          return;
        }
        confirmRef.current?.showModal();
      }
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div>
          <span className={LABEL}>Send to</span>
          <div className="flex flex-wrap gap-4 text-sm text-foreground">
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={audience === "all"}
                onChange={() => {
                  setAudience("all");
                  setCount(null);
                }}
              />
              Every customer with notifications on
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={audience === "customer"}
                onChange={() => {
                  setAudience("customer");
                  setCount(null);
                }}
              />
              One customer (good for a test)
            </label>
          </div>
        </div>

        {audience === "customer" && (
          <div>
            <label className={LABEL}>
              Customer ID{initialCustomerName && customerId === initialCustomerId ? ` — ${initialCustomerName}` : ""}
            </label>
            <input
              className={`${INPUT} font-mono`}
              value={customerId}
              onChange={(e) => {
                setCustomerId(e.target.value);
                setCount(null);
              }}
              placeholder="Open a customer under Customers and use “Send a push”"
            />
          </div>
        )}

        <div>
          <label className={LABEL}>
            Title ({title.length}/{TITLE_MAX})
          </label>
          <input className={INPUT} value={title} maxLength={TITLE_MAX} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className={LABEL}>
            Message ({body.length}/{BODY_MAX})
          </label>
          <textarea className={INPUT} rows={3} value={body} maxLength={BODY_MAX} onChange={(e) => setBody(e.target.value)} />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => check(false)}
            disabled={isPending}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-slate-50 disabled:opacity-60"
          >
            Count recipients
          </button>
          <button
            type="button"
            onClick={() => check(true)}
            disabled={isPending}
            className="rounded-md bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {isPending ? "Checking…" : "Send…"}
          </button>
          {count && (
            <span className="text-sm text-muted">
              {count.devices} device{count.devices === 1 ? "" : "s"} · {count.customers} customer
              {count.customers === 1 ? "" : "s"}
            </span>
          )}
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        {result?.ok && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-success">
            Sent to {result.sent} of {result.devices} devices.
            {result.unregistered ? ` ${result.unregistered} no longer have the app.` : ""}
            {result.failed ? ` ${result.failed} failed.` : ""} Logged in Audit Logs.
          </p>
        )}
      </div>

      <div>
        <span className={LABEL}>Preview</span>
        <div className="rounded-2xl border border-border bg-slate-50 p-3">
          <div className="rounded-xl bg-surface p-3 shadow-sm">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Groomto · now</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{title || "Title"}</p>
            <p className="mt-0.5 text-sm text-foreground/80">{body || "Your message appears here."}</p>
          </div>
        </div>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted">
          <li>Android only — the Customer App has no iOS push today.</li>
          <li>Tapping it opens the customer&apos;s My Bookings screen.</li>
          <li>While the app is open, it only shows if they left booking-update alerts on.</li>
        </ul>
      </div>

      <dialog ref={confirmRef} className="rounded-xl border border-border p-0 shadow-lg backdrop:bg-black/30">
        <div className="w-96 p-5">
          <h3 className="text-sm font-semibold text-foreground">
            Send to {count?.devices} device{count?.devices === 1 ? "" : "s"}?
          </h3>
          <p className="mt-1 text-sm text-muted">
            {count?.customers} customer{count?.customers === 1 ? "" : "s"} will get it on their phone
            right away. A sent notification can&apos;t be recalled.
          </p>
          <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
            <p className="font-semibold text-foreground">{title}</p>
            <p className="text-foreground/80">{body}</p>
          </div>
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => confirmRef.current?.close()}
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
                  const r = await sendBroadcast({ ...input(), title: title.trim(), body: body.trim() });
                  if (!r.ok) {
                    setError(r.error ?? "Sending failed.");
                    return;
                  }
                  setResult(r);
                  confirmRef.current?.close();
                })
              }
              className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
            >
              {isPending ? "Sending…" : "Send now"}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
