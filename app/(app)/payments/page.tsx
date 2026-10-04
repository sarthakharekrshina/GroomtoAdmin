import Link from "next/link";
import { CreditCard } from "lucide-react";
import { getAdminStatements } from "@/lib/api/admin";
import type { StatementStatus } from "@/types/admin";
import { Card } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Td } from "@/components/ui/Table";
import { StatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  ConfirmPaymentButtons,
  MarkPaidButton,
  ResolveDisputeButtons,
} from "@/components/payments/PaymentActions";
import { PaymentsNav } from "@/components/payments/PaymentsNav";

const TABS: { key: StatementStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "submitted", label: "Awaiting review" },
  { key: "overdue", label: "Overdue" },
  { key: "disputed", label: "Disputed" },
  { key: "paid", label: "Paid" },
];

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const activeTab = TABS.some((t) => t.key === status)
    ? (status as StatementStatus | "all")
    : "all";

  let statements;
  try {
    statements = await getAdminStatements(
      activeTab === "all" ? undefined : activeTab,
      100,
    );
  } catch (e) {
    return (
      <div className="space-y-4">
        <PaymentsNav active="/payments" />
        <Card>
          <div className="p-5">
            <p className="text-sm text-danger">
              {e instanceof Error ? e.message : "Could not load statements."}
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PaymentsNav active="/payments" />

      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "all" ? "/payments" : `/payments?status=${t.key}`}
            className={`border-b-2 px-4 py-2 text-sm font-medium ${
              activeTab === t.key
                ? "border-brand text-brand"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {statements.length === 0 ? (
        <Card>
          <EmptyState
            icon={CreditCard}
            title="No statements here"
            description="Nothing matches this filter right now."
          />
        </Card>
      ) : (
        <Card>
          <Table>
            <Thead>
              <Th>Salon</Th>
              <Th>Invoice</Th>
              <Th>Period</Th>
              <Th>Due</Th>
              <Th>Amount</Th>
              <Th>Direction</Th>
              <Th>Status</Th>
              <Th>Actions</Th>
            </Thead>
            <Tbody>
              {statements.map((s) => (
                <tr key={s.id}>
                  <Td className="font-medium text-foreground">
                    <Link
                      href={`/salons/${s.salon_id}`}
                      className="hover:text-brand hover:underline"
                    >
                      {s.salon_name ?? s.salon_id}
                    </Link>
                  </Td>
                  <Td>{s.invoice_no ?? "—"}</Td>
                  <Td>
                    {formatDate(s.period_start)} – {formatDate(s.period_end)}
                  </Td>
                  <Td>{formatDate(s.due_date)}</Td>
                  <Td>{formatCurrency(s.amount)}</Td>
                  <Td className="capitalize">{s.direction}</Td>
                  <Td>
                    <StatusBadge status={s.status} />
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1.5">
                      {s.payment_id && (
                        <ConfirmPaymentButtons paymentId={s.payment_id} />
                      )}
                      {!s.payment_id &&
                        (s.status === "pending" || s.status === "overdue") && (
                          <MarkPaidButton payoutId={s.id} />
                        )}
                      {s.dispute_id && (
                        <ResolveDisputeButtons disputeId={s.dispute_id} />
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </Tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
