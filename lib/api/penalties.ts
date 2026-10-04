import { createClient } from "@/lib/supabase/server";
import type { ProviderPenalty } from "@/types/admin";

/**
 * `provider_penalties` has an admin-read RLS policy already
 * ("penalties_admin_read" in supabase/admin_role.sql:105-107 —
 * `using (is_platform_admin())`), so a plain table select returns penalties
 * across every salon for an admin caller. No RPC needed for the read; the
 * waive *write* goes through admin_waive_penalty() (see app/actions/admin.ts),
 * which audits and notifies the salon.
 *
 * Columns are taken from the insert in supabase/cancellation_penalties.sql:42
 * plus the appeal columns added in supabase/partner_standards.sql:70-72.
 */

export async function getPenalties(
  status?: string,
): Promise<ProviderPenalty[]> {
  const supabase = await createClient();
  let query = supabase
    .from("provider_penalties")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}
