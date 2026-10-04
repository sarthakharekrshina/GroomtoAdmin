"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Store,
  CreditCard,
  Crown,
  Radar,
  ScrollText,
  Settings,
  CalendarCheck,
  Users,
  Tag,
  Star,
  BarChart3,
  Bell,
  Scissors,
  Compass,
  Gift,
  LayoutGrid,
  MessageSquare,
  Ban,
  Megaphone,
  ImageIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean };
type FutureItem = { label: string; icon: LucideIcon };

/**
 * Two top-level sections. "Partner App" = everything the salon-side app
 * drives (settlements, plans, ranking). "User App" = what customers see in
 * the Customer app (salon menus, prices, ratings). Same backend for both —
 * this is a navigation split, not a second data source.
 */
const SECTIONS = {
  partner: {
    label: "Partner App",
    home: "/",
    nav: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/salons", label: "Salons", icon: Store },
      { href: "/payments", label: "Payments", icon: CreditCard },
      { href: "/customers", label: "Customers", icon: Users },
      { href: "/subscriptions", label: "Subscriptions & Referrals", icon: Crown },
      { href: "/visibility", label: "Visibility Insight", icon: Radar },
      { href: "/support", label: "Support Inbox", icon: MessageSquare },
      { href: "/audit-logs", label: "Audit Logs", icon: ScrollText },
      { href: "/settings", label: "Settings", icon: Settings },
    ] as NavItem[],
    future: [
      { label: "Bookings", icon: CalendarCheck },
      { label: "Offers & Coupons", icon: Tag },
      { label: "Reviews", icon: Star },
      { label: "Analytics", icon: BarChart3 },
      { label: "Notifications", icon: Bell },
    ] as FutureItem[],
  },
  user: {
    label: "User App",
    home: "/user-app",
    nav: [
      { href: "/user-app", label: "Overview", icon: LayoutDashboard, exact: true },
      { href: "/user-app/customers", label: "Customers", icon: Users },
      { href: "/user-app/bookings", label: "Bookings", icon: CalendarCheck },
      { href: "/user-app/support", label: "Support Inbox", icon: MessageSquare },
      { href: "/user-app/services", label: "Salons & Services", icon: Store },
      { href: "/user-app/catalog", label: "All Services", icon: Scissors },
      { href: "/user-app/reviews", label: "Reviews & Ratings", icon: Star },
      { href: "/user-app/offers", label: "Offers & Deals", icon: Tag },
      { href: "/user-app/discovery", label: "Discovery Preview", icon: Compass },
      { href: "/user-app/referrals", label: "Referrals", icon: Gift },
      { href: "/user-app/categories", label: "Categories", icon: LayoutGrid },
      { href: "/user-app/broadcast", label: "Push Broadcast", icon: Megaphone },
    ] as NavItem[],
    // Each needs backend access or an app release first — see the notice on
    // the related page for exactly what.
    future: [
      { label: "Customer Block", icon: Ban },
      { label: "Home Banners", icon: ImageIcon },
    ] as FutureItem[],
  },
} as const;

export function Sidebar() {
  const pathname = usePathname();
  const activeKey = pathname.startsWith("/user-app") ? "user" : "partner";
  const section = SECTIONS[activeKey];

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white">
          G
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground leading-none">
            AdminPartner
          </p>
          <p className="mt-0.5 text-[11px] text-muted leading-none">Groomto</p>
        </div>
      </div>

      <div className="px-3 pt-4">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
          {(Object.keys(SECTIONS) as (keyof typeof SECTIONS)[]).map((key) => (
            <Link
              key={key}
              href={SECTIONS[key].home}
              className={cn(
                "rounded-md px-2 py-1.5 text-center text-xs font-semibold transition-colors",
                key === activeKey
                  ? "bg-surface text-brand shadow-sm"
                  : "text-muted hover:text-foreground",
              )}
            >
              {SECTIONS[key].label}
            </Link>
          ))}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {section.nav.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-brand-light text-brand"
                      : "text-foreground/80 hover:bg-slate-50 hover:text-foreground",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>

        {section.future.length > 0 && (
          <p className="mt-6 mb-2 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted">
            Future / Recommended
          </p>
        )}
        <ul className="space-y-1">
          {section.future.map((item) => (
            <li key={item.label}>
              <div className="flex cursor-not-allowed items-center justify-between gap-2.5 rounded-lg px-3 py-2 text-sm text-muted/70">
                <span className="flex items-center gap-2.5">
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </span>
                <span className="rounded-full bg-gold-light px-1.5 py-0.5 text-[10px] font-medium text-gold">
                  Soon
                </span>
              </div>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
