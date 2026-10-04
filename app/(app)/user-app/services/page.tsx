import Link from "next/link";
import { Store } from "lucide-react";
import { getAllServices, getCustomerAppSalons } from "@/lib/api/catalog";
import { getAllOffers } from "@/lib/api/offers";
import {
  hasBookableHours,
  minPriceBySalon,
  formatRupees,
  offerStatus,
  parseOffer,
} from "@/lib/customer-app/rules";
import { Card, CardHeader } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Td } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { Thumb } from "@/components/ui/Thumb";
import { formatRating } from "@/lib/utils";

const FILTERS = [
  { key: "", label: "All salons" },
  { key: "hours", label: "No bookable hours" },
  { key: "photos", label: "No photos" },
] as const;

export default async function UserAppServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; health?: string }>;
}) {
  const { q, health } = await searchParams;

  let salons;
  let services;
  try {
    [salons, services] = await Promise.all([getCustomerAppSalons(), getAllServices()]);
  } catch (e) {
    return <ErrorCard error={e} fallback="Could not load the catalog." />;
  }

  // Offers only add a column — the page still works if they can't be read.
  let liveOffers: Map<string, number> | null = new Map();
  try {
    for (const o of (await getAllOffers()).map(parseOffer)) {
      if (offerStatus(o) === "live") liveOffers.set(o.salonId, (liveOffers.get(o.salonId) ?? 0) + 1);
    }
  } catch {
    liveOffers = null;
  }

  const serviceCount = new Map<string, number>();
  for (const s of services) serviceCount.set(s.salon_id, (serviceCount.get(s.salon_id) ?? 0) + 1);
  const minPrice = minPriceBySalon(services);

  const term = (q ?? "").trim().toLowerCase();
  const shown = salons.filter((s) => {
    if (health === "hours" && hasBookableHours(s.working_hours)) return false;
    if (health === "photos" && s.photos.length > 0) return false;
    if (!term) return true;
    return (
      s.name.toLowerCase().includes(term) || (s.city ?? "").toLowerCase().includes(term)
    );
  });

  if (salons.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Store}
          title="No salons yet"
          description="Salon menus appear here once partners onboard."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={`/user-app/services${f.key ? `?health=${f.key}` : ""}`}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                (health ?? "") === f.key
                  ? "bg-surface text-brand shadow-sm"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>
        <form className="flex gap-2">
          {health && <input type="hidden" name="health" value={health} />}
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Salon name or city"
            className="w-56 rounded-md border border-border px-3 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
          <button
            type="submit"
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
          >
            Search
          </button>
        </form>
      </div>

      <Card>
        <CardHeader title={`Salons as customers see them (${shown.length})`} />
        {shown.length === 0 ? (
          <EmptyState title="No salons match" description="Try another filter or search." />
        ) : (
          <Table>
            <Thead>
              <Th>Salon</Th>
              <Th>Type</Th>
              <Th>Rating</Th>
              <Th>Starts from</Th>
              <Th>Services</Th>
              <Th>Live offers</Th>
              <Th>Booking hours</Th>
              <Th>Photos</Th>
              <Th>{""}</Th>
            </Thead>
            <Tbody>
              {shown.map((s) => {
                const price = minPrice.get(s.id);
                return (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <Thumb src={s.photos[0]} size={36} placeholder="" />
                        <div>
                          <p className="font-medium text-foreground">{s.name}</p>
                          <p className="text-xs text-muted">{s.city ?? "No city"}</p>
                        </div>
                      </div>
                    </Td>
                    <Td>{s.type ?? "—"}</Td>
                    <Td>
                      {formatRating(s.rating_avg, s.rating_count)}
                      {s.rating_override_avg != null && (
                        <span className="ml-1.5">
                          <Badge tone="gold">override</Badge>
                        </span>
                      )}
                    </Td>
                    <Td>{price !== undefined ? formatRupees(price) : "—"}</Td>
                    <Td>{serviceCount.get(s.id) ?? 0}</Td>
                    <Td>{liveOffers ? (liveOffers.get(s.id) ?? 0) : "—"}</Td>
                    <Td>
                      {hasBookableHours(s.working_hours) ? (
                        <Badge tone="success">Set</Badge>
                      ) : (
                        <Badge tone="danger">Not bookable</Badge>
                      )}
                    </Td>
                    <Td>
                      {s.photos.length > 0 ? (
                        s.photos.length
                      ) : (
                        <Badge tone="warning">Placeholder</Badge>
                      )}
                    </Td>
                    <Td>
                      <Link
                        href={`/user-app/services/${s.id}`}
                        className="text-sm font-medium text-brand hover:underline"
                      >
                        View &amp; edit
                      </Link>
                    </Td>
                  </tr>
                );
              })}
            </Tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
