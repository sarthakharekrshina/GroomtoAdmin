import { getPlatformPaymentConfig } from "@/lib/api/admin";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PlatformSettingForm } from "@/components/settings/PlatformSettingForm";
import { CloseCyclesForm } from "@/components/settings/CloseCyclesForm";

export default async function SettingsPage() {
  const flags = await getPlatformPaymentConfig();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Platform payment flags (read-only here)" />
        <CardBody className="flex flex-wrap gap-3">
          {flags ? (
            <>
              <Badge tone={flags.commissionEnabled ? "success" : "neutral"}>
                Commission {flags.commissionEnabled ? "enabled" : "disabled"}
              </Badge>
              <Badge tone={flags.onlinePaymentEnabled ? "success" : "neutral"}>
                Online payments {flags.onlinePaymentEnabled ? "enabled" : "disabled"}
              </Badge>
              <Badge tone={flags.showBilling ? "success" : "neutral"}>
                Billing UI {flags.showBilling ? "shown" : "hidden"}
              </Badge>
            </>
          ) : (
            <p className="text-sm text-muted">Could not load platform flags.</p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Set a platform setting" />
        <CardBody>
          <PlatformSettingForm />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Settlement close" />
        <CardBody>
          <CloseCyclesForm />
        </CardBody>
      </Card>
    </div>
  );
}
