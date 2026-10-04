import { createClient } from "@/lib/supabase/server";
import type { AdminBookingsResult } from "@/types/admin";

/**
 * Bookings, read through admin_bookings() — bookings RLS stays
 * participant-only, so no existing read or realtime stream changes.
 */
export interface BookingFilters {
  status?: string;
  salonId?: string;
  customerId?: string;
  from?: string;
  to?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function getAdminBookings(f: BookingFilters = {}): Promise<AdminBookingsResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_bookings", {
    p_status: f.status || null,
    p_salon: f.salonId || null,
    p_customer: f.customerId || null,
    p_from: f.from && DATE.test(f.from) ? f.from : null,
    p_to: f.to && DATE.test(f.to) ? f.to : null,
    p_search: f.search?.trim().slice(0, 60) || null,
    p_limit: f.limit ?? 50,
    p_offset: f.offset ?? 0,
  });
  if (error) throw new Error(error.message);
  const r = (data ?? {}) as Partial<AdminBookingsResult>;
  return {
    total: r.total ?? 0,
    status_counts: r.status_counts ?? {},
    completed_value: Number(r.completed_value ?? 0),
    rows: r.rows ?? [],
  };
}
