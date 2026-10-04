import Link from "next/link";
import { Gift, Store, Users, Wallet } from "lucide-react";
import {
  countReferralHolders,
  countUsersWhereSet,
  getReferralLeaderboard,
} from "@/lib/api/customers";
import { getCustomerAppSalons, getTop10Points } from "@/lib/api/catalog";
import { REFERRAL_RULES } from "@/lib/customer-app/rules";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Td } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { getReferralRecords } from "@/lib/api/referrals";
import { CancelReferralButton } from "@/components/user-app/ModerationActions";
import { formatDate } from "@/lib/utils";

const RECORD_STATUSES = ["PENDING", "VERIFIED", "SUCCESSFUL", "CANCELLED"] as const;
const RECORD_TONE: Record<string, "neutral" | "brand" | "success" | "warning"> = {
  PENDING: "neutral",
  VERIFIED: "brand",
  SUCCESSFUL: "success",
  CANCELLED: "warning",
};

function value<T>(r: PromiseSettledResult<T>): T | null {
  return r.status === "fulfilled" ? r.value : null;
}

export default async function ReferralsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const recordStatus = RECORD_STATUSES.find((s) => s === status?.toUpperCase());
  const [holdersR, redeemableR, salonSignupsR, leaderboardR, salonsR, pointsR, recordsR] =
    await Promise.allSettled([
      countReferralHolders(1),
      countReferralHolders(REFERRAL_RULES.REDEEM_THRESHOLD),
      countUsersWhereSet("referred_by_salon"),
      getReferralLeaderboard(50),
      getCustomerAppSalons(),
      getTop10Points(),
      getReferralRecords(recordStatus),
    ]);

  const leaderboard = value(leaderboardR);
  const salons = value(salonsR) ?? [];
  const points = value(pointsR);

  const salonRows = salons
    .map((s) => {
      const p = points?.get(s.id) ?? null;
      return { salon: s, points: p, referred: p === null ? null : p - REFERRAL_RULES.SALON_POINTS_BASE };
    })
    .sort((a, b) => (b.points ?? 0) - (a.points ?? 0));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Customers with points" value={value(holdersR) ?? "—"} icon={Users} />
        <StatCard
          label={`Can redeem now (${REFERRAL_RULES.REDEEM_THRESHOLD}+ points)`}
          value={value(redeemableR) ?? "—"}
          icon={Wallet}
          tone="success"
        />
        <StatCard
          label="Signed up with a salon code"
          value={value(salonSignupsR) ?? "—"}
          icon={Store}
        />
        <StatCard
          label="Salons with code sign-ups"
          value={
            points
              ? Array.from(points.values()).filter((p) => p > REFERRAL_RULES.SALON_POINTS_BASE).length
              : "—"
          }
          icon={Gift}
          tone="warning"
        />
      </div>

      <Card>
        <CardHeader title="How the programme works (read-only)" />
        <CardBody>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-foreground">
            <li>
              <strong>Customer → customer:</strong> a new customer enters a friend&apos;s
              code at sign-up. When that customer&apos;s <em>first booking is completed</em>,
              the friend earns +{REFERRAL_RULES.POINTS_PER_REFERRAL} referral points.
            </li>
            <li>
              <strong>Redeeming:</strong> with {REFERRAL_RULES.REDEEM_THRESHOLD}+ points a
              customer gets ₹{REFERRAL_RULES.REDEEM_RUPEES} off one booking; the balance
              then resets to 0.
            </li>
            <li>
              <strong>Salon codes:</strong> every customer who signs up with a salon&apos;s
              code adds 1 to that salon&apos;s referral points (base {REFERRAL_RULES.SALON_POINTS_BASE},
              max {REFERRAL_RULES.SALON_POINTS_CAP}). These decide the home &ldquo;Groomto Top 10&rdquo;
              and feed the salon&apos;s visibility score. They never give the customer points.
            </li>
          </ul>
          <p className="mt-3 text-xs text-muted">
            These numbers are fixed inside the database functions (apply_user_referral,
            redeem_referral_points, salon_referral_points), so they can&apos;t be changed
            from here without a backend change.
          </p>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Top customer referrers" />
          {leaderboard === null ? (
            <CardBody>
              <p className="text-sm text-danger">Couldn&apos;t load referral points.</p>
            </CardBody>
          ) : leaderboard.length === 0 ? (
            <CardBody>
              <p className="text-sm text-muted">No customer has referral points yet.</p>
            </CardBody>
          ) : (
            <Table>
              <Thead>
                <Th>Customer</Th>
                <Th>Code</Th>
                <Th>Points</Th>
                <Th>{""}</Th>
              </Thead>
              <Tbody>
                {leaderboard.map((c) => {
                  const pts = Number(c.referral_points ?? 0);
                  return (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <Td>
                        <Link href={`/user-app/customers/${c.id}`} className="font-medium hover:text-brand hover:underline">
                          {String(c.full_name || "Unnamed customer")}
                        </Link>
                        <span className="block text-xs text-muted">{String(c.phone ?? "")}</span>
                      </Td>
                      <Td className="font-mono text-xs">{String(c.referral_code ?? "—")}</Td>
                      <Td>{pts}</Td>
                      <Td>
                        {pts >= REFERRAL_RULES.REDEEM_THRESHOLD && (
                          <Badge tone="success">Can redeem</Badge>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </Tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title="Salon referral points" />
          {points === null ? (
            <CardBody>
              <p className="text-sm text-danger">Couldn&apos;t load salon referral points.</p>
            </CardBody>
          ) : (
            <Table>
              <Thead>
                <Th>Salon</Th>
                <Th>Salon code</Th>
                <Th>Customers signed up</Th>
                <Th>Points</Th>
              </Thead>
              <Tbody>
                {salonRows.map(({ salon, points: p, referred }) => (
                  <tr key={salon.id} className="hover:bg-slate-50">
                    <Td>
                      <Link href={`/user-app/services/${salon.id}`} className="font-medium hover:text-brand hover:underline">
                        {salon.name}
                      </Link>
                    </Td>
                    <Td className="font-mono text-xs">{salon.referral_code ?? "—"}</Td>
                    <Td>
                      {referred === null
                        ? "—"
                        : p !== null && p >= REFERRAL_RULES.SALON_POINTS_CAP
                          ? `${referred}+ (cap reached)`
                          : referred}
                    </Td>
                    <Td>{p ?? "—"}</Td>
                  </tr>
                ))}
              </Tbody>
            </Table>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Referral records (customer → customer)" />
        <div className="flex flex-wrap gap-1.5 px-5 pt-3">
          <Link
            href="/user-app/referrals"
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              !recordStatus ? "bg-brand text-white" : "bg-slate-100 text-muted hover:text-foreground"
            }`}
          >
            All
          </Link>
          {RECORD_STATUSES.map((s) => (
            <Link
              key={s}
              href={`/user-app/referrals?status=${s.toLowerCase()}`}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                recordStatus === s ? "bg-brand text-white" : "bg-slate-100 text-muted hover:text-foreground"
              }`}
            >
              {s.charAt(0) + s.slice(1).toLowerCase()}
              {recordsR.status === "fulfilled" ? ` ${recordsR.value.status_counts[s] ?? 0}` : ""}
            </Link>
          ))}
        </div>
        {recordsR.status === "rejected" ? (
          <CardBody>
            <p className="text-sm text-muted">
              {/could not find the function/i.test(String(recordsR.reason?.message ?? ""))
                ? "Switch this on by running supabase/proposed/phase2_admin_functions.sql in Supabase."
                : String(recordsR.reason?.message ?? "Couldn't load referral records.")}
            </p>
          </CardBody>
        ) : recordsR.value.rows.length === 0 ? (
          <CardBody>
            <p className="text-sm text-muted">No referral records{recordStatus ? " with this status" : " yet"}.</p>
          </CardBody>
        ) : (
          <Table>
            <Thead>
              <Th>Referred customer</Th>
              <Th>Referred by</Th>
              <Th>Code</Th>
              <Th>Status</Th>
              <Th>Points paid</Th>
              <Th>Created</Th>
              <Th>{""}</Th>
            </Thead>
            <Tbody>
              {recordsR.value.rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/user-app/customers/${r.referred_user_id}`} className="font-medium hover:text-brand hover:underline">
                      {r.referred_name || "Unnamed customer"}
                    </Link>
                    <span className="block text-xs text-muted">{r.referred_phone ?? ""}</span>
                  </Td>
                  <Td>
                    {r.referrer_id ? (
                      <Link href={`/user-app/customers/${r.referrer_id}`} className="hover:text-brand hover:underline">
                        {r.referrer_name || "Unnamed customer"}
                      </Link>
                    ) : (
                      r.referrer_salon_name ?? "—"
                    )}
                  </Td>
                  <Td className="font-mono text-xs">{r.referral_code}</Td>
                  <Td>
                    <Badge tone={RECORD_TONE[r.status] ?? "neutral"}>
                      {r.status.charAt(0) + r.status.slice(1).toLowerCase()}
                    </Badge>
                  </Td>
                  <Td>{r.points_awarded}</Td>
                  <Td>{formatDate(r.created_at)}</Td>
                  <Td>
                    {(r.status === "PENDING" || r.status === "VERIFIED") && (
                      <CancelReferralButton
                        referralId={r.id}
                        summary={`${r.referrer_name || "A customer"} referred ${r.referred_name || "a customer"} (code ${r.referral_code}).`}
                      />
                    )}
                  </Td>
                </tr>
              ))}
            </Tbody>
          </Table>
        )}
        <p className="px-5 py-3 text-xs text-muted">
          Verified = code applied, waiting for the friend&apos;s first completed booking.
          Only pending or verified referrals can be cancelled; points already paid aren&apos;t reversed.
        </p>
      </Card>
    </div>
  );
}
