"use client";

import { useState, useTransition } from "react";
import { setPlatformSetting } from "@/app/actions/admin";

export function PlatformSettingForm() {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  function handleSave() {
    if (!key.trim()) {
      setMessage({ ok: false, text: "Key is required." });
      return;
    }
    startTransition(async () => {
      const result = await setPlatformSetting(key.trim(), value);
      setMessage(
        result.ok
          ? { ok: true, text: `Saved "${key.trim()}".` }
          : { ok: false, text: result.error ?? "Save failed." },
      );
      if (result.ok) {
        setKey("");
        setValue("");
      }
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Writes directly to <code className="text-xs">platform_settings</code> via{" "}
        <code className="text-xs">admin_set_setting()</code> — e.g. WhatsApp
        template text, the collection UPI ID, or referral goal/plan config.
        Every change is written to the Audit Log.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          type="text"
          placeholder="Key (e.g. collection_upi)"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          className="rounded-md border border-border px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
        <input
          type="text"
          placeholder="Value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="rounded-md border border-border px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </div>
      {message && (
        <p className={`text-sm ${message.ok ? "text-success" : "text-danger"}`}>
          {message.text}
        </p>
      )}
      <button
        type="button"
        disabled={isPending}
        onClick={handleSave}
        className="rounded-md bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {isPending ? "Saving…" : "Save setting"}
      </button>
    </div>
  );
}
