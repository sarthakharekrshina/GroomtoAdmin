import Link from "next/link";
import { CalendarCheck, IndianRupee } from "lucide-react";
import { getAdminBookings } from "@/lib/api/bookings";
import { getCustomerAppSalons } from "@/lib/api/catalog";
import { formatRupees } from "@/lib/customer-app/rules";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { StatCard } from "@/components/ui/StatCard";
import { BookingsTable, statusLabel } from "@/components/user-app/BookingsTable";

type Params = {
  status?: string;
  salon?: string;
  customer?: string;
  from?: string;
  to?: string;
  q?: string;
  page?: string;
};

const PAGE_SIZE = 50;

/** Every status either app writes (Customer App booking.dart + Partner App booking_model.dart). */
const STATUSES = [
  "pending_approval", "new", "suggested", "confirmed", "upcoming",
  "in_progress", "completed", "cancelled", "rejected", "expired",
];

const INPUT =
  "rounded-md border border-border px-3 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

function href(params: Params, patch: Partial<Params>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...patch })) if (v) sp.set(k, v);
  const qs = sp.toString();
  return `/user-app/bookings${qs ? `?${qs}` : ""}`;
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  let result;
  try {
    result = await getAdminBookings({
      status: params.status,
      salonId: params.salon,
      customerId: params.customer,
      from: params.from,
      to: params.to,
      search: params.q,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    });
  } catch (e) {
    return <ErrorCard error={e} fallback="Could not load bookings." />;
  }

  let salons: { id: string; name: string }[] = [];
  try {
    salons = await getCustomerAppSalons();
  } catch {
    // Salon filter just won't be offered.
  }

  const allCount = Object.values(result.status_counts).reduce((a, b) => a + b, 0);
  const filtered = Boolean(params.status || params.salon || params.customer || params.from || params.to || params.q);
  const first = result.total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(result.total, page * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          label={params.status ? `${statusLabel(params.status)} bookings` : "Bookings"}
          value={result.total}
          icon={CalendarCheck}
          hint={filtered ? "Matching the filters below" : "All bookings, both apps"}
        />
        <StatCard
          label="Completed value"
          value={formatRupees(result.completed_value)}
          icon={IndianRupee}
          tone="success"
          hint="What customers were charged for completed visits"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Link
          href={href(params, { status: undefined, page: undefined })}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            !params.status ? "bg-brand text-white" : "bg-slate-100 text-muted hover:text-foreground"
          }`}
        >
          All {allCount}
        </Link>
        {STATUSES.filter((s) => result.status_counts[s]).map((s) => (
          <Link
            key={s}
            href={href(params, { status: s, page: undefined })}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              params.status === s ? "bg-brand text-white" : "bg-slate-100 text-muted hover:text-foreground"
            }`}
          >
            {statusLabel(s)} {result.status_counts[s]}
          </Link>
        ))}
      </div>

      <form className="flex flex-wrap items-end gap-3">
        {params.status && <input type="hidden" name="status" value={params.status} />}
        {params.customer && <input type="hidden" name="customer" value={params.customer} />}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Customer name or phone</label>
          <input type="search" name="q" defaultValue={params.q ?? ""} className={`${INPUT} w-56`} />
        </div>
        {salons.length > 0 && (
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Salon</label>
            <select name="salon" defaultValue={params.salon ?? ""} className={`${INPUT} w-48`}>
              <option value="">All salons</option>
              {salons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Booking date from</label>
          <input type="date" name="from" defaultValue={params.from ?? ""} className={INPUT} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">to</label>
          <input type="date" name="to" defaultValue={params.to ?? ""} className={INPUT} />
        </div>
        <button
          type="submit"
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
        >
          Apply
        </button>
        {filtered && (
          <Link href="/user-app/bookings" className="pb-1.5 text-sm text-muted hover:text-foreground">
            Clear
          </Link>
        )}
      </form>

      <Card>
        <CardHeader title={params.customer ? "Bookings for one customer" : "Bookings, newest first"} />
        {result.rows.length === 0 ? (
          <EmptyState
            icon={CalendarCheck}
            title={filtered ? "No bookings match" : "No bookings yet"}
            description={filtered ? "Try different filters." : "Bookings appear here as customers book."}
          />
        ) : (
          <>
            <BookingsTable rows={result.rows} />
            <div className="flex items-center justify-between border-t border-border px-5 py-3 text-sm text-muted">
              <span>
                Showing {first}–{last} of {result.total}
              </span>
              <span className="flex gap-3">
                {page > 1 && (
                  <Link href={href(params, { page: String(page - 1) })} className="font-medium text-brand hover:underline">
                    ← Previous
                  </Link>
                )}
                {last < result.total && (
                  <Link href={href(params, { page: String(page + 1) })} className="font-medium text-brand hover:underline">
                    Next →
                  </Link>
                )}
              </span>
            </div>
          </>
        )}
      </Card>

      <p className="text-xs text-muted">
        Read-only. Bookings are accepted, rescheduled and completed by salons in the
        Partner App and cancelled by customers — the admin panel never changes them.
      </p>
    </div>
  );
}
