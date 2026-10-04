"use client";

import { useState, useTransition } from "react";
import { replySupport } from "@/app/actions/userApp";

export function SupportReplyForm({
  kind,
  partyId,
  recipient,
}: {
  kind: "customer" | "salon";
  partyId: string;
  recipient: string;
}) {
  const [text, setText] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function send() {
    setError(null);
    startTransition(async () => {
      const result = await replySupport(kind, partyId, text);
      if (!result.ok) {
        setError(result.error ?? "Could not send.");
        return;
      }
      setText("");
    });
  }

  return (
    <div className="space-y-2 border-t border-border p-4">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder={`Reply to ${recipient}…`}
        className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted">
          Appears instantly in their {kind === "customer" ? "Customer" : "Partner"} App
          chat as Groomto support. Logged in Audit Logs.
        </p>
        <button
          type="button"
          onClick={send}
          disabled={isPending || !text.trim()}
          className="shrink-0 rounded-md bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {isPending ? "Sending…" : "Send reply"}
        </button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
