import Link from "next/link";
import { Tag } from "lucide-react";
import { getAllOffers } from "@/lib/api/offers";
import { getCustomerAppSalons } from "@/lib/api/catalog";
import {
  offerHeadline,
  offerMinOrderNote,
  offerStatus,
  parseOffer,
  type OfferStatus,
} from "@/lib/customer-app/rules";
import { Card, CardHeader } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Td } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { StatCard } from "@/components/ui/StatCard";
import { formatDate, formatDateTime } from "@/lib/utils";
import { OfferToggleButton } from "@/components/user-app/ModerationActions";

type Params = { status?: string; salon?: string };

const STATUS: Record<OfferStatus, { label: string; tone: "success" | "brand" | "neutral" | "warning"; note: string }> = {
  live: { label: "Live", tone: "success", note: "Customers see it now" },
  scheduled: { label: "Scheduled", tone: "brand", note: "Starts later" },
  expired: { label: "Expired", tone: "neutral", note: "End date passed" },
  inactive: { label: "Inactive", tone: "neutral", note: "Turned off by the salon" },
  "no-benefit": { label: "No benefit", tone: "warning", note: "Hidden: 0% / ₹0 / no free item" },
};

const INPUT =
  "rounded-md border border-border px-3 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

export default async function OffersPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;

  let offers;
  let salons;
  try {
    [offers, salons] = await Promise.all([getAllOffers(), getCustomerAppSalons()]);
  } catch (e) {
    return <ErrorCard error={e} fallback="Could not load offers." />;
  }

  const salonName = new Map(salons.map((s) => [s.id, s.name]));
  const now = new Date();
  const parsed = offers
    .map(parseOffer)
    .map((o) => ({ offer: o, status: offerStatus(o, now) }))
    .sort((a, b) => (b.offer.createdAt?.getTime() ?? 0) - (a.offer.createdAt?.getTime() ?? 0));

  const counts = new Map<OfferStatus, number>();
  for (const p of parsed) counts.set(p.status, (counts.get(p.status) ?? 0) + 1);

  const shown = parsed.filter(
    (p) =>
      (!params.status || p.status === params.status) &&
      (!params.salon || p.offer.salonId === params.salon),
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {(Object.keys(STATUS) as OfferStatus[]).map((s) => (
          <StatCard
            key={s}
            label={STATUS[s].label}
            value={counts.get(s) ?? 0}
            icon={s === "live" ? Tag : undefined}
            tone={s === "live" ? "success" : s === "no-benefit" ? "warning" : "default"}
            hint={STATUS[s].note}
          />
        ))}
      </div>

      <form className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Status</label>
          <select name="status" defaultValue={params.status ?? ""} className={`${INPUT} w-40`}>
            <option value="">All</option>
            {(Object.keys(STATUS) as OfferStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS[s].label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Salon</label>
          <select name="salon" defaultValue={params.salon ?? ""} className={`${INPUT} w-52`}>
            <option value="">All salons</option>
            {salons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
        >
          Apply
        </button>
        {(params.status || params.salon) && (
          <Link href="/user-app/offers" className="pb-1.5 text-sm text-muted hover:text-foreground">
            Clear
          </Link>
        )}
      </form>

      <Card>
        <CardHeader title={`Offers (${shown.length})`} />
        {shown.length === 0 ? (
          <EmptyState icon={Tag} title="No offers match" description="Salons create offers in the Partner App." />
        ) : (
          <Table>
            <Thead>
              <Th>Salon</Th>
              <Th>Deal</Th>
              <Th>Title</Th>
              <Th>Terms</Th>
              <Th>Code</Th>
              <Th>Valid</Th>
              <Th>Status</Th>
              <Th>Created</Th>
              <Th>{""}</Th>
            </Thead>
            <Tbody>
              {shown.map(({ offer: o, status }) => (
                <tr key={o.id} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/user-app/services/${o.salonId}`} className="font-medium hover:text-brand hover:underline">
                      {salonName.get(o.salonId) ?? "Unknown salon"}
                    </Link>
                  </Td>
                  <Td className="font-medium text-foreground">{offerHeadline(o)}</Td>
                  <Td>{o.title || "—"}</Td>
                  <Td>{offerMinOrderNote(o) ?? "—"}</Td>
                  <Td className="font-mono text-xs">{o.code ?? "—"}</Td>
                  <Td className="text-xs">
                    {o.validFrom ? formatDateTime(o.validFrom.toISOString()) : "Any time"}
                    {" → "}
                    {o.validUntil ? formatDateTime(o.validUntil.toISOString()) : "No end"}
                  </Td>
                  <Td>
                    <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>
                  </Td>
                  <Td>{formatDate(o.createdAt?.toISOString())}</Td>
                  <Td>
                    <OfferToggleButton
                      offerId={o.id}
                      active={o.active}
                      title={`${salonName.get(o.salonId) ?? "Salon"} — ${offerHeadline(o)}`}
                    />
                  </Td>
                </tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>

      <p className="text-xs text-muted">
        Pause hides an offer from customers at once and tells the salon (it can turn the
        offer back on from its own app). Resume still respects the salon&apos;s plan limit for
        live offers. Editing an offer&apos;s terms stays with the salon. The offers table&apos;s
        access rules exist only in the live database, so this list is every offer those
        rules let an admin account read — at minimum the live ones customers see.
      </p>
    </div>
  );
}
