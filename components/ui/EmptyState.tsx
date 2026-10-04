import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      {Icon && <Icon className="h-9 w-9 text-muted" strokeWidth={1.5} />}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && (
        <p className="max-w-sm text-sm text-muted">{description}</p>
      )}
    </div>
  );
}

export function FutureFeatureNotice({ reason }: { reason: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-gold-light/40 px-4 py-3 text-sm text-muted">
      <span className="font-medium text-gold">Future / Recommended — </span>
      {reason}
    </div>
  );
}
