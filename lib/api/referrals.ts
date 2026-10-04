import { createClient } from "@/lib/supabase/server";
import type { AdminReferralsResult } from "@/types/admin";

/**
 * Individual referral records via admin_referrals() — the referrals table only
 * lets each customer read their own rows (referrals_select_own).
 */
export async function getReferralRecords(
  status?: string,
  limit = 100,
): Promise<AdminReferralsResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_referrals", {
    p_status: status || null,
    p_limit: limit,
    p_offset: 0,
  });
  if (error) throw new Error(error.message);
  const r = (data ?? {}) as Partial<AdminReferralsResult>;
  return { total: r.total ?? 0, status_counts: r.status_counts ?? {}, rows: r.rows ?? [] };
}
