import { createClient } from "@/lib/supabase/server";
import type { SalonSubscription, SubscriptionPlan } from "@/types/admin";

/**
 * `salon_subscriptions` RLS ("subs_own_read" in supabase/subscription_plans.sql)
 * is `salon_id = auth.uid() or is_platform_admin()` — for an admin caller the
 * `or` makes every row visible, so a plain table select returns subscriptions
 * across all salons in one query. `subscription_plans` is world-readable to
 * any authenticated user. Neither needs an RPC.
 *
 * There is no comp-grant write path here on purpose: `activate_subscription()`
 * is revoked from `authenticated` entirely (see ADMIN_ANALYSIS.md §8-B) — it's
 * only callable from the Razorpay webhook/Edge Function with service-role
 * access. Granting a plan from this app would need a new admin-gated wrapper
 * RPC on the backend; don't fake it with a direct table write.
 */

export async function getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subscription_plans")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getAllSubscriptions(): Promise<SalonSubscription[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("salon_subscriptions")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}
