import Link from "next/link";
import { ArrowLeft, Scissors } from "lucide-react";
import {
  getCatalogSalon,
  getCategoryNames,
  getSalonCatalog,
} from "@/lib/api/catalog";
import { getSalonOffers } from "@/lib/api/offers";
import { getReviews } from "@/lib/api/reviews";
import { getAdminBookings } from "@/lib/api/bookings";
import { BookingsTable } from "@/components/user-app/BookingsTable";
import { OfferToggleButton } from "@/components/user-app/ModerationActions";
import {
  formatRupees,
  hasBookableHours,
  minPriceBySalon,
  offerHeadline,
  offerMinOrderNote,
  offerStatus,
  parseOffer,
  toCustomerAppSalon,
  workingHoursSummary,
  type OfferStatus,
} from "@/lib/customer-app/rules";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { Table, Thead, Th, Tbody, Td } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { Thumb } from "@/components/ui/Thumb";
import {
  SalonRatingForm,
  ServiceImageForm,
  ServicePriceForm,
} from "@/components/catalog/CatalogForms";
import { formatDate, formatRating } from "@/lib/utils";
import type { ServiceVariant } from "@/types/admin";

const STATUS_TONE: Record<OfferStatus, "success" | "brand" | "neutral" | "warning"> = {
  live: "success",
  scheduled: "brand",
  expired: "neutral",
  inactive: "neutral",
  "no-benefit": "warning",
};

function formatDuration(value: string | number | null): string {
  if (value == null || value === "") return "—";
  return `${value} min`;
}

export default async function SalonCatalogPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let salon;
  let services;
  let categories;
  try {
    [salon, services, categories] = await Promise.all([
      getCatalogSalon(id),
      getSalonCatalog(id),
      getCategoryNames(),
    ]);
  } catch (e) {
    return <ErrorCard error={e} fallback="Could not load this salon." />;
  }

  if (!salon) {
    return (
      <Card>
        <EmptyState title="Salon not found" />
      </Card>
    );
  }

  // Extras for the customer view — each is optional, the editors below never depend on them.
  const [offersR, reviewsR, bookingsR] = await Promise.allSettled([
    getSalonOffers(id),
    getReviews({ salonId: id, limit: 5 }),
    getAdminBookings({ salonId: id, limit: 10 }),
  ]);

  const view = toCustomerAppSalon(salon as unknown as Record<string, unknown>);
  const startPrice = minPriceBySalon(services).get(id);
  const hours = workingHoursSummary(view.working_hours);
  const offers = offersR.status === "fulfilled" ? offersR.value.map(parseOffer) : null;

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/user-app/services"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to all salons
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-foreground">{view.name}</h2>
            <p className="text-sm text-muted">
              {[view.type, view.city].filter(Boolean).join(" · ") || "No type or city set"}
            </p>
          </div>
          <Link
            href={`/user-app/services/${id}/edit`}
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
          >
            Edit profile
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="What customers see" />
          <CardBody className="space-y-4">
            {view.photos.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {view.photos.slice(0, 8).map((p) => (
                  <Thumb key={p} src={p} size={88} />
                ))}
                {view.photos.length > 8 && (
                  <span className="self-center text-xs text-muted">
                    +{view.photos.length - 8} more
                  </span>
                )}
              </div>
            ) : (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-warning">
                No photos — the app shows stock placeholder photos for this salon.
              </p>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Rating shown" value={formatRating(view.rating_avg, view.rating_count)} />
              <Field label="Starts from" value={startPrice !== undefined ? formatRupees(startPrice) : null} />
              <Field label="Phone" value={view.phone} />
              <Field label="Address" value={view.address} />
              <Field label="City" value={view.city} />
              <Field label="Pincode" value={view.pincode} />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Opening hours</p>
              {hasBookableHours(view.working_hours) ? (
                <p className="mt-0.5 text-sm text-foreground">{hours}</p>
              ) : (
                <p className="mt-0.5 text-sm text-danger">
                  {hours ? `${hours} — ` : ""}Not bookable: without opening times and
                  at least one working day the app offers customers no time slots.
                </p>
              )}
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Map location</p>
              {view.latitude !== null && view.longitude !== null ? (
                <a
                  href={`https://www.google.com/maps?q=${view.latitude},${view.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-0.5 inline-block text-sm text-brand hover:underline"
                >
                  Open in Google Maps ({view.latitude.toFixed(5)}, {view.longitude.toFixed(5)})
                </a>
              ) : (
                <p className="mt-0.5 text-sm text-warning">
                  No map pin — customers see no distance for this salon, it drops
                  out of distance filters, and Directions falls back to an
                  address search.
                </p>
              )}
            </div>
            {view.description && (
              <Field label="Description" value={view.description} />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Offers" />
          {offers === null ? (
            <CardBody>
              <p className="text-sm text-muted">Offers couldn&apos;t be loaded.</p>
            </CardBody>
          ) : offers.length === 0 ? (
            <CardBody>
              <p className="text-sm text-muted">This salon has no offers.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-border">
              {offers.map((o) => {
                const status = offerStatus(o);
                return (
                  <li key={o.id} className="px-5 py-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground">{offerHeadline(o)}</span>
                      <span className="flex items-center gap-1.5">
                        <Badge tone={STATUS_TONE[status]}>{status}</Badge>
                        <OfferToggleButton
                          offerId={o.id}
                          active={o.active}
                          title={`${view.name} — ${offerHeadline(o)}`}
                        />
                      </span>
                    </div>
                    <p className="text-xs text-muted">
                      {[o.title, offerMinOrderNote(o), o.code ? `Code ${o.code}` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Salon rating"
          action={
            <Link href={`/user-app/reviews?salon=${id}`} className="text-sm font-medium text-brand hover:underline">
              All reviews for this salon
            </Link>
          }
        />
        <CardBody className="space-y-3">
          <SalonRatingForm
            salonId={id}
            currentAvg={salon.rating_avg}
            currentCount={salon.rating_count}
            overrideActive={salon.rating_override_avg != null}
          />
          <p className="text-xs text-muted">
            An override pins the rating customers see — new reviews won&apos;t
            change it until you remove the override. It also moves this salon in
            customer search ranking. Every change is recorded in Audit Logs.
          </p>
          {reviewsR.status === "fulfilled" && reviewsR.value.length > 0 && (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {reviewsR.value.map((r) => (
                <li key={r.id} className="px-4 py-2.5 text-sm">
                  <span className="text-gold">★ {r.rating ?? "—"}</span>{" "}
                  <span className="text-foreground">{r.comment || "No comment"}</span>
                  <span className="text-muted">
                    {" "}
                    · {r.customer_name ?? "Customer"} · {formatDate(r.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Recent bookings"
          action={
            bookingsR.status === "fulfilled" && bookingsR.value.total > 0 ? (
              <Link href={`/user-app/bookings?salon=${id}`} className="text-sm font-medium text-brand hover:underline">
                All {bookingsR.value.total}
              </Link>
            ) : undefined
          }
        />
        {bookingsR.status === "rejected" ? (
          <CardBody>
            <p className="text-sm text-muted">
              {/could not find the function/i.test(String(bookingsR.reason?.message ?? ""))
                ? "Switch this on by running supabase/proposed/phase2_admin_functions.sql in Supabase."
                : String(bookingsR.reason?.message ?? "Couldn't load bookings.")}
            </p>
          </CardBody>
        ) : bookingsR.value.rows.length === 0 ? (
          <CardBody>
            <p className="text-sm text-muted">No bookings yet.</p>
          </CardBody>
        ) : (
          <BookingsTable rows={bookingsR.value.rows} showSalon={false} />
        )}
      </Card>

      <Card>
        <CardHeader title={`Services (${services.length})`} />
        {services.length === 0 ? (
          <EmptyState
            icon={Scissors}
            title="No services"
            description="This salon hasn't added any services yet."
          />
        ) : (
          <Table>
            <Thead>
              <Th>Picture</Th>
              <Th>Service</Th>
              <Th>Category</Th>
              <Th>Duration</Th>
              <Th>Price</Th>
            </Thead>
            <Tbody>
              {services.map((s) => {
                const variants: ServiceVariant[] = Array.isArray(s.variants)
                  ? s.variants
                  : [];
                return (
                  <tr key={s.id} className="align-top">
                    <Td>
                      <ServiceImageForm
                        serviceId={s.id}
                        salonId={id}
                        currentUrl={s.image_url ?? null}
                      />
                    </Td>
                    <Td className="font-medium text-foreground">
                      {s.name ?? "—"}
                    </Td>
                    <Td>
                      {(s.category_id && categories.get(s.category_id)) ?? "—"}
                    </Td>
                    <Td>{formatDuration(s.duration)}</Td>
                    <Td>
                      <ServicePriceForm
                        serviceId={s.id}
                        salonId={id}
                        currentPrice={s.price == null ? "" : String(s.price)}
                        currentVariants={variants}
                      />
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
