import Link from "next/link";

const SECTIONS = [
  { href: "/payments", label: "Statements" },
  { href: "/payments/penalties", label: "Penalties" },
];

export function PaymentsNav({ active }: { active: string }) {
  return (
    <div className="flex gap-2">
      {SECTIONS.map((s) => (
        <Link
          key={s.href}
          href={s.href}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            active === s.href
              ? "bg-brand-light text-brand"
              : "text-muted hover:bg-slate-50 hover:text-foreground"
          }`}
        >
          {s.label}
        </Link>
      ))}
    </div>
  );
}
