"use server";

import { revalidatePath } from "next/cache";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/app/actions/auth";

/**
 * User App (Customer App) admin mutations. Each calls one admin_* function
 * from supabase/proposed/phase2_admin_functions.sql — the database checks
 * is_platform_admin() and writes admin_audit itself, so nothing is
 * re-checked or re-logged here.
 */

const PHASE2_MISSING =
  "This needs supabase/proposed/phase2_admin_functions.sql to be run in Supabase first.";

function explain(error: { message: string; code?: string }): string {
  if (error.code === "PGRST202" || /could not find the function/i.test(error.message)) {
    return PHASE2_MISSING;
  }
  return error.message;
}

async function callRpc(
  fn: string,
  args: Record<string, unknown>,
  paths: string[],
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: explain(error) };
  for (const p of [...paths, "/audit-logs"]) revalidatePath(p);
  return { ok: true };
}

// ── Support inbox ───────────────────────────────────────────────────────────

export async function replySupport(
  kind: "customer" | "salon",
  partyId: string,
  message: string,
): Promise<ActionResult> {
  if (kind !== "customer" && kind !== "salon") return { ok: false, error: "Unknown inbox." };
  const text = message.trim();
  if (!text) return { ok: false, error: "Write a reply first." };
  return callRpc(
    "admin_support_reply",
    { p_kind: kind, p_party: partyId, p_message: text },
    [kind === "customer" ? "/user-app/support" : "/support"],
  );
}

// ── Referrals ───────────────────────────────────────────────────────────────

export async function cancelReferral(referralId: string, note?: string): Promise<ActionResult> {
  return callRpc(
    "admin_cancel_referral",
    { p_referral: referralId, p_note: note?.trim() || null },
    ["/user-app/referrals"],
  );
}

// ── Offers ──────────────────────────────────────────────────────────────────

export async function setOfferActive(
  offerId: string,
  active: boolean,
  note?: string,
): Promise<ActionResult> {
  const result = await callRpc(
    "admin_set_offer_active",
    { p_offer: offerId, p_active: active, p_note: note?.trim() || null },
    ["/user-app/offers", "/user-app", "/user-app/discovery", "/user-app/services"],
  );
  revalidatePath("/user-app/services/[id]", "page");
  return result;
}

// ── Salon profile ───────────────────────────────────────────────────────────

const PROFILE_FIELDS = new Set([
  "name", "owner_name", "type", "description",
  "address_line1", "address_line2", "landmark", "city", "state", "pincode",
  "latitude", "longitude", "working_hours", "photos",
]);

export async function updateSalonProfile(
  salonId: string,
  changes: Record<string, unknown>,
): Promise<ActionResult> {
  const keys = Object.keys(changes ?? {});
  if (keys.length === 0) return { ok: false, error: "Nothing has changed." };
  if (keys.some((k) => !PROFILE_FIELDS.has(k))) {
    return { ok: false, error: "That field can't be changed from the admin panel." };
  }
  const result = await callRpc(
    "admin_update_salon_profile",
    { p_salon: salonId, p_changes: changes },
    ["/user-app/services", "/user-app/discovery", "/user-app", "/salons"],
  );
  revalidatePath("/user-app/services/[id]", "page");
  revalidatePath("/salons/[id]", "page");
  return result;
}

// ── Reviews ─────────────────────────────────────────────────────────────────

export async function moderateReview(
  reviewId: string,
  action: "clear_comment" | "delete",
  note?: string,
): Promise<ActionResult> {
  if (action !== "clear_comment" && action !== "delete") {
    return { ok: false, error: "Unknown action." };
  }
  const result = await callRpc(
    "admin_moderate_review",
    { p_review: reviewId, p_action: action, p_note: note?.trim() || null },
    ["/user-app/reviews", "/user-app", "/user-app/services", "/user-app/discovery"],
  );
  revalidatePath("/user-app/services/[id]", "page");
  revalidatePath("/user-app/customers/[id]", "page");
  return result;
}

// ── Push broadcast (Edge Function admin-broadcast-push) ────────────────────

export interface BroadcastInput {
  audience: "all" | "customer";
  customerId?: string;
  title?: string;
  body?: string;
}

export type BroadcastResult = ActionResult & {
  devices?: number;
  customers?: number;
  sent?: number;
  unregistered?: number;
  failed?: number;
};

async function invokeBroadcast(payload: Record<string, unknown>): Promise<BroadcastResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.functions.invoke("admin-broadcast-push", {
    body: payload,
  });
  if (error) {
    let detail: string | undefined;
    if (error instanceof FunctionsHttpError) {
      const res = error.context as Response | undefined;
      if (res?.status === 404) {
        detail = "Deploy the admin-broadcast-push Edge Function first (supabase/functions/admin-broadcast-push).";
      } else {
        try {
          detail = ((await res?.json()) as { error?: string } | undefined)?.error;
        } catch {
          detail = undefined;
        }
      }
    }
    return {
      ok: false,
      error:
        detail ??
        (/not found|failed to send a request/i.test(error.message)
          ? "Deploy the admin-broadcast-push Edge Function first (supabase/functions/admin-broadcast-push)."
          : error.message),
    };
  }
  return { ok: true, ...(data as object) };
}

export async function previewBroadcast(input: BroadcastInput): Promise<BroadcastResult> {
  return invokeBroadcast({
    audience: input.audience,
    customerId: input.customerId,
    dryRun: true,
  });
}

export async function sendBroadcast(input: BroadcastInput): Promise<BroadcastResult> {
  const result = await invokeBroadcast({
    audience: input.audience,
    customerId: input.customerId,
    title: input.title,
    body: input.body,
  });
  if (result.ok) revalidatePath("/audit-logs");
  return result;
}
