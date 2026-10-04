"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/app/actions/auth";
import type { ServiceVariant } from "@/types/admin";

async function callAdminRpc(
  fn: string,
  args: Record<string, unknown>,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/payments");
  revalidatePath("/audit-logs");
  revalidatePath("/");
  return { ok: true };
}

export async function confirmPayment(
  paymentId: string,
  confirm: boolean,
  note?: string,
) {
  return callAdminRpc("admin_confirm_payment", {
    p_payment: paymentId,
    p_confirm: confirm,
    p_note: note ?? null,
  });
}

export async function markPaid(payoutId: string, reference?: string) {
  return callAdminRpc("admin_mark_paid", {
    p_payout: payoutId,
    p_reference: reference ?? null,
  });
}

export async function resolveDispute(
  disputeId: string,
  uphold: boolean,
  resolution?: string,
  credit?: number,
) {
  return callAdminRpc("admin_resolve_dispute", {
    p_dispute: disputeId,
    p_uphold: uphold,
    p_resolution: resolution ?? null,
    p_credit: credit ?? 0,
  });
}

export async function waivePenalty(penaltyId: string, note?: string) {
  const result = await callAdminRpc("admin_waive_penalty", {
    p_penalty: penaltyId,
    p_note: note ?? null,
  });
  // callAdminRpc revalidates "/payments"; that is an exact-path revalidation
  // and does not cover the nested penalties route.
  revalidatePath("/payments/penalties");
  return result;
}

export async function setCommission(salonId: string, rate: number) {
  const result = await callAdminRpc("admin_set_commission", {
    p_salon: salonId,
    p_rate: rate,
  });
  revalidatePath("/salons");
  revalidatePath(`/salons/${salonId}`);
  return result;
}

export async function setBankStatus(
  salonId: string,
  status: string,
  holder?: string,
) {
  const result = await callAdminRpc("admin_set_bank_status", {
    p_salon: salonId,
    p_status: status,
    p_holder: holder ?? null,
  });
  revalidatePath(`/salons/${salonId}`);
  return result;
}

/**
 * Runs the weekly settlement close on demand — the same job pg_cron runs on a
 * schedule. Returns the number of statements created, which the RPC gives back
 * as an int; callAdminRpc discards return values, so this one calls directly.
 */
export async function closeCycles(
  start?: string,
  end?: string,
): Promise<ActionResult & { count?: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_close_cycles", {
    p_start: start || null,
    p_end: end || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/payments");
  revalidatePath("/audit-logs");
  revalidatePath("/");
  return { ok: true, count: typeof data === "number" ? data : undefined };
}

export async function setPlatformSetting(key: string, value: string) {
  const result = await callAdminRpc("admin_set_setting", {
    p_key: key,
    p_value: value,
  });
  revalidatePath("/settings");
  return result;
}

/**
 * Customer App catalog edits. Both RPCs come from
 * supabase/proposed/admin_customer_app.sql — until that's applied in Supabase
 * these return "Could not find the function ..." and nothing is written.
 */
export async function setServicePrice(
  serviceId: string,
  salonId: string,
  price: string,
  variants?: ServiceVariant[] | null,
) {
  const result = await callAdminRpc("admin_set_service_price", {
    p_service: serviceId,
    p_price: price,
    p_variants: variants ?? null,
  });
  revalidatePath(`/user-app/services/${salonId}`);
  return result;
}

export async function setSalonRating(
  salonId: string,
  avg: number,
  count?: number | null,
) {
  const result = await callAdminRpc("admin_set_salon_rating", {
    p_salon: salonId,
    p_avg: avg,
    p_count: count ?? null,
  });
  revalidatePath("/user-app/services");
  revalidatePath(`/user-app/services/${salonId}`);
  revalidatePath("/visibility");
  return result;
}

export async function clearSalonRating(salonId: string) {
  const result = await callAdminRpc("admin_clear_salon_rating", {
    p_salon: salonId,
  });
  revalidatePath("/user-app/services");
  revalidatePath(`/user-app/services/${salonId}`);
  revalidatePath("/visibility");
  return result;
}

const SERVICE_IMAGE_BUCKET = "service-images";
const SERVICE_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const SERVICE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Uploads with the admin's own session — the bucket's storage policies check
 * is_platform_admin(), so no service-role key is involved. If recording the
 * URL fails, the just-uploaded file is removed so storage doesn't collect
 * orphans. Previous pictures are kept: admin_audit points at them.
 */
export async function uploadServiceImage(
  formData: FormData,
): Promise<ActionResult> {
  const serviceId = formData.get("serviceId");
  const salonId = formData.get("salonId");
  const file = formData.get("file");
  if (typeof serviceId !== "string" || typeof salonId !== "string") {
    return { ok: false, error: "Missing service." };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a picture first." };
  }
  const ext = SERVICE_IMAGE_TYPES[file.type];
  if (!ext) return { ok: false, error: "Use a JPG, PNG or WebP picture." };
  if (file.size > SERVICE_IMAGE_MAX_BYTES) {
    return { ok: false, error: "Picture must be 5 MB or smaller." };
  }

  const supabase = await createClient();
  const path = `${salonId}/${serviceId}-${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from(SERVICE_IMAGE_BUCKET)
    .upload(path, file, { contentType: file.type });
  if (uploadError) return { ok: false, error: uploadError.message };

  const {
    data: { publicUrl },
  } = supabase.storage.from(SERVICE_IMAGE_BUCKET).getPublicUrl(path);

  const result = await callAdminRpc("admin_set_service_image", {
    p_service: serviceId,
    p_url: publicUrl,
  });
  if (!result.ok) {
    await supabase.storage.from(SERVICE_IMAGE_BUCKET).remove([path]);
  }
  revalidatePath(`/user-app/services/${salonId}`);
  return result;
}

export async function removeServiceImage(serviceId: string, salonId: string) {
  const result = await callAdminRpc("admin_set_service_image", {
    p_service: serviceId,
    p_url: null,
  });
  revalidatePath(`/user-app/services/${salonId}`);
  return result;
}
