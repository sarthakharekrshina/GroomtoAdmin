import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  getSalonProfile,
  getSalonServices,
  getSalonPlanState,
  getSalonSubscriptionHistory,
  getReferralProgress,
  getReferralList,
} from "@/lib/api/salons";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Table, Thead, Th, Tbody, Td } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { EmptyState, FutureFeatureNotice } from "@/components/ui/EmptyState";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import {
  CommissionForm,
  BankStatusForm,
} from "@/components/salons/SalonActions";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "services", label: "Services" },
  { key: "subscription", label: "Subscription" },
  { key: "referrals", label: "Referrals" },
  { key: "bookings", label: "Bookings" },
  { key: "reviews", label: "Reviews" },
] as const;

export default async function SalonDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const activeTab = TABS.some((t) => t.key === tab) ? tab! : "overview";

  let salon;
  try {
    salon = await getSalonProfile(id);
  } catch (e) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-danger">
            {e instanceof Error ? e.message : "Could not load this salon."}
          </p>
        </CardBody>
      </Card>
    );
  }

  if (!salon) {
    return (
      <Card>
        <EmptyState title="Salon not found" />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/salons"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Salons
        </Link>
        <h2 className="mt-2 text-xl font-semibold text-foreground">
          {String(salon.name ?? "Untitled salon")}
        </h2>
      </div>

      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/salons/${id}?tab=${t.key}`}
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

      {activeTab === "overview" && (
        <div className="space-y-4">
          <Card>
            <CardHeader title="Profile" />
            <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Owner" value={salon.owner_name} />
              <Field label="Phone" value={salon.phone} />
              <Field label="Address" value={salon.address} />
              <Field label="PAN" value={salon.pan_number} />
              <Field label="GST" value={salon.gst_number} />
              <Field label="Accepting bookings" value={salon.accepting_bookings} />
              <Field label="Visibility score" value={salon.visibility_score} />
              <Field label="Working hours" value={salon.working_hours} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Commission" />
            <CardBody>
              <CommissionForm
                salonId={id}
                currentRate={
                  typeof salon.commission_rate === "number"
                    ? salon.commission_rate
                    : null
                }
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Bank verification" />
            <CardBody className="space-y-3">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="Account holder" value={salon.bank_holder} />
                <Field label="Account number" value={salon.bank_account} />
                <Field label="IFSC" value={salon.bank_ifsc} />
              </div>
              <BankStatusForm
                salonId={id}
                currentStatus={
                  typeof salon.bank_status === "string" ? salon.bank_status : null
                }
              />
            </CardBody>
          </Card>

          <FutureFeatureNotice reason="Approve / suspend / reactivate this salon needs a new admin_set_salon_status() RPC and a salons.status column — the operational meaning of 'suspended' (stop accepting bookings? hide from visibility engine?) needs a product decision first. See ADMIN_ANALYSIS.md §8-C." />
        </div>
      )}

      {activeTab === "services" && <ServicesTab salonId={id} />}

      {activeTab === "subscription" && <SubscriptionTab salonId={id} />}

      {activeTab === "referrals" && <ReferralsTab salonId={id} />}

      {activeTab === "bookings" && (
        <Card>
          <CardBody>
            <FutureFeatureNotice reason="No admin-read policy exists on the bookings table yet — every other admin-facing table (transactions, payouts, users) already has one. Proposed: admin_bookings() RPC or a bookings_admin_read RLS policy mirroring the existing pattern." />
          </CardBody>
        </Card>
      )}

      {activeTab === "reviews" && (
        <Card>
          <CardBody>
            <FutureFeatureNotice reason="No reviews table exists in this codebase — it's owned by the (unavailable) customer app. Cannot build this without that schema." />
          </CardBody>
        </Card>
      )}
    </div>
  );
}

async function SubscriptionTab({ salonId }: { salonId: string }) {
  let planState, history;
  try {
    [planState, history] = await Promise.all([
      getSalonPlanState(salonId),
      getSalonSubscriptionHistory(salonId),
    ]);
  } catch (e) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-danger">
            {e instanceof Error ? e.message : "Could not load subscription data."}
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Current plan" />
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Plan" value={planState?.plan_name} />
          <Field label="Status" value={planState?.status} />
          <Field label="Expires" value={formatDate(planState?.expires_at)} />
          <Field
            label="Rank"
            value={
              planState?.rank_position
                ? `#${planState.rank_position} of ${planState.rank_total}`
                : null
            }
          />
          <Field label="Trial" value={planState?.is_trial} />
          <Field label="Trial used" value={planState?.trial_used} />
          <Field label="Boosts left" value={planState?.boosts_left} />
          <Field
            label="Boost active"
            value={planState?.boost_active ? `Until ${formatDateTime(planState.boost_ends)}` : false}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Subscription history" />
        {history.length === 0 ? (
          <EmptyState title="No subscription history" description="This salon has always been on the Free plan." />
        ) : (
          <Table>
            <Thead>
              <Th>Plan</Th>
              <Th>Status</Th>
              <Th>Interval</Th>
              <Th>Amount</Th>
              <Th>Started</Th>
              <Th>Expires</Th>
              <Th>Comped by</Th>
              <Th>Note</Th>
            </Thead>
            <Tbody>
              {history.map((s) => (
                <tr key={s.id}>
                  <Td className="font-medium text-foreground">{s.plan_code}</Td>
                  <Td>
                    <Badge
                      tone={
                        s.status === "active"
                          ? "success"
                          : s.status === "cancelled"
                            ? "danger"
                            : "neutral"
                      }
                    >
                      {s.status}
                    </Badge>
                  </Td>
                  <Td>{s.interval}</Td>
                  <Td>{formatCurrency(s.amount)}</Td>
                  <Td>{formatDate(s.started_at)}</Td>
                  <Td>{s.expires_at ? formatDate(s.expires_at) : "—"}</Td>
                  <Td className="font-mono text-xs text-muted">{s.comped_by ?? "—"}</Td>
                  <Td className="max-w-xs truncate">{s.note ?? "—"}</Td>
                </tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

async function ReferralsTab({ salonId }: { salonId: string }) {
  let progress, referred;
  try {
    [progress, referred] = await Promise.all([
      getReferralProgress(salonId),
      getReferralList(salonId),
    ]);
  } catch (e) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-danger">
            {e instanceof Error ? e.message : "Could not load referral data."}
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Referral funnel" />
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Referral code" value={progress?.code} />
          <Field label="Invited" value={progress?.invited} />
          <Field label="Qualified" value={progress?.qualified} />
          <Field
            label="Progress to reward"
            value={progress ? `${progress.progress} / ${progress.goal}` : null}
          />
          <Field label="Rewards earned" value={progress?.rewards_earned} />
          <Field
            label="Reward"
            value={
              progress?.reward_name
                ? `${progress.reward_months} mo ${progress.reward_name}`
                : null
            }
          />
          <Field label="Can redeem now" value={progress?.can_redeem} />
          <Field label="Referred by" value={progress?.referred_by} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Salons referred" />
        {referred.length === 0 ? (
          <EmptyState title="No referrals yet" description="Salons this partner has referred will show up here." />
        ) : (
          <Table>
            <Thead>
              <Th>Salon</Th>
              <Th>City</Th>
              <Th>Joined</Th>
              <Th>Qualified</Th>
            </Thead>
            <Tbody>
              {referred.map((r, i) => (
                <tr key={i}>
                  <Td className="font-medium text-foreground">{r.name}</Td>
                  <Td>{r.city ?? "—"}</Td>
                  <Td>{formatDate(r.joined_at)}</Td>
                  <Td>
                    <Badge tone={r.qualified ? "success" : "neutral"}>
                      {r.qualified ? "Qualified" : "Not yet"}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

async function ServicesTab({ salonId }: { salonId: string }) {
  let services;
  try {
    services = await getSalonServices(salonId);
  } catch (e) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-danger">
            {e instanceof Error ? e.message : "Could not load services."}
          </p>
        </CardBody>
      </Card>
    );
  }

  if (services.length === 0) {
    return (
      <Card>
        <EmptyState title="No services listed" description="This salon hasn't added any services yet." />
      </Card>
    );
  }

  const columns = Array.from(
    new Set(services.flatMap((s) => Object.keys(s))),
  ).filter((c) => !["id", "salon_id"].includes(c));

  return (
    <Card>
      <Table>
        <Thead>
          {columns.map((c) => (
            <Th key={c}>{c}</Th>
          ))}
        </Thead>
        <Tbody>
          {services.map((s) => (
            <tr key={s.id}>
              {columns.map((c) => (
                <Td key={c}>{String(s[c] ?? "—")}</Td>
              ))}
            </tr>
          ))}
        </Tbody>
      </Table>
    </Card>
  );
}
