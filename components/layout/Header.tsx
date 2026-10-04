"use client";

import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/actions/auth";

const TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/salons": "Salons",
  "/payments/penalties": "Penalties",
  "/payments": "Payments",
  "/customers": "Customers",
  "/subscriptions": "Subscriptions & Referrals",
  "/visibility": "Visibility Insight",
  "/audit-logs": "Audit Logs",
  "/settings": "Settings",
  "/support": "Support Inbox (salons)",
  "/user-app": "User App · Overview",
  "/user-app/customers": "User App · Customers",
  "/user-app/services": "User App · Salons & Services",
  "/user-app/catalog": "User App · All Services",
  "/user-app/reviews": "User App · Reviews & Ratings",
  "/user-app/offers": "User App · Offers & Deals",
  "/user-app/discovery": "User App · Discovery Preview",
  "/user-app/referrals": "User App · Referrals",
  "/user-app/categories": "User App · Categories",
  "/user-app/bookings": "User App · Bookings",
  "/user-app/support": "User App · Support Inbox",
  "/user-app/broadcast": "User App · Push Broadcast",
};

function resolveTitle(pathname: string): string {
  if (TITLES[pathname]) return TITLES[pathname];
  // Longest matching prefix, so "/user-app/customers/x" beats "/user-app".
  const segment = Object.keys(TITLES)
    .filter((key) => key !== "/" && pathname.startsWith(key))
    .sort((a, b) => b.length - a.length)[0];
  return segment ? TITLES[segment] : "AdminPartner";
}

export function Header() {
  const pathname = usePathname();

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-surface px-6">
      <h1 className="text-lg font-semibold text-foreground">
        {resolveTitle(pathname)}
      </h1>
      <form action={signOut}>
        <button
          type="submit"
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-muted hover:bg-slate-50 hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </form>
    </header>
  );
}
