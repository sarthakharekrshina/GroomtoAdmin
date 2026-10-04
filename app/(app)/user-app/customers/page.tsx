import Link from "next/link";
import { Users } from "lucide-react";
import {
  CUSTOMER_GENDERS,
  CUSTOMERS_PAGE_SIZE,
  getUserColumns,
  searchCustomers,
} from "@/lib/api/customers";
import { getCustomerAppSalons } from "@/lib/api/catalog";
import { Card } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Td } from "@/components/ui/Table";
import { EmptyState, FutureFeatureNotice } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { Thumb } from "@/components/ui/Thumb";
import { formatDate } from "@/lib/utils";

type Params = {
  q?: string;
  gender?: string;
  referred?: string;
  points?: string;
  page?: string;
};

const INPUT =
  "rounded-md border border-border px-3 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

function pageHref(params: Params, page: number): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v && k !== "page") sp.set(k, v);
  }
  if (page > 1) sp.set("page", String(page));
  const qs = sp.toString();
  return `/user-app/customers${qs ? `?${qs}` : ""}`;
}

export default async function UserAppCustomersPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  let columns;
  let result;
  try {
    columns = await getUserColumns();
    result = await searchCustomers({ ...params, page }, columns);
  } catch (e) {
    return <ErrorCard error={e} fallback="Could not load customers." />;
  }

  // Salon names for "Referred by" — non-fatal if salons can't be read.
  const salonName = new Map<string, string>();
  try {
    for (const s of await getCustomerAppSalons()) salonName.set(s.id, s.name);
  } catch {
    // Column just shows the raw id.
  }

  const { rows, total } = result;
  const first = total === 0 ? 0 : (page - 1) * CUSTOMERS_PAGE_SIZE + 1;
  const last = Math.min(total, page * CUSTOMERS_PAGE_SIZE);
  const filtered = Boolean(params.q || params.gender || params.referred || params.points);

  return (
    <div className="space-y-4">
      <form className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Search</label>
          <input
            type="search"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder={columns.has("full_name") ? "Name or phone number" : "Phone number"}
            className={`${INPUT} w-64`}
          />
        </div>
        {columns.has("gender") && (
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Gender</label>
            <select name="gender" defaultValue={params.gender ?? ""} className={`${INPUT} w-32`}>
              <option value="">Any</option>
              {CUSTOMER_GENDERS.map((g) => (
                <option key={g} value={g}>
                  {g[0].toUpperCase() + g.slice(1)}
                </option>
              ))}
            </select>
          </div>
        )}
        {columns.has("referred_by_salon") && (
          <label className="flex items-center gap-1.5 pb-1.5 text-sm text-foreground">
            <input
              type="checkbox"
              name="referred"
              value="salon"
              defaultChecked={params.referred === "salon"}
            />
            Signed up with a salon code
          </label>
        )}
        {columns.has("referral_points") && (
          <label className="flex items-center gap-1.5 pb-1.5 text-sm text-foreground">
            <input
              type="checkbox"
              name="points"
              value="yes"
              defaultChecked={params.points === "yes"}
            />
            Has referral points
          </label>
        )}
        <button
          type="submit"
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
        >
          Apply
        </button>
        {filtered && (
          <Link href="/user-app/customers" className="pb-1.5 text-sm text-muted hover:text-foreground">
            Clear
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title={filtered ? "No customers match these filters" : "No customers yet"}
            description={
              filtered
                ? "Try a different search or fewer filters."
                : "Customer accounts are created by the Customer App when someone signs up."
            }
          />
        </Card>
      ) : (
        <Card>
          <Table>
            <Thead>
              <Th>Customer</Th>
              <Th>Phone</Th>
              {columns.has("gender") && <Th>Gender</Th>}
              {columns.has("referral_code") && <Th>Referral code</Th>}
              {columns.has("referral_points") && <Th>Referral points</Th>}
              {columns.has("referred_by_salon") && <Th>Signed up via salon</Th>}
              <Th>Joined</Th>
            </Thead>
            <Tbody>
              {rows.map((c) => {
                const referredBy = c.referred_by_salon ? String(c.referred_by_salon) : null;
                return (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <Td>
                      <Link
                        href={`/user-app/customers/${c.id}`}
                        className="flex items-center gap-2.5 font-medium text-foreground hover:text-brand hover:underline"
                      >
                        <Thumb src={c.avatar_url as string | null} size={32} round placeholder="" />
                        {String(c.full_name || "Unnamed customer")}
                      </Link>
                    </Td>
                    <Td>{String(c.phone ?? "—")}</Td>
                    {columns.has("gender") && <Td>{String(c.gender ?? "—")}</Td>}
                    {columns.has("referral_code") && (
                      <Td className="font-mono text-xs">{String(c.referral_code ?? "—")}</Td>
                    )}
                    {columns.has("referral_points") && <Td>{String(c.referral_points ?? 0)}</Td>}
                    {columns.has("referred_by_salon") && (
                      <Td>
                        {referredBy ? (
                          <Link
                            href={`/user-app/services/${referredBy}`}
                            className="hover:text-brand hover:underline"
                          >
                            {salonName.get(referredBy) ?? referredBy}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </Td>
                    )}
                    <Td>{formatDate(c.created_at as string | null)}</Td>
                  </tr>
                );
              })}
            </Tbody>
          </Table>
          <div className="flex items-center justify-between border-t border-border px-5 py-3 text-sm text-muted">
            <span>
              Showing {first}–{last} of {total}
            </span>
            <span className="flex gap-3">
              {page > 1 && (
                <Link href={pageHref(params, page - 1)} className="font-medium text-brand hover:underline">
                  ← Previous
                </Link>
              )}
              {last < total && (
                <Link href={pageHref(params, page + 1)} className="font-medium text-brand hover:underline">
                  Next →
                </Link>
              )}
            </span>
          </div>
        </Card>
      )}

      <FutureFeatureNotice reason="Booking history, saved salons, support messages and blocking a customer need backend access the admin role doesn't have yet: bookings and support_messages have no admin-read rule, and the favorites table's rules exist only in the live database. Each is a separate, additive change awaiting your approval." />
    </div>
  );
}
