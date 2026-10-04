import { Radar } from "lucide-react";
import { getAdminSalons, getSalonRanking } from "@/lib/api/admin";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Td } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function VisibilityPage() {
  let ranking;
  let salons;
  try {
    [ranking, salons] = await Promise.all([getSalonRanking(), getAdminSalons()]);
  } catch (e) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-danger">
            {e instanceof Error ? e.message : "Could not load the visibility ranking."}
          </p>
        </CardBody>
      </Card>
    );
  }

  if (ranking.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Radar}
          title="No ranked salons yet"
          description="Ranking is computed from plan, rating, acceptance/completion rate, recency, and cancellations once salons have booking history."
        />
      </Card>
    );
  }

  const salonById = new Map(salons.map((s) => [s.id, s]));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="What this ranks" />
        <CardBody className="text-sm text-muted">
          This is the same score (<code className="text-xs">salon_ranking()</code>) the customer
          app sorts search results by: plan boost + rating + acceptance rate + completion rate +
          recency − cancellation penalty, halved while offline, plus a flat +1000 while a paid
          boost is active. Recomputed nightly and on plan change — this is a read-only view of the
          live production ranking, not a separate scoring algorithm.
        </CardBody>
      </Card>

      <Card>
        <Table>
          <Thead>
            <Th>Rank</Th>
            <Th>Salon</Th>
            <Th>Score</Th>
            <Th>Boost</Th>
            <Th>Accepting bookings</Th>
            <Th>Bookings (30d)</Th>
          </Thead>
          <Tbody>
            {ranking.map((r, i) => {
              const salon = salonById.get(r.salon_id);
              return (
                <tr key={r.salon_id} className="hover:bg-slate-50">
                  <Td className="font-medium text-foreground">{i + 1}</Td>
                  <Td className="font-medium text-foreground">
                    {salon?.name ?? r.salon_id}
                  </Td>
                  <Td className="font-mono">{r.score}</Td>
                  <Td>
                    {r.boosted ? (
                      <Badge tone="gold">Boosted</Badge>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </Td>
                  <Td>
                    <Badge tone={salon?.accepting_bookings ? "success" : "neutral"}>
                      {salon?.accepting_bookings ? "Online" : "Offline"}
                    </Badge>
                  </Td>
                  <Td>{salon?.bookings_30d ?? "—"}</Td>
                </tr>
              );
            })}
          </Tbody>
        </Table>
      </Card>
    </div>
  );
}
