// Supabase Edge Function: admin push broadcast to Customer App devices.
//
// Called by the AdminPartner panel (server action `broadcastPush`) with the
// signed-in admin's JWT. Nothing else in either app calls it.
//
// Security
//   • Deploy WITH JWT verification (the default) — anonymous calls are
//     rejected by the gateway before this code runs.
//   • The caller must pass is_platform_admin(), checked with THEIR token, the
//     same gate every admin_* database function uses.
//   • The service-role key is used only inside this function (auto-provided by
//     Supabase); it never reaches the admin panel or a browser.
//
// What it touches
//   • READS device_tokens (written by the Customer App's push_service.dart).
//     Tokens are never modified or deleted here, even dead ones.
//   • WRITES one admin_audit row per real send.
//   • Sends through the SAME Firebase project and FIREBASE_SERVICE_ACCOUNT
//     secret as the Partner repo's send-booking-push (both apps are in Firebase
//     project groomto-7536c).
//
// How the Customer App shows it (no app change)
//   • Android channel `groomto_bookings` (NotificationService.channelId).
//   • data.category = 'announcement', no booking_id → a tap opens My Bookings
//     (notification_router.dart); in the foreground it only shows if the
//     customer has "booking updates" notifications switched on.
//
// Deploy (either):
//   • Supabase Dashboard → Edge Functions → Deploy a new function → name it
//     admin-broadcast-push → paste this file → Deploy.
//   • CLI: supabase functions deploy admin-broadcast-push --project-ref oepwnbtoruxhdjnkcazu

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

interface Body {
  title?: unknown;
  body?: unknown;
  audience?: unknown;
  customerId?: unknown;
  dryRun?: unknown;
}

const TITLE_MAX = 65;
const BODY_MAX = 240;
const SEND_CONCURRENCY = 25;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── Google OAuth token from the service account — same code as send-booking-push ──
function b64url(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const raw = atob(body);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return buf.buffer;
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${b64url(new Uint8Array(sig))}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const out = await res.json();
  if (!out.access_token) throw new Error("Firebase sign-in failed");
  return out.access_token;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    // 1. Who is calling — checked with the caller's own token.
    const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await caller.auth.getUser();
    const adminId = userData?.user?.id;
    const { data: isAdmin, error: adminErr } = await caller.rpc("is_platform_admin");
    if (!adminId || adminErr || isAdmin !== true) {
      return json({ error: "Not authorised" }, 403);
    }

    // 2. Validate the request.
    const input = (await req.json().catch(() => ({}))) as Body;
    const title = typeof input.title === "string" ? input.title.trim() : "";
    const body = typeof input.body === "string" ? input.body.trim() : "";
    const audience = input.audience === "customer" ? "customer" : input.audience === "all" ? "all" : null;
    const customerId = typeof input.customerId === "string" ? input.customerId.trim() : "";
    const dryRun = input.dryRun === true;

    if (!audience) return json({ error: "Choose who to send to" }, 400);
    if (audience === "customer" && !UUID.test(customerId)) {
      return json({ error: "Pick a valid customer" }, 400);
    }
    if (!dryRun) {
      if (!title || title.length > TITLE_MAX) return json({ error: `Title must be 1–${TITLE_MAX} characters` }, 400);
      if (!body || body.length > BODY_MAX) return json({ error: `Message must be 1–${BODY_MAX} characters` }, 400);
    }

    // 3. Recipients — Customer App device tokens only (salons use a separate
    //    salon_device_tokens table, which this never reads).
    const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const tokens = new Set<string>();
    const customers = new Set<string>();
    // Paged by rows actually returned, so a server row cap can't truncate it.
    for (let from = 0; from < 200_000; ) {
      let q = service
        .from("device_tokens")
        .select("token, customer_id")
        .not("customer_id", "is", null)
        .order("token")
        .range(from, from + 999);
      if (audience === "customer") q = q.eq("customer_id", customerId);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) break;
      for (const r of data) {
        if (r.token) tokens.add(r.token as string);
        if (r.customer_id) customers.add(r.customer_id as string);
      }
      from += data.length;
    }

    if (dryRun) {
      return json({ devices: tokens.size, customers: customers.size });
    }
    if (tokens.size === 0) {
      return json({ error: "No devices to send to — the customer(s) haven't enabled notifications" }, 400);
    }

    // 4. Send.
    const sa = JSON.parse(Deno.env.get("FIREBASE_SERVICE_ACCOUNT")!) as ServiceAccount;
    const accessToken = await getAccessToken(sa);
    const endpoint = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
    const list = [...tokens];
    let sent = 0;
    let unregistered = 0;
    let failed = 0;
    for (let i = 0; i < list.length; i += SEND_CONCURRENCY) {
      const batch = list.slice(i, i + SEND_CONCURRENCY);
      const results = await Promise.allSettled(batch.map((token) =>
        fetch(endpoint, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            message: {
              token,
              notification: { title, body },
              data: { category: "announcement" },
              android: {
                priority: "high",
                notification: { channel_id: "groomto_bookings" },
              },
            },
          }),
        })
      ));
      for (const r of results) {
        if (r.status === "fulfilled" && r.value.ok) sent++;
        else if (r.status === "fulfilled" && r.value.status === 404) unregistered++;
        else failed++;
      }
    }

    // 5. Audit — same table every admin_* function writes to.
    await service.from("admin_audit").insert({
      admin_id: adminId,
      action: "push_broadcast",
      target_id: audience === "customer" ? customerId : null,
      salon_id: null,
      detail: { title, body, audience, devices: list.length, sent, unregistered, failed },
    });

    return json({ devices: list.length, sent, unregistered, failed });
  } catch (e) {
    return json({ error: (e as Error).message || "Broadcast failed" }, 500);
  }
});
