import { Users } from "lucide-react";
import { getCustomers } from "@/lib/api/customers";
import { Card } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Td } from "@/components/ui/Table";
import { EmptyState, FutureFeatureNotice } from "@/components/ui/EmptyState";

// The `users` table's full column set isn't defined in any reviewed migration,
// so columns are derived from the rows actually returned rather than assumed.
// `roles` is rendered but never used to decide anything — admin-ness always
// comes from the is_platform_admin() RPC (see ADMIN_ANALYSIS.md §11).
const HIDDEN_COLUMNS = ["id", "raw_app_meta_data", "raw_user_meta_data"];

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  let customers;
  try {
    customers = await getCustomers(q);
  } catch (e) {
    return (
      <Card>
        <div className="p-5">
          <p className="text-sm text-danger">
            {e instanceof Error ? e.message : "Could not load customers."}
          </p>
        </div>
      </Card>
    );
  }

  const columns = Array.from(
    new Set(customers.flatMap((c) => Object.keys(c))),
  ).filter((c) => !HIDDEN_COLUMNS.includes(c));

  return (
    <div className="space-y-4">
      <form className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search by phone number"
          className="w-64 rounded-md border border-border px-3 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
        <button
          type="submit"
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
        >
          Search
        </button>
      </form>

      {customers.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title={q ? "No customers match that search" : "No customers yet"}
            description={
              q
                ? "Try a different phone number."
                : "Customer accounts are created by the customer app when someone signs up."
            }
          />
        </Card>
      ) : (
        <Card>
          <Table>
            <Thead>
              {columns.map((c) => (
                <Th key={c}>{c.replace(/_/g, " ")}</Th>
              ))}
            </Thead>
            <Tbody>
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  {columns.map((col) => (
                    <Td key={col}>
                      {c[col] === null || c[col] === undefined || c[col] === ""
                        ? "—"
                        : typeof c[col] === "object"
                          ? JSON.stringify(c[col])
                          : String(c[col])}
                    </Td>
                  ))}
                </tr>
              ))}
            </Tbody>
          </Table>
        </Card>
      )}

      <FutureFeatureNotice reason="Per-customer booking history, lifetime value, and wallet balance need an admin-read path on the bookings table — bookings RLS is participant-only (salon or customer) with no admin bypass, unlike every other admin-facing table. A bookings_admin_read policy would unblock this and the global Bookings view together. See ADMIN_ANALYSIS.md §8-C." />
    </div>
  );
}
