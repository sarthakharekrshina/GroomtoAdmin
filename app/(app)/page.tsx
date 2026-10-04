import {
  Store,
  FileClock,
  AlertTriangle,
  Wallet,
  ClipboardCheck,
  Scale,
  ShieldAlert,
  TrendingUp,
  Percent,
} from "lucide-react";
import { getAdminOverview } from "@/lib/api/admin";
import { StatCard } from "@/components/ui/StatCard";
import { formatCurrency } from "@/lib/utils";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { FutureFeatureNotice } from "@/components/ui/EmptyState";

export default async function DashboardPage() {
  let overview;
  let loadError: string | null = null;
  try {
    overview = await getAdminOverview();
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load the dashboard.";
  }

  if (loadError) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-danger">{loadError}</p>
        </CardBody>
      </Card>
    );
  }

  const stats = [
    {
      label: "Total Salons",
      value: overview?.salons_total ?? 0,
      icon: Store,
      tone: "default" as const,
    },
    {
      label: "Statements Open",
      value: overview?.statements_open ?? 0,
      icon: FileClock,
      tone: "default" as const,
    },
    {
      label: "Statements Overdue",
      value: overview?.statements_overdue ?? 0,
      icon: AlertTriangle,
      tone: "danger" as const,
    },
    {
      label: "Amount Due",
      value: formatCurrency(overview?.amount_due),
      icon: Wallet,
      tone: "warning" as const,
    },
    {
      label: "Payments to Review",
      value: overview?.payments_to_review ?? 0,
      icon: ClipboardCheck,
      tone: "default" as const,
    },
    {
      label: "Disputes Open",
      value: overview?.disputes_open ?? 0,
      icon: Scale,
      tone: "warning" as const,
    },
    {
      label: "Penalties Pending",
      value: overview?.penalties_pending ?? 0,
      icon: ShieldAlert,
      tone: "warning" as const,
    },
    {
      label: "Gross (30d)",
      value: formatCurrency(overview?.gross_30d),
      icon: TrendingUp,
      tone: "success" as const,
    },
    {
      label: "Commission (30d)",
      value: formatCurrency(overview?.commission_30d),
      icon: Percent,
      tone: "success" as const,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      <Card>
        <CardHeader title="Roadmap: growth & trend analytics" />
        <CardBody>
          <FutureFeatureNotice reason="Daily/weekly booking & revenue trend charts, partner growth, customer growth, and top-salon/service rankings need a new admin_analytics() RPC — no trend data source exists in the backend yet. See ADMIN_ANALYSIS.md §8." />
        </CardBody>
      </Card>
    </div>
  );
}
