import Link from "next/link";
import { Star } from "lucide-react";
import { getReviews, getReviewStats } from "@/lib/api/reviews";
import { getCustomerAppSalons } from "@/lib/api/catalog";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Td } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ReviewModerationButtons } from "@/components/user-app/ModerationActions";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { StatCard } from "@/components/ui/StatCard";
import { formatDate, formatRating } from "@/lib/utils";

type Params = { salon?: string; rating?: string; q?: string };

const INPUT =
  "rounded-md border border-border px-3 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const rating = Number.parseInt(params.rating ?? "", 10);

  let reviews;
  let stats;
  let salons;
  try {
    [reviews, stats, salons] = await Promise.all([
      getReviews({
        salonId: params.salon || undefined,
        rating: Number.isFinite(rating) ? rating : undefined,
        q: params.q,
      }),
      getReviewStats(),
      getCustomerAppSalons(),
    ]);
  } catch (e) {
    return <ErrorCard error={e} fallback="Could not load reviews." />;
  }

  const salonName = new Map(salons.map((s) => [s.id, s.name]));
  const maxBar = Math.max(1, ...stats.distribution);
  const filtered = Boolean(params.salon || params.rating || params.q);

  // Shown rating vs. what the reviews add up to. They differ when an admin
  // override pins the rating, or if the live rating trigger ever missed a row.
  const comparison = salons
    .map((s) => {
      const fromReviews = stats.bySalon.get(s.id);
      const shownCount = s.rating_count;
      const actualCount = fromReviews?.count ?? 0;
      const mismatch =
        s.rating_override_avg == null &&
        (shownCount !== actualCount ||
          (actualCount > 0 &&
            Math.abs((s.rating_avg ?? 0) - (fromReviews?.average ?? 0)) >= 0.05));
      return { salon: s, fromReviews, mismatch };
    })
    .sort((a, b) => (b.fromReviews?.count ?? 0) - (a.fromReviews?.count ?? 0));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <StatCard label="Reviews" value={stats.total} icon={Star} tone="warning" />
        <StatCard
          label="Average rating"
          value={stats.average != null ? `★ ${stats.average.toFixed(2)}` : "—"}
          hint="Across every review, all salons"
        />
        <Card>
          <CardBody className="space-y-1.5">
            {[5, 4, 3, 2, 1].map((n) => (
              <div key={n} className="flex items-center gap-2 text-xs">
                <span className="w-6 text-muted">{n}★</span>
                <div className="h-2 flex-1 rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-gold"
                    style={{ width: `${(stats.distribution[n - 1] / maxBar) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right text-muted">{stats.distribution[n - 1]}</span>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <form className="flex flex-wrap items-end gap-3">
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
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Rating</label>
          <select name="rating" defaultValue={params.rating ?? ""} className={`${INPUT} w-28`}>
            <option value="">Any</option>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {n}★
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Comment contains</label>
          <input type="search" name="q" defaultValue={params.q ?? ""} className={`${INPUT} w-56`} />
        </div>
        <button
          type="submit"
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
        >
          Apply
        </button>
        {filtered && (
          <Link href="/user-app/reviews" className="pb-1.5 text-sm text-muted hover:text-foreground">
            Clear
          </Link>
        )}
      </form>

      <Card>
        <CardHeader title={`Reviews (${reviews.length}${reviews.length === 200 ? ", newest 200" : ""})`} />
        {reviews.length === 0 ? (
          <EmptyState
            icon={Star}
            title={filtered ? "No reviews match" : "No reviews yet"}
            description={filtered ? "Try different filters." : "Customers rate a salon after a completed visit."}
          />
        ) : (
          <Table>
            <Thead>
              <Th>Date</Th>
              <Th>Salon</Th>
              <Th>Customer</Th>
              <Th>Rating</Th>
              <Th>Comment</Th>
              <Th>{""}</Th>
            </Thead>
            <Tbody>
              {reviews.map((r) => (
                <tr key={r.id} className="align-top hover:bg-slate-50">
                  <Td>{formatDate(r.created_at)}</Td>
                  <Td>
                    {r.salon_id ? (
                      <Link href={`/user-app/services/${r.salon_id}`} className="hover:text-brand hover:underline">
                        {salonName.get(r.salon_id) ?? r.salon_id}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td>
                    {r.customer_id ? (
                      <Link
                        href={`/user-app/customers/${r.customer_id}`}
                        className="hover:text-brand hover:underline"
                      >
                        {r.customer_name || "Customer"}
                      </Link>
                    ) : (
                      r.customer_name || "—"
                    )}
                  </Td>
                  <Td className="text-gold">★ {r.rating ?? "—"}</Td>
                  <Td className="max-w-md whitespace-normal">{r.comment || "—"}</Td>
                  <Td>
                    <ReviewModerationButtons reviewId={r.id} hasComment={Boolean(r.comment?.trim())} />
                  </Td>
                </tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader title="Salon ratings — shown to customers vs. their reviews" />
        <Table>
          <Thead>
            <Th>Salon</Th>
            <Th>Shown in the app</Th>
            <Th>From reviews</Th>
            <Th>{""}</Th>
          </Thead>
          <Tbody>
            {comparison.map(({ salon, fromReviews, mismatch }) => (
              <tr key={salon.id} className="hover:bg-slate-50">
                <Td>
                  <Link href={`/user-app/services/${salon.id}`} className="font-medium hover:text-brand hover:underline">
                    {salon.name}
                  </Link>
                </Td>
                <Td>{formatRating(salon.rating_avg, salon.rating_count)}</Td>
                <Td>
                  {fromReviews ? `★ ${fromReviews.average.toFixed(1)} (${fromReviews.count})` : "No reviews"}
                </Td>
                <Td>
                  {salon.rating_override_avg != null ? (
                    <Badge tone="gold">Admin override</Badge>
                  ) : mismatch ? (
                    <Badge tone="warning">Doesn&apos;t match</Badge>
                  ) : null}
                </Td>
              </tr>
            ))}
          </Tbody>
        </Table>
      </Card>

      <p className="text-xs text-muted">
        Remove comment clears abusive text and keeps the stars, so the salon&apos;s rating
        doesn&apos;t move. Delete removes the whole review and recalculates the salon&apos;s
        rating (an admin rating override still wins). Either way the original is kept in
        Audit Logs. To change a rating directly, use the override on the salon&apos;s page.
      </p>
    </div>
  );
}
