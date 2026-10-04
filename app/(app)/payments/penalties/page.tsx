import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { getPenalties } from "@/lib/api/penalties";
import { getAdminSalons } from "@/lib/api/admin";
import { Card } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Td } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PaymentsNav } from "@/components/payments/PaymentsNav";
import { WaivePenaltyButton } from "@/components/payments/PaymentActions";

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  pending: "warning",
  appealed: "danger",
  waived: "success",
  charged: "neutral",
  collected: "neutral",
};

const TABS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "appealed", label: "Appealed" },
  { key: "waived", label: "Waived" },
];

export default async function PenaltiesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const activeTab = TABS.some((t) => t.key === status) ? status! : "all";

  let penalties, salons;
  try {
    [penalties, salons] = await Promise.all([
      getPenalties(activeTab === "all" ? undefined : activeTab),
      getAdminSalons(),
    ]);
  } catch (e) {
    return (
      <div className="space-y-4">
        <PaymentsNav active="/payments/penalties" />
        <Card>
          <div className="p-5">
            <p className="text-sm text-danger">
              {e instanceof Error ? e.message : "Could not load penalties."}
            </p>
          </div>
        </Card>
      </div>
    );
  }

  const salonById = new Map(salons.map((s) => [s.id, s]));

  return (
    <div className="space-y-4">
      <PaymentsNav active="/payments/penalties" />

      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={
              t.key === "all"
                ? "/payments/penalties"
                : `/payments/penalties?status=${t.key}`
            }
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

      {penalties.length === 0 ? (
        <Card>
          <EmptyState
            icon={ShieldAlert}
            title="No penalties here"
            description="Cancellation fees are charged automatically when a salon cancels a confirmed booking for a reason other than a customer no-show or customer request."
          />
        </Card>
      ) : (
        <Card>
          <Table>
            <Thead>
              <Th>Salon</Th>
              <Th>Amount</Th>
              <Th>Reason</Th>
              <Th>Status</Th>
              <Th>Charged</Th>
              <Th>Appeal</Th>
              <Th>Resolved</Th>
              <Th>Actions</Th>
            </Thead>
            <Tbody>
              {penalties.map((p) => {
                const salon = salonById.get(p.provider_id);
                return (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <Td className="font-medium text-foreground">
                      <Link
                        href={`/salons/${p.provider_id}`}
                        className="hover:text-brand hover:underline"
                      >
                        {salon?.name ?? p.provider_id}
                      </Link>
                    </Td>
                    <Td>{formatCurrency(p.amount)}</Td>
                    <Td className="max-w-xs truncate">
                      {p.reason?.replace(/_/g, " ") ?? "—"}
                    </Td>
                    <Td>
                      <Badge tone={STATUS_TONE[p.status] ?? "neutral"}>
                        {p.status}
                      </Badge>
                    </Td>
                    <Td>{formatDate(p.created_at)}</Td>
                    <Td className="max-w-xs truncate">
                      {p.appeal_reason ?? "—"}
                    </Td>
                    <Td>{p.resolved_at ? formatDate(p.resolved_at) : "—"}</Td>
                    <Td>
                      {p.status !== "waived" && (
                        <WaivePenaltyButton penaltyId={p.id} />
                      )}
                    </Td>
                  </tr>
                );
              })}
            </Tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
