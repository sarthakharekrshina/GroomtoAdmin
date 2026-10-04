import Link from "next/link";
import { Table, Thead, Th, Tbody, Td } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { formatRupees, parseNumber } from "@/lib/customer-app/rules";
import { formatDateTime } from "@/lib/utils";
import type { AdminBookingRow } from "@/types/admin";

/** Booking status → badge tone, covering both apps' status values. */
const STATUS_TONE: Record<string, "warning" | "brand" | "gold" | "success" | "neutral" | "danger"> = {
  pending_approval: "warning",
  new: "warning",
  suggested: "brand",
  confirmed: "brand",
  upcoming: "brand",
  in_progress: "gold",
  completed: "success",
  cancelled: "neutral",
  rejected: "danger",
  expired: "neutral",
};

export function statusLabel(status: string | null | undefined): string {
  const s = (status ?? "unknown").replace(/-/g, "_");
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const key = (status ?? "").replace(/-/g, "_");
  return <Badge tone={STATUS_TONE[key] ?? "neutral"}>{statusLabel(status)}</Badge>;
}

function str(v: unknown): string | null {
  return v === null || v === undefined || v === "" ? null : String(v);
}

/** Booking.fromMap: service names from the `services` JSON, else the `service` text. */
function servicesText(b: AdminBookingRow): string {
  const raw = b.services;
  if (Array.isArray(raw)) {
    const names = raw
      .map((s) => (s && typeof s === "object" ? (s as { name?: unknown }).name : s))
      .filter((n) => typeof n === "string" && n.trim())
      .map(String);
    if (names.length) return names.join(", ");
  }
  return str(b.service) ?? str(b.service_name) ?? "—";
}

/** Booking.fromMap: total_price, else price. */
function amount(b: AdminBookingRow): number | null {
  return parseNumber(b.total_price) ?? parseNumber(b.price);
}

/** Fields worth showing in the expandable details, if the row has them. */
const DETAIL_FIELDS: [string, string][] = [
  ["customer_phone", "Customer phone"],
  ["preferred_time", "Requested time"],
  ["start_time", "Start time"],
  ["end_time", "End time"],
  ["payment_method", "Payment method"],
  ["payment_status", "Payment status"],
  ["paid_amount", "Paid"],
  ["promo_code", "Promo code"],
  ["discount_amount", "Discount"],
  ["points_redeemed", "Points redeemed"],
  ["cancelled_by", "Cancelled by"],
  ["cancellation_reason", "Cancellation reason"],
  ["rejection_reason", "Rejection reason"],
  ["notes", "Customer notes"],
  ["expires_at", "Request expires"],
  ["accepted_at", "Accepted"],
  ["auto_closed_at", "Auto-closed"],
  ["updated_at", "Last updated"],
];

export function BookingsTable({
  rows,
  showCustomer = true,
  showSalon = true,
}: {
  rows: AdminBookingRow[];
  showCustomer?: boolean;
  showSalon?: boolean;
}) {
  return (
    <Table>
      <Thead>
        <Th>Booking for</Th>
        {showCustomer && <Th>Customer</Th>}
        {showSalon && <Th>Salon</Th>}
        <Th>Services</Th>
        <Th>Amount</Th>
        <Th>Status</Th>
        <Th>Details</Th>
      </Thead>
      <Tbody>
        {rows.map((b) => {
          const total = amount(b);
          const when = [str(b.booking_date) ?? str(b.date), str(b.start_time) ?? str(b.preferred_time)]
            .filter(Boolean)
            .join(" · ");
          const details = DETAIL_FIELDS.filter(([k]) => str(b[k]) !== null);
          return (
            <tr key={b.id} className="align-top hover:bg-slate-50">
              <Td>
                <p className="text-foreground">{when || "—"}</p>
                <p className="text-xs text-muted">Requested {formatDateTime(b.created_at)}</p>
              </Td>
              {showCustomer && (
                <Td>
                  {b.customer_id ? (
                    <Link href={`/user-app/customers/${b.customer_id}`} className="hover:text-brand hover:underline">
                      {str(b.customer_name) ?? "Customer"}
                    </Link>
                  ) : (
                    str(b.customer_name) ?? "—"
                  )}
                </Td>
              )}
              {showSalon && (
                <Td>
                  {b.salon_id ? (
                    <Link href={`/user-app/services/${b.salon_id}`} className="hover:text-brand hover:underline">
                      {b.salon_name ?? "Salon"}
                    </Link>
                  ) : (
                    "—"
                  )}
                </Td>
              )}
              <Td className="max-w-xs whitespace-normal">{servicesText(b)}</Td>
              <Td>{total !== null ? formatRupees(total) : "—"}</Td>
              <Td>
                <StatusBadge status={b.status} />
              </Td>
              <Td>
                {details.length === 0 ? (
                  <span className="text-xs text-muted">—</span>
                ) : (
                  <details>
                    <summary className="cursor-pointer text-xs font-medium text-brand">Show</summary>
                    <dl className="mt-2 space-y-1 text-xs">
                      {details.map(([k, label]) => (
                        <div key={k} className="flex gap-2">
                          <dt className="text-muted">{label}:</dt>
                          <dd className="whitespace-normal text-foreground">
                            {/(_at)$/.test(k) ? formatDateTime(String(b[k])) : String(b[k])}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                )}
              </Td>
            </tr>
          );
        })}
      </Tbody>
    </Table>
  );
}
