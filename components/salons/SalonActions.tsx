"use client";

import { useState, useTransition } from "react";
import { setCommission, setBankStatus } from "@/app/actions/admin";

export function CommissionForm({
  salonId,
  currentRate,
}: {
  salonId: string;
  currentRate: number | null;
}) {
  const [rate, setRate] = useState(currentRate?.toString() ?? "0");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  function handleSave() {
    const parsed = Number(rate);
    if (Number.isNaN(parsed) || parsed < 0 || parsed > 50) {
      setMessage({ ok: false, text: "Rate must be between 0 and 50." });
      return;
    }
    startTransition(async () => {
      const result = await setCommission(salonId, parsed);
      setMessage(
        result.ok
          ? { ok: true, text: "Commission rate updated." }
          : { ok: false, text: result.error ?? "Update failed." },
      );
    });
  }

  return (
    <div className="flex items-end gap-2">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">
          Commission rate (%)
        </label>
        <input
          type="number"
          min={0}
          max={50}
          step={0.5}
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          className="w-28 rounded-md border border-border px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </div>
      <button
        type="button"
        onClick={handleSave}
        disabled={isPending}
        className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {isPending ? "Saving…" : "Save"}
      </button>
      {message && (
        <p className={`text-xs ${message.ok ? "text-success" : "text-danger"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}

const BANK_STATUSES = ["unverified", "pending", "verified", "failed"] as const;

export function BankStatusForm({
  salonId,
  currentStatus,
}: {
  salonId: string;
  currentStatus: string | null;
}) {
  const [status, setStatus] = useState(currentStatus ?? "unverified");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  function handleSave() {
    startTransition(async () => {
      const result = await setBankStatus(salonId, status);
      setMessage(
        result.ok
          ? { ok: true, text: "Bank status updated." }
          : { ok: false, text: result.error ?? "Update failed." },
      );
    });
  }

  return (
    <div className="flex items-end gap-2">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">
          Bank verification status
        </label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-36 rounded-md border border-border px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        >
          {BANK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        onClick={handleSave}
        disabled={isPending}
        className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {isPending ? "Saving…" : "Save"}
      </button>
      {message && (
        <p className={`text-xs ${message.ok ? "text-success" : "text-danger"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
