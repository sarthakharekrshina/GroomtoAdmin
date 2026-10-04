import { createClient } from "@/lib/supabase/server";
import type { SupportMessage, SupportThread } from "@/types/admin";

/**
 * Shared support inbox (support_messages). Customer threads: customer_id set
 * (Customer App). Salon threads: salon_id set (Partner App). The table's RLS
 * is participant-only, so admins read through the admin_support_* functions
 * in supabase/proposed/phase2_admin_functions.sql.
 */
export type SupportKind = "customer" | "salon";

export async function getSupportThreads(kind: SupportKind): Promise<SupportThread[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_support_threads", { p_kind: kind });
  if (error) throw new Error(error.message);
  return (data ?? []) as SupportThread[];
}

export async function getSupportMessages(
  kind: SupportKind,
  partyId: string,
): Promise<SupportMessage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_support_messages", {
    p_kind: kind,
    p_party: partyId,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as SupportMessage[];
}
