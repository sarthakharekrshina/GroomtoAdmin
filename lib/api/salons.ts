import { createClient } from "@/lib/supabase/server";
import type {
  ReferralProgress,
  ReferredSalon,
  SalonPlanState,
  SalonSubscription,
} from "@/types/admin";

/**
 * `salons` and `services` are world-readable by RLS (see
 * supabase/rls_hardening.sql — "salons/services world-readable SELECT +
 * owner-write"), so these are plain table reads, not RPCs. Returned as
 * loosely-typed records: exact column sets beyond the ones referenced in
 * reviewed SQL/Dart files were not independently confirmed, so we render
 * defensively rather than assume a schema we haven't verified.
 */

export type SalonProfile = Record<string, unknown> & { id: string };
export type ServiceRow = Record<string, unknown> & { id: string };

export async function getSalonProfile(id: string): Promise<SalonProfile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("salons")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function getSalonServices(id: string): Promise<ServiceRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .select("*")
    .eq("salon_id", id);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * `salon_plan_state()` (supabase/plans_visibility_upgrade.sql) has no caller
 * check in its body at all — it and the `salon_plan()` it wraps are missing
 * from the `assert_own_salon` fix in rpc_authorization_fix.sql despite that
 * file's own header comment listing `salon_plan_state()` as one of the
 * functions it protects. That's a Partner-app-side over-permission bug (any
 * authenticated partner can read any other salon's plan/rank), not something
 * to fix from this repo — but it does mean an admin caller works today
 * without needing the admin bypass this function never got. See
 * ADMIN_ANALYSIS.md §8-B.
 */
export async function getSalonPlanState(id: string): Promise<SalonPlanState | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("salon_plan_state", { p_salon: id });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return row ?? null;
}

/**
 * `salon_subscriptions` RLS bypasses to full visibility for
 * `is_platform_admin()`, so this plain filtered select is safe for admin use.
 */
export async function getSalonSubscriptionHistory(
  id: string,
): Promise<SalonSubscription[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("salon_subscriptions")
    .select("*")
    .eq("salon_id", id)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * `referral_progress()`/`referral_list()` are gated by `assert_own_salon()`,
 * confirmed to accept a platform admin as caller
 * (supabase/rpc_authorization_fix.sql:33). Safe to call for any salon.
 */
export async function getReferralProgress(
  id: string,
): Promise<ReferralProgress | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("referral_progress", { p_salon: id });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return row ?? null;
}

export async function getReferralList(id: string): Promise<ReferredSalon[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("referral_list", { p_salon: id });
  if (error) throw new Error(error.message);
  return data ?? [];
}
