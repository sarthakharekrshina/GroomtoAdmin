import { ScrollText } from "lucide-react";
import { getAuditLog } from "@/lib/api/admin";
import { Card } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Td } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDateTime } from "@/lib/utils";

export default async function AuditLogsPage() {
  let entries;
  try {
    entries = await getAuditLog(200);
  } catch (e) {
    return (
      <Card>
        <div className="p-5">
          <p className="text-sm text-danger">
            {e instanceof Error ? e.message : "Could not load the audit log."}
          </p>
        </div>
      </Card>
    );
  }

  if (entries.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={ScrollText}
          title="No admin actions yet"
          description="Every admin action (payments, disputes, commission changes, settings) is logged here automatically."
        />
      </Card>
    );
  }

  return (
    <Card>
      <Table>
        <Thead>
          <Th>When</Th>
          <Th>Action</Th>
          <Th>Salon</Th>
          <Th>Target</Th>
          <Th>Detail</Th>
        </Thead>
        <Tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <Td className="whitespace-nowrap">{formatDateTime(e.created_at)}</Td>
              <Td className="font-medium text-foreground">
                {e.action.replace(/_/g, " ")}
              </Td>
              <Td className="font-mono text-xs text-muted">
                {e.salon_id ?? "—"}
              </Td>
              <Td className="font-mono text-xs text-muted">
                {e.target_id ?? "—"}
              </Td>
              <Td className="max-w-xs truncate font-mono text-xs text-muted">
                {e.detail ? JSON.stringify(e.detail) : "—"}
              </Td>
            </tr>
          ))}
        </Tbody>
      </Table>
    </Card>
  );
}
