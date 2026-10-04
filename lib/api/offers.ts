import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/api/paginate";
import type { OfferRow } from "@/types/admin";

/**
 * `offers` — created by salons in the Partner App and shown to customers by
 * the Customer App (offer_service.dart reads `active = true` and not ended).
 * The table's RLS exists only in the live DB, so whether inactive offers are
 * visible to an admin session isn't confirmable from source — the Offers page
 * says so. READ ONLY: there is no admin write path for offers.
 */
export async function getAllOffers(): Promise<OfferRow[]> {
  const supabase = await createClient();
  return fetchAllRows<OfferRow>((from, to) =>
    supabase.from("offers").select("*").order("id").range(from, to),
  );
}

export async function getSalonOffers(salonId: string): Promise<OfferRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("offers")
    .select("*")
    .eq("salon_id", salonId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}
