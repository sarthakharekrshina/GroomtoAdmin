import Link from "next/link";
import { Users, Store, Scissors, Tag, Star, AlertTriangle, CheckCircle2 } from "lucide-react";
import { countCustomers, getLatestCustomers } from "@/lib/api/customers";
import { getAllServices, getCategories, getCustomerAppSalons } from "@/lib/api/catalog";
import { getAllOffers } from "@/lib/api/offers";
import { getReviews, getReviewStats } from "@/lib/api/reviews";
import {
  HOME_CATEGORY_TILES,
  matchHomeTile,
  hasBookableHours,
  offerStatus,
  parseNumber,
  parseOffer,
} from "@/lib/customer-app/rules";
import { StatCard } from "@/components/ui/StatCard";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { formatDate } from "@/lib/utils";

function value<T>(r: PromiseSettledResult<T>): T | null {
  return r.status === "fulfilled" ? r.value : null;
}

export default async function UserAppOverviewPage() {
  const [
    customersR,
    newCustomersR,
    salonsR,
    servicesR,
    offersR,
    statsR,
    categoriesR,
    latestCustomersR,
    latestReviewsR,
  ] = await Promise.allSettled([
    countCustomers(),
    countCustomers(7),
    getCustomerAppSalons(),
    getAllServices(),
    getAllOffers(),
    getReviewStats(),
    getCategories(),
    getLatestCustomers(5),
    getReviews({ limit: 5 }),
  ]);

  const customers = value(customersR);
  const newCustomers = value(newCustomersR);
  const salons = value(salonsR);
  const services = value(servicesR);
  const offers = value(offersR)?.map(parseOffer) ?? null;
  const stats = value(statsR);
  const categories = value(categoriesR);
  const latestCustomers = value(latestCustomersR) ?? [];
  const latestReviews = value(latestReviewsR) ?? [];

  const salonName = new Map((salons ?? []).map((s) => [s.id, s.name]));
  const liveOffers = offers?.filter((o) => offerStatus(o) === "live").length ?? null;

  const health = [
    {
      label: "Salons with no bookable hours",
      count: salons?.filter((s) => !hasBookableHours(s.working_hours)).length,
      effect: "Customers get no time slots, so they can't book these salons.",
      href: "/user-app/services?health=hours",
    },
    {
      label: "Salons with no photos",
      count: salons?.filter((s) => s.photos.length === 0).length,
      effect: "Customers see stock placeholder photos instead.",
      href: "/user-app/services?health=photos",
    },
    {
      label: "Services with no price",
      count: services?.filter((s) => parseNumber(s.price) === null).length,
      effect: "Shown to customers without a price.",
      href: "/user-app/catalog?missing=price",
    },
    {
      label: "Services with no picture",
      count: services?.filter((s) => !s.image_url).length,
      effect: "Shown with a stock placeholder photo.",
      href: "/user-app/catalog?missing=picture",
    },
    {
      label: "Home category tiles with no matching category",
      count: categories
        ? HOME_CATEGORY_TILES.filter((t) => !matchHomeTile(t.categoryName, categories)).length
        : undefined,
      effect: "Tapping the tile shows every salon, unfiltered.",
      href: "/user-app/categories",
    },
  ];

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        Everything here is read live from the same database the Customer App
        uses, so it shows what customers see right now.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Customers"
          value={customers ?? "—"}
          icon={Users}
          hint={newCustomers !== null ? `+${newCustomers} in the last 7 days` : undefined}
        />
        <StatCard
          label="Salons listed"
          value={salons?.length ?? "—"}
          icon={Store}
          hint={
            salons
              ? `${salons.filter((s) => s.photos.length > 0).length} with photos`
              : undefined
          }
        />
        <StatCard
          label="Services"
          value={services?.length ?? "—"}
          icon={Scissors}
          hint={
            services
              ? `${services.filter((s) => s.image_url).length} with pictures`
              : undefined
          }
        />
        <StatCard
          label="Live offers"
          value={liveOffers ?? "—"}
          icon={Tag}
          tone="success"
          hint={offers ? `${offers.length} offers in total` : undefined}
        />
        <StatCard
          label="Reviews"
          value={stats?.total ?? "—"}
          icon={Star}
          tone="warning"
          hint={
            stats?.average != null ? `Average ★ ${stats.average.toFixed(1)}` : undefined
          }
        />
      </div>

      <Card>
        <CardHeader title="Data health — what customers are missing" />
        <ul className="divide-y divide-border">
          {health.map((h) => (
            <li key={h.label} className="flex items-center justify-between gap-4 px-5 py-3">
              <div className="flex items-start gap-3">
                {h.count === undefined ? (
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-muted" />
                ) : h.count > 0 ? (
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" />
                ) : (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-success" />
                )}
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {h.label}:{" "}
                    <span className={h.count ? "text-warning" : "text-foreground"}>
                      {h.count ?? "could not check"}
                    </span>
                  </p>
                  <p className="text-xs text-muted">{h.effect}</p>
                </div>
              </div>
              {h.count ? (
                <Link href={h.href} className="shrink-0 text-sm font-medium text-brand hover:underline">
                  Review
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Newest customers"
            action={
              <Link href="/user-app/customers" className="text-sm font-medium text-brand hover:underline">
                All customers
              </Link>
            }
          />
          {latestCustomers.length === 0 ? (
            <CardBody>
              <p className="text-sm text-muted">No customers to show.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-border">
              {latestCustomers.map((c) => (
                <li key={c.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <Link
                    href={`/user-app/customers/${c.id}`}
                    className="font-medium text-foreground hover:text-brand hover:underline"
                  >
                    {String(c.full_name || "Unnamed customer")}
                  </Link>
                  <span className="text-muted">
                    {String(c.phone ?? "—")} · {formatDate(c.created_at as string | null)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Latest reviews"
            action={
              <Link href="/user-app/reviews" className="text-sm font-medium text-brand hover:underline">
                All reviews
              </Link>
            }
          />
          {latestReviews.length === 0 ? (
            <CardBody>
              <p className="text-sm text-muted">No reviews to show.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-border">
              {latestReviews.map((r) => (
                <li key={r.id} className="px-5 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">
                      {salonName.get(r.salon_id ?? "") ?? "Unknown salon"}
                    </span>
                    <span className="text-gold">★ {r.rating ?? "—"}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-muted">
                    {r.comment || "No comment"} · {r.customer_name ?? "Customer"} ·{" "}
                    {formatDate(r.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
