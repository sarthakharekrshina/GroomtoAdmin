import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/api/paginate";
import type { ReviewRow } from "@/types/admin";

/**
 * `reviews` — written by the Customer App (one row per booking, upserted on
 * booking_id, review_service.dart); a DB trigger keeps salons.rating_avg /
 * rating_count in sync. The table and its RLS exist only in the live DB (no
 * SQL in either repo). The Customer App reads every review of a salon, so
 * reads are open to signed-in users; these functions only ever READ.
 */

export interface ReviewFilters {
  salonId?: string;
  rating?: number;
  q?: string;
  customerId?: string;
  limit?: number;
}

export async function getReviews(f: ReviewFilters = {}): Promise<ReviewRow[]> {
  const supabase = await createClient();
  let query = supabase.from("reviews").select("*");
  if (f.salonId) query = query.eq("salon_id", f.salonId);
  if (f.customerId) query = query.eq("customer_id", f.customerId);
  if (f.rating && f.rating >= 1 && f.rating <= 5) query = query.eq("rating", f.rating);
  // Drop LIKE wildcards and backslashes so the term is matched literally.
  const term = (f.q ?? "").replace(/[%_\\]/g, "").trim().slice(0, 80);
  if (term) query = query.ilike("comment", `%${term}%`);
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(f.limit ?? 200);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export interface ReviewStats {
  total: number;
  average: number | null;
  /** Count of 1★ … 5★ reviews, index 0 = 1★. */
  distribution: number[];
  /** salon_id → { count, average } computed from the reviews themselves. */
  bySalon: Map<string, { count: number; average: number }>;
}

export async function getReviewStats(): Promise<ReviewStats> {
  const supabase = await createClient();
  const rows = await fetchAllRows<{ salon_id: string | null; rating: number | null }>(
    (from, to) =>
      supabase.from("reviews").select("salon_id, rating").order("id").range(from, to),
  );

  const distribution = [0, 0, 0, 0, 0];
  const sums = new Map<string, { count: number; sum: number }>();
  let sum = 0;
  let rated = 0;
  for (const r of rows) {
    const rating = Number(r.rating);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) continue;
    distribution[Math.round(rating) - 1] += 1;
    sum += rating;
    rated += 1;
    if (r.salon_id) {
      const s = sums.get(r.salon_id) ?? { count: 0, sum: 0 };
      s.count += 1;
      s.sum += rating;
      sums.set(r.salon_id, s);
    }
  }

  const bySalon = new Map<string, { count: number; average: number }>();
  for (const [id, s] of sums) bySalon.set(id, { count: s.count, average: s.sum / s.count });

  return {
    total: rows.length,
    average: rated ? sum / rated : null,
    distribution,
    bySalon,
  };
}
