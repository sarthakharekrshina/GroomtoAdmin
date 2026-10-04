import Link from "next/link";
import { Crown } from "lucide-react";
import { getAdminSalons } from "@/lib/api/admin";
import { getAllSubscriptions, getSubscriptionPlans } from "@/lib/api/subscriptions";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Td } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { EmptyState, FutureFeatureNotice } from "@/components/ui/EmptyState";
import { StatCard } from "@/components/ui/StatCard";
import { formatCurrency, formatDate } from "@/lib/utils";

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  active: "success",
  pending: "warning",
  expired: "neutral",
  cancelled: "danger",
};

export default async function SubscriptionsPage() {
  let salons, subscriptions, plans;
  try {
    [salons, subscriptions, plans] = await Promise.all([
      getAdminSalons(),
      getAllSubscriptions(),
      getSubscriptionPlans(),
    ]);
  } catch (e) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-danger">
            {e instanceof Error ? e.message : "Could not load subscriptions."}
          </p>
        </CardBody>
      </Card>
    );
  }

  if (salons.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Crown}
          title="No salons yet"
          description="Salons will show up here once partners onboard."
        />
      </Card>
    );
  }

  const planByCode = new Map(plans.map((p) => [p.code, p]));
  const freePlan = planByCode.get("free");

  const activeBySalon = new Map<string, (typeof subscriptions)[number]>();
  for (const sub of subscriptions) {
    if (sub.status === "active" && !activeBySalon.has(sub.salon_id)) {
      activeBySalon.set(sub.salon_id, sub);
    }
  }

  const counts = new Map<string, number>();
  for (const salon of salons) {
    const code = activeBySalon.get(salon.id)?.plan_code ?? "free";
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {plans.map((p) => (
          <StatCard
            key={p.code}
            label={p.name}
            value={counts.get(p.code) ?? 0}
            hint={p.price_monthly > 0 ? `${formatCurrency(p.price_monthly)}/mo` : "Free tier"}
            tone={p.code === "free" ? "default" : "success"}
          />
        ))}
      </div>

      <Card>
        <CardHeader title="Salons by plan" />
        <Table>
          <Thead>
            <Th>Salon</Th>
            <Th>Plan</Th>
            <Th>Status</Th>
            <Th>Started</Th>
            <Th>Expires</Th>
            <Th>Amount</Th>
            <Th>Comped</Th>
          </Thead>
          <Tbody>
            {salons.map((salon) => {
              const sub = activeBySalon.get(salon.id);
              const plan = planByCode.get(sub?.plan_code ?? "free") ?? freePlan;
              return (
                <tr key={salon.id} className="hover:bg-slate-50">
                  <Td className="font-medium text-foreground">
                    <Link
                      href={`/salons/${salon.id}?tab=subscription`}
                      className="hover:text-brand hover:underline"
                    >
                      {salon.name}
                    </Link>
                  </Td>
                  <Td>{plan?.name ?? sub?.plan_code ?? "Free"}</Td>
                  <Td>
                    <Badge tone={STATUS_TONE[sub?.status ?? "active"] ?? "neutral"}>
                      {sub?.status ?? "active"}
                    </Badge>
                  </Td>
                  <Td>{sub ? formatDate(sub.started_at) : "—"}</Td>
                  <Td>{sub?.expires_at ? formatDate(sub.expires_at) : "—"}</Td>
                  <Td>{sub ? formatCurrency(sub.amount) : "—"}</Td>
                  <Td>
                    {sub?.comped_by ? <Badge tone="gold">Comped</Badge> : "—"}
                  </Td>
                </tr>
              );
            })}
          </Tbody>
        </Table>
      </Card>

      <FutureFeatureNotice reason="Granting or changing a salon's plan from this app needs a new admin-gated wrapper RPC — activate_subscription() exists but is revoked from `authenticated` entirely (webhook/service-role only, see ADMIN_ANALYSIS.md §8-B). Referral funnel detail for an individual salon is on its Referrals tab." />
    </div>
  );
}
