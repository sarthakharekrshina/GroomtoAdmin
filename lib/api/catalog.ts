import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/api/paginate";
import { toCustomerAppSalon } from "@/lib/customer-app/rules";
import type {
  CatalogSalon,
  CatalogService,
  CustomerAppSalon,
  MasterCategoryRow,
} from "@/types/admin";

/**
 * Customer App catalog — what a customer browses: each salon's service menu
 * and its rating. `salons` and `services` are world-readable by RLS
 * (supabase/rls_hardening.sql, "storefront"); `master_categories` is read by
 * every Customer App session too, though its policy exists only in the live
 * DB, not in either repo. So these are plain table reads. Writes go through
 * admin_set_service_price() /
 * admin_set_salon_rating() / admin_set_service_image() — see
 * supabase/proposed/admin_customer_app.sql.
 *
 * Column names are the ones the Partner app itself selects
 * (services_screen.dart: id, name, price, duration, category_id, variants)
 * and the visibility engine reads (salons.rating_avg / rating_count).
 *
 * Reads use select("*") — the same read the Customer App does — so a column
 * that doesn't exist in some environment (image_url, rating_override_*,
 * pincode…) comes back undefined instead of failing the whole query.
 */

/** Every salon, shaped exactly as the Customer App's Salon.fromMap reads it. */
export async function getCustomerAppSalons(): Promise<CustomerAppSalon[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("salons")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(toCustomerAppSalon);
}

export async function getCatalogSalon(id: string): Promise<CatalogSalon | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("salons")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function getSalonCatalog(id: string): Promise<CatalogService[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .select("*")
    .eq("salon_id", id)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Every service across every salon (paged — see fetchAllRows). */
export async function getAllServices(): Promise<CatalogService[]> {
  const supabase = await createClient();
  return fetchAllRows<CatalogService>((from, to) =>
    supabase.from("services").select("*").order("id").range(from, to),
  );
}

/**
 * In the order the database returns them — deliberately unsorted, the same
 * unordered select() the Customer App makes, because that order decides which
 * category a home tile picks (see matchHomeTile). Sort a copy for display.
 */
export async function getCategories(): Promise<MasterCategoryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("master_categories").select("*");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export function sortByName<T extends { name: string | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")));
}

/**
 * Category id → name. Non-fatal: if the catalog table isn't readable the
 * page still works, it just shows no category labels.
 */
export async function getCategoryNames(): Promise<Map<string, string>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("master_categories")
    .select("id, name");
  const names = new Map<string, string>();
  if (error) return names;
  for (const row of data ?? []) names.set(row.id, row.name);
  return names;
}

/**
 * Salon referral points (100 base + 1 per customer who signed up with the
 * salon's code, max 250) from groomto_top10() — the RPC the Customer App
 * itself ranks its home "Groomto Top 10" with. Granted to `authenticated`,
 * security definer, so an admin caller sees every salon.
 */
export async function getTop10Points(): Promise<Map<string, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("groomto_top10");
  if (error) throw new Error(error.message);
  const points = new Map<string, number>();
  for (const row of (data ?? []) as { salon_id: string; referral_points: number | string }[]) {
    points.set(row.salon_id, Number(row.referral_points));
  }
  return points;
}
