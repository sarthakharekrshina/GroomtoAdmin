import { getCustomer } from "@/lib/api/customers";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { BroadcastForm } from "@/components/user-app/BroadcastForm";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function BroadcastPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>;
}) {
  const { customer } = await searchParams;
  const customerId = customer && UUID.test(customer) ? customer : undefined;

  let customerName: string | undefined;
  if (customerId) {
    try {
      const c = await getCustomer(customerId);
      customerName = c?.full_name ? String(c.full_name) : undefined;
    } catch {
      // Name is a nicety; the ID alone is enough to send.
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Push notification to Customer App users" />
        <CardBody>
          <BroadcastForm initialCustomerId={customerId} initialCustomerName={customerName} />
        </CardBody>
      </Card>
      <p className="text-xs text-muted">
        Sent by the admin-broadcast-push Edge Function (supabase/functions/admin-broadcast-push),
        which must be deployed once. It checks you&apos;re an admin, uses the same Firebase
        project as the existing booking pushes, never edits device tokens, and records every
        send in Audit Logs.
      </p>
    </div>
  );
}
