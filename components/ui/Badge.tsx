import { cn } from "@/lib/utils";

const TONE_CLASSES: Record<string, string> = {
  neutral: "bg-slate-100 text-slate-700",
  brand: "bg-brand-light text-brand",
  gold: "bg-gold-light text-gold",
  success: "bg-emerald-50 text-success",
  warning: "bg-amber-50 text-warning",
  danger: "bg-red-50 text-danger",
};

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: keyof typeof TONE_CLASSES;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        TONE_CLASSES[tone],
      )}
    >
      {children}
    </span>
  );
}

const STATEMENT_STATUS_TONE: Record<string, keyof typeof TONE_CLASSES> = {
  pending: "neutral",
  submitted: "brand",
  paid: "success",
  overdue: "danger",
  disputed: "warning",
};

export function StatusBadge({ status }: { status: string }) {
  const tone = STATEMENT_STATUS_TONE[status] ?? "neutral";
  return <Badge tone={tone}>{status}</Badge>;
}
