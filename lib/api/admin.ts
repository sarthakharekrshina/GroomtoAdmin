import { createClient } from "@/lib/supabase/server";
import type {
  AdminOverview,
  AdminSalon,
  AdminStatement,
  AuditLogEntry,
  SalonRanking,
  StatementStatus,
} from "@/types/admin";

/**
 * Every function here calls a SECURITY DEFINER Postgres RPC that itself
 * checks is_platform_admin() (see supabase/admin_operations.sql in the
 * Partner App repo). RLS/RPC is the real gate — this layer just keeps
 * Supabase calls out of page/component code, per the project's rule to
 * isolate API access in one place.
 */

export async function isPlatformAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_platform_admin");
  if (error) return false;
  return Boolean(data);
}

export async function getAdminOverview(): Promise<AdminOverview | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_overview");
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return row ?? null;
}

export async function getAdminSalons(): Promise<AdminSalon[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_salons");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getAdminStatements(
  status?: StatementStatus,
  limit = 50,
): Promise<AdminStatement[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_statements", {
    p_status: status ?? null,
    p_limit: limit,
  });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getAuditLog(limit = 100): Promise<AuditLogEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("admin_audit")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getSalonRanking(): Promise<SalonRanking[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("salon_ranking");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export interface PlatformFlags {
  commissionEnabled: boolean;
  onlinePaymentEnabled: boolean;
  showBilling: boolean;
}

export async function getPlatformPaymentConfig(): Promise<PlatformFlags | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_payment_config");
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    commissionEnabled: Boolean(row.commission_enabled ?? row.commissionEnabled),
    onlinePaymentEnabled: Boolean(
      row.online_payment_enabled ?? row.onlinePaymentEnabled,
    ),
    showBilling: Boolean(row.show_billing ?? row.showBilling),
  };
}
