import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { getSupportMessages, getSupportThreads, type SupportKind } from "@/lib/api/support";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { SupportReplyForm } from "@/components/support/SupportReplyForm";
import { formatDateTime } from "@/lib/utils";
import type { SupportMessage } from "@/types/admin";

/**
 * Shared inbox for support_messages. `kind` picks the side: customer threads
 * (Customer App) or salon threads (Partner App). Replies are sent as
 * sender = 'support', which both apps already show as Groomto.
 */
export async function SupportInbox({
  kind,
  basePath,
  selected,
}: {
  kind: SupportKind;
  basePath: string;
  selected?: string;
}) {
  let threads;
  try {
    threads = await getSupportThreads(kind);
  } catch (e) {
    return <ErrorCard error={e} fallback="Could not load the inbox." />;
  }

  const current = threads.find((t) => t.id === selected) ?? null;
  let messages: SupportMessage[] = [];
  let messagesError: string | null = null;
  if (current) {
    try {
      messages = await getSupportMessages(kind, current.id);
    } catch (e) {
      messagesError = e instanceof Error ? e.message : "Could not load messages.";
    }
  }

  const waiting = threads.filter((t) => t.needs_reply).length;
  const theirLabel = kind === "customer" ? "Customer" : "Salon";
  const unnamed = `Unnamed ${theirLabel.toLowerCase()}`;
  const profileHref = (id: string) =>
    kind === "customer" ? `/user-app/customers/${id}` : `/salons/${id}`;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
      <Card className="h-fit">
        <CardHeader
          title={`Conversations (${threads.length})`}
          action={waiting > 0 ? <Badge tone="warning">{waiting} waiting</Badge> : undefined}
        />
        {threads.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No messages yet"
            description={`${theirLabel}s write to support from the chat screen in their app.`}
          />
        ) : (
          <ul className="max-h-[70vh] divide-y divide-border overflow-y-auto">
            {threads.map((t) => (
              <li key={t.id}>
                <Link
                  href={`${basePath}?thread=${t.id}`}
                  className={`block px-4 py-3 hover:bg-slate-50 ${
                    t.id === current?.id ? "bg-brand-light" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-foreground">
                      {t.name || unnamed}
                    </span>
                    {t.needs_reply && <Badge tone="warning">Needs reply</Badge>}
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted">
                    {t.last_sender === "support" ? "You: " : ""}
                    {t.last_message || "—"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {formatDateTime(t.last_at)} · {t.messages} message
                    {t.messages === 1 ? "" : "s"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="flex min-h-[420px] flex-col">
        {!current && selected ? (
          <>
            <CardHeader
              title={`New conversation with this ${theirLabel.toLowerCase()}`}
              action={
                <Link href={profileHref(selected)} className="text-sm font-medium text-brand hover:underline">
                  View {theirLabel.toLowerCase()}
                </Link>
              }
            />
            <div className="flex flex-1 items-center justify-center">
              <EmptyState
                icon={MessageSquare}
                title="No messages yet"
                description={`Your message appears in the chat screen of their ${
                  kind === "customer" ? "Customer" : "Partner"
                } App the next time they open it.`}
              />
            </div>
            <SupportReplyForm kind={kind} partyId={selected} recipient={`this ${theirLabel.toLowerCase()}`} />
          </>
        ) : !current ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              icon={MessageSquare}
              title="Pick a conversation"
              description="Unanswered conversations are listed first."
            />
          </div>
        ) : (
          <>
            <CardHeader
              title={`${current.name || unnamed}${current.phone ? ` · ${current.phone}` : ""}`}
              action={
                <Link
                  href={profileHref(current.id)}
                  className="text-sm font-medium text-brand hover:underline"
                >
                  View {theirLabel.toLowerCase()}
                </Link>
              }
            />
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {messagesError ? (
                <p className="text-sm text-danger">{messagesError}</p>
              ) : (
                messages.map((m) => {
                  const ours = m.sender === "support";
                  return (
                    <div key={m.id} className={`flex ${ours ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
                          ours ? "bg-brand text-white" : "bg-slate-100 text-foreground"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.message}</p>
                        <p className={`mt-1 text-[11px] ${ours ? "text-white/70" : "text-muted"}`}>
                          {ours ? "Groomto support" : theirLabel} · {formatDateTime(m.created_at)}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <SupportReplyForm
              kind={kind}
              partyId={current.id}
              recipient={current.name || theirLabel.toLowerCase()}
            />
          </>
        )}
      </Card>
    </div>
  );
}
