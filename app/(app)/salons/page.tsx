import Link from "next/link";
import { Store } from "lucide-react";
import { getAdminSalons } from "@/lib/api/admin";
import { Card, CardBody } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Td } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCurrency } from "@/lib/utils";

const BANK_STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  verified: "success",
  pending: "warning",
  failed: "danger",
  unverified: "neutral",
};

export default async function SalonsPage() {
  let salons;
  try {
    salons = await getAdminSalons();
  } catch (e) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-danger">
            {e instanceof Error ? e.message : "Could not load salons."}
          </p>
        </CardBody>
      </Card>
    );
  }

  if (salons.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Store}
          title="No salons yet"
          description="Salons will show up here once partners onboard."
        />
      </Card>
    );
  }

  return (
    <Card>
      <Table>
        <Thead>
          <Th>Salon</Th>
          <Th>Owner</Th>
          <Th>Phone</Th>
          <Th>Commission</Th>
          <Th>Bank status</Th>
          <Th>Accepting bookings</Th>
          <Th>Outstanding</Th>
          <Th>Bookings (30d)</Th>
        </Thead>
        <Tbody>
          {salons.map((s) => (
            <tr key={s.id} className="hover:bg-slate-50">
              <Td className="font-medium text-foreground">
                <Link href={`/salons/${s.id}`} className="hover:text-brand hover:underline">
                  {s.name}
                </Link>
              </Td>
              <Td>{s.owner_name ?? "—"}</Td>
              <Td>{s.phone ?? "—"}</Td>
              <Td>{s.commission_rate != null ? `${s.commission_rate}%` : "—"}</Td>
              <Td>
                <Badge tone={BANK_STATUS_TONE[s.bank_status ?? ""] ?? "neutral"}>
                  {s.bank_status ?? "unverified"}
                </Badge>
              </Td>
              <Td>
                <Badge tone={s.accepting_bookings ? "success" : "neutral"}>
                  {s.accepting_bookings ? "Online" : "Offline"}
                </Badge>
              </Td>
              <Td>{formatCurrency(s.outstanding)}</Td>
              <Td>{s.bookings_30d}</Td>
            </tr>
          ))}
        </Tbody>
      </Table>
    </Card>
  );
}
