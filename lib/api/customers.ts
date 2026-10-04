import { createClient } from "@/lib/supabase/server";

/**
 * `users` has an admin-read RLS policy already ("users_admin_read" in
 * supabase/admin_role.sql:110-112 — `using (is_platform_admin())`), so an
 * admin can select the table directly. ADMIN_ANALYSIS.md §8-C listed an
 * `admin_customers()` RPC as missing, but that RPC was only ever a convenience
 * wrapper for booking/wallet aggregates — the read *access* already exists, so
 * the list itself needs no backend work.
 *
 * The `users` table is not created in any migration in the reviewed repo (it
 * predates them), so the column set is not authoritatively known. Rows are
 * returned loosely typed and rendered defensively, the same approach
 * lib/api/salons.ts takes for `salons`/`services`.
 *
 * `roles` is a `user_role[]` enum array (customer | partner | admin) — a user
 * can hold several at once, so this filter is "has the customer role", not
 * "is only a customer".
 */

export type CustomerRow = Record<string, unknown> & { id: string };

export async function getCustomers(search?: string): Promise<CustomerRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("users")
    .select("*")
    .contains("roles", ["customer"])
    .limit(200);

  if (search) {
    // Only `phone` is a column this codebase confirms exists on `users`
    // (auth flow + admin_salons join). Searching a column that may not exist
    // would error the whole page, so the search stays on phone alone.
    query = query.ilike("phone", `%${search}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

// ── Customer App admin (User App section) ──────────────────────────────────

export const CUSTOMERS_PAGE_SIZE = 50;

/** Values the Customer App writes to users.gender (edit_profile_screen.dart). */
export const CUSTOMER_GENDERS = ["male", "female", "other"] as const;

/**
 * Columns `users` actually has in this environment, read off one row. The
 * Customer App treats some as optional — it drops `gender` from its writes
 * when the column is missing (user_provider.dart saveProfile) — so filters
 * are only offered for columns that exist; filtering on a missing column
 * would fail the whole query.
 */
export async function getUserColumns(): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("users").select("*").limit(1);
  if (error) throw new Error(error.message);
  return new Set(Object.keys(data?.[0] ?? {}));
}

/**
 * Keeps a search term to characters a name or phone number can contain, so it
 * can't break out of the PostgREST `or=(…)` filter it's placed in.
 */
function sanitizeSearch(q?: string): string {
  return (q ?? "")
    .replace(/[^\p{L}\p{N} +@._-]/gu, "")
    .trim()
    .slice(0, 60);
}

export interface CustomerSearch {
  q?: string;
  gender?: string;
  referred?: string;
  points?: string;
  page?: number;
}

export async function searchCustomers(
  f: CustomerSearch,
  columns: Set<string>,
): Promise<{ rows: CustomerRow[]; total: number }> {
  const supabase = await createClient();
  const page = Math.max(1, f.page ?? 1);
  const from = (page - 1) * CUSTOMERS_PAGE_SIZE;

  let query = supabase
    .from("users")
    .select("*", { count: "exact" })
    .contains("roles", ["customer"]);

  const term = sanitizeSearch(f.q);
  if (term) {
    query = columns.has("full_name")
      ? query.or(`phone.ilike."%${term}%",full_name.ilike."%${term}%"`)
      : query.ilike("phone", `%${term}%`);
  }
  if (
    f.gender &&
    columns.has("gender") &&
    (CUSTOMER_GENDERS as readonly string[]).includes(f.gender)
  ) {
    query = query.eq("gender", f.gender);
  }
  if (f.referred === "salon" && columns.has("referred_by_salon")) {
    query = query.not("referred_by_salon", "is", null);
  }
  if (f.points === "yes" && columns.has("referral_points")) {
    query = query.gt("referral_points", 0);
  }

  const { data, error, count } = await query
    .order(columns.has("created_at") ? "created_at" : "id", { ascending: false })
    .range(from, from + CUSTOMERS_PAGE_SIZE - 1);
  if (error) throw new Error(error.message);
  return { rows: data ?? [], total: count ?? 0 };
}

export async function getCustomer(id: string): Promise<CustomerRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Number of users with the customer role, optionally signed up in the last N days. */
export async function countCustomers(sinceDays?: number): Promise<number> {
  const supabase = await createClient();
  let query = supabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .contains("roles", ["customer"]);
  if (sinceDays) {
    query = query.gte(
      "created_at",
      new Date(Date.now() - sinceDays * 86_400_000).toISOString(),
    );
  }
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function getLatestCustomers(limit = 5): Promise<CustomerRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .contains("roles", ["customer"])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Customers holding user→user referral points (users.referral_points, added
 * by the Customer App's 20260927000000_user_referrals.sql), most first.
 */
export async function getReferralLeaderboard(limit = 50): Promise<CustomerRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .gt("referral_points", 0)
    .order("referral_points", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** How many users have a non-null value in `column` (e.g. referred_by_salon). */
export async function countUsersWhereSet(column: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .not(column, "is", null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Users holding at least `min` user→user referral points. */
export async function countReferralHolders(min = 1): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .gte("referral_points", min);
  if (error) throw new Error(error.message);
  return count ?? 0;
}
