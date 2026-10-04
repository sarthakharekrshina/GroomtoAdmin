import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCustomer } from "@/lib/api/customers";
import { getCustomerAppSalons } from "@/lib/api/catalog";
import { getReviews } from "@/lib/api/reviews";
import { getAdminBookings } from "@/lib/api/bookings";
import { REFERRAL_RULES, formatRupees } from "@/lib/customer-app/rules";
import { BookingsTable } from "@/components/user-app/BookingsTable";
import { ReviewModerationButtons } from "@/components/user-app/ModerationActions";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { Table, Thead, Th, Tbody, Td } from "@/components/ui/Table";
import { EmptyState, FutureFeatureNotice } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { Thumb } from "@/components/ui/Thumb";
import { formatDate, formatDateTime } from "@/lib/utils";

/** Fields given their own place on this page; everything else is listed under "All stored fields". */
const SHOWN = new Set([
  "id",
  "full_name",
  "phone",
  "avatar_url",
  "gender",
  "roles",
  "created_at",
  "has_completed_onboarding",
  "referral_code",
  "referral_points",
  "referred_by_salon",
  "points_balance",
]);

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let customer;
  try {
    customer = await getCustomer(id);
  } catch (e) {
    return <ErrorCard error={e} fallback="Could not load this customer." />;
  }

  if (!customer) {
    return (
      <Card>
        <EmptyState title="Customer not found" />
      </Card>
    );
  }

  const [salonsR, reviewsR, bookingsR] = await Promise.allSettled([
    getCustomerAppSalons(),
    getReviews({ customerId: id, limit: 100 }),
    getAdminBookings({ customerId: id, limit: 20 }),
  ]);
  const salonName = new Map(
    (salonsR.status === "fulfilled" ? salonsR.value : []).map((s) => [s.id, s.name]),
  );

  const roles = Array.isArray(customer.roles) ? customer.roles.map(String) : [];
  const has = (key: string) => key in customer;
  const referralPoints = Number(customer.referral_points ?? 0);
  const referredBy = customer.referred_by_salon ? String(customer.referred_by_salon) : null;
  const otherFields = Object.keys(customer).filter((k) => !SHOWN.has(k));

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/user-app/customers"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to customers
        </Link>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Thumb src={customer.avatar_url as string | null} size={56} round placeholder="No photo" />
            <div>
              <h2 className="text-xl font-semibold text-foreground">
                {String(customer.full_name || "Unnamed customer")}
              </h2>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {roles.map((r) => (
                  <Badge key={r} tone={r === "admin" ? "danger" : r === "partner" ? "gold" : "brand"}>
                    {r}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/user-app/support?thread=${customer.id}`}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-slate-50"
            >
              Support chat
            </Link>
            <Link
              href={`/user-app/broadcast?customer=${customer.id}`}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-slate-50"
            >
              Send a push
            </Link>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader title="Profile" />
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Phone" value={customer.phone} />
          {has("gender") && <Field label="Gender" value={customer.gender} />}
          <Field label="Joined" value={formatDateTime(customer.created_at as string | null)} />
          {has("has_completed_onboarding") && (
            <Field label="Finished sign-up" value={customer.has_completed_onboarding} />
          )}
          <Field label="Customer ID" value={customer.id} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Referrals & points" />
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {has("referral_code") && <Field label="Own referral code" value={customer.referral_code} />}
          {has("referral_points") && (
            <div>
              <Field label="Referral points" value={referralPoints} />
              {referralPoints >= REFERRAL_RULES.REDEEM_THRESHOLD && (
                <Badge tone="success">Can redeem ₹{REFERRAL_RULES.REDEEM_RUPEES} at checkout</Badge>
              )}
            </div>
          )}
          {has("referred_by_salon") && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                Signed up with salon code
              </p>
              <p className="mt-0.5 text-sm text-foreground">
                {referredBy ? (
                  <Link href={`/user-app/services/${referredBy}`} className="text-brand hover:underline">
                    {salonName.get(referredBy) ?? referredBy}
                  </Link>
                ) : (
                  "—"
                )}
              </p>
            </div>
          )}
          {has("points_balance") && (
            <div>
              <Field label="Loyalty points" value={customer.points_balance} />
              <p className="mt-0.5 text-xs text-muted">
                Loyalty is switched off in the app today (rewardsEnabled = false).
              </p>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Reviews written" />
        {reviewsR.status === "rejected" ? (
          <CardBody>
            <p className="text-sm text-danger">
              {reviewsR.reason instanceof Error ? reviewsR.reason.message : "Could not load reviews."}
            </p>
          </CardBody>
        ) : reviewsR.value.length === 0 ? (
          <CardBody>
            <p className="text-sm text-muted">This customer hasn&apos;t reviewed any salon.</p>
          </CardBody>
        ) : (
          <Table>
            <Thead>
              <Th>Date</Th>
              <Th>Salon</Th>
              <Th>Rating</Th>
              <Th>Comment</Th>
              <Th>{""}</Th>
            </Thead>
            <Tbody>
              {reviewsR.value.map((r) => (
                <tr key={r.id} className="align-top">
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
        <CardHeader
          title="Bookings"
          action={
            bookingsR.status === "fulfilled" && bookingsR.value.total > 0 ? (
              <Link href={`/user-app/bookings?customer=${customer.id}`} className="text-sm font-medium text-brand hover:underline">
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
        ) : bookingsR.value.total === 0 ? (
          <CardBody>
            <p className="text-sm text-muted">No bookings yet.</p>
          </CardBody>
        ) : (
          <>
            <CardBody className="grid grid-cols-1 gap-4 border-b border-border sm:grid-cols-3">
              <Field label="Bookings" value={bookingsR.value.total} />
              <Field label="Completed visits" value={bookingsR.value.status_counts.completed ?? 0} />
              <Field label="Lifetime value (completed)" value={formatRupees(bookingsR.value.completed_value)} />
            </CardBody>
            <BookingsTable rows={bookingsR.value.rows} showCustomer={false} />
          </>
        )}
      </Card>

      {otherFields.length > 0 && (
        <Card>
          <details>
            <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-foreground">
              All stored fields ({otherFields.length} more)
            </summary>
            <CardBody className="grid grid-cols-1 gap-4 border-t border-border sm:grid-cols-2 lg:grid-cols-3">
              {otherFields.map((k) => (
                <Field key={k} label={k.replace(/_/g, " ")} value={customer[k]} />
              ))}
            </CardBody>
          </details>
        </Card>
      )}

      <FutureFeatureNotice reason="Saved salons aren't shown — the favorites table's access rules exist only in the live database. Blocking an account was left out for now." />
    </div>
  );
}
