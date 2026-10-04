# Groomto AdminPartner — Analysis & Architecture

Source of truth for this document: `F:\GroomtoRepo\Groomto-Partner-Mobile-App` (Flutter Partner app + its
`supabase/` SQL migrations and Edge Functions). No separate backend repo exists — **Supabase is the backend**.
Every claim below is marked:

- **CONFIRMED** — read directly in source.
- **INFERRED** — reasonably deduced but not directly verified.
- **BACKEND VERIFICATION REQUIRED** — needs a check against the live Supabase project before relying on it.

---

## 1. System Architecture

```
                         ┌─────────────────────────────┐
                         │        SUPABASE PROJECT       │
                         │   oepwnbtoruxhdjnkcazu.supabase.co
                         │                                │
                         │  Postgres  (RLS + RPCs)        │
                         │  Auth (phone/OTP → JWT)         │
                         │  Storage (salon-photos bucket)  │
                         │  Realtime (bookings streams)     │
                         │  Edge Functions (Deno)           │
                         │  pg_cron (settlement/visibility)  │
                         └───────────┬─────────────┬────────┘
                                     │             │
                    ┌────────────────┘             └───────────────┐
                    ▼                                               ▼
        Partner Mobile App (Flutter)                     AdminPartner (Next.js) — NEW
        supabase_flutter client, anon key                 supabase-js client, anon key
        Role required: 'partner' in users.roles            Role required: 'admin' in users.roles
```

Customer App: referenced by shared tables (`bookings.customer_id`, `reviews`, `device_tokens`) but **its
repository was not available for inspection** (`F:\groomto` is an empty Flutter scaffold, not it). Anything
customer-app-owned (notably reviews) is flagged as external below.

**Both Partner App and AdminPartner talk to the same Supabase project — one backend, one database, two
clients.** No new backend or database is being created.

---

## 2. Existing Technologies

| Layer | Technology | Version |
|---|---|---|
| Partner App | Flutter / Dart | Flutter 3.44.6, Dart 3.12.2 |
| Partner App state | `provider` | 6.1.2 |
| Backend | Supabase (Postgres, Auth, Storage, Realtime, Edge Functions) | `supabase_flutter` 2.12.2 |
| OTP delivery | Firebase Phone Auth (fallback) + own WhatsApp/email sender (primary) | `firebase_auth` 6.3.0 |
| Push | Firebase Cloud Messaging | `firebase_messaging` 16.0.4 |
| Payments | Razorpay (payment links, UPI Autopay mandates, penny-drop bank verification) | `razorpay_flutter` 1.4.5 |
| Admin Panel (new) | Next.js, TypeScript, React, Tailwind CSS | Next.js 15 (App Router), Node 24 LTS |

---

## 3. Existing Partner Features

| Feature | Exists? | Important for Admin? | Reason |
|---|---|---|---|
| Phone+OTP auth / session | CONFIRMED | Yes (reused) | Only production-tested auth path with a role check wired to it |
| Partner onboarding wizard (multi-step) | CONFIRMED | No (view-only for admin) | Admin needs to *see* onboarding status, not run the wizard |
| Salon profile (address, KYC, photos) | CONFIRMED | Yes, read + status actions | Admin approves/monitors, doesn't self-edit |
| Services / categories / sub-services | CONFIRMED | Yes, read | Admin oversight of what's offered |
| Working hours | CONFIRMED | Yes, read | Needed for booking context |
| Booking requests (accept/reject/suggest) | CONFIRMED | Read-only for admin | Admin doesn't act on individual bookings, only observes/intervenes in disputes |
| Booking lifecycle (queue, in-progress, complete, no-show) | CONFIRMED | Yes, read (global view) | Core marketplace visibility |
| Cancellation penalties | CONFIRMED | Yes (waive action exists) | `admin_waive_penalty()` already built |
| Slot engine (availability calc) | CONFIRMED | No | Purely partner-operational, not an admin concern |
| Earnings / statements (partner-side) | CONFIRMED | Yes, as aggregate admin view | Admin sees `admin_statements()`, not the partner's own screen |
| Settlement cycles / payouts | CONFIRMED | Yes | `admin_confirm_payment`, `admin_mark_paid`, `admin_close_cycles` |
| Settlement disputes | CONFIRMED | Yes | `admin_resolve_dispute()` exists |
| Bank verification (penny-drop) | CONFIRMED | Yes | `admin_set_bank_status()` exists |
| Commission rate | CONFIRMED | Yes | `admin_set_commission()` exists |
| Subscription plans (Free/Growth/Pro) | CONFIRMED | Yes, read + comp-grant | `salon_subscriptions.comped_by` implies admin can grant plans |
| Offers/coupons (partner-created) | CONFIRMED | Yes, needs new admin CRUD | No admin-side write API found yet |
| Referral program | CONFIRMED | Yes, read-only | `referral_progress/list()` exist, admin-scoped access needs checking |
| Visibility/ranking engine | CONFIRMED | Yes, read/explain only | `compute_visibility`, `salon_ranking` — don't rebuild the algorithm |
| WhatsApp/push notifications | CONFIRMED | Partial | Delivery status readable; no admin broadcast RPC |
| Reviews / ratings | **NOT FOUND in this repo** | Future | No table-creation, no RPC — lives in unavailable customer app |
| Customer accounts | Referenced only (`users.roles` contains `customer`) | Yes, needs new RPC | No partner-app screen for this; admin needs its own |
| Admin role / RBAC | CONFIRMED — already exists | — | `is_platform_admin()`, `admin_audit`, `admin_*` RPCs |

---

## 4. Existing APIs (Supabase RPCs / Edge Functions — there is no REST controller layer)

> Format: Name · Purpose · Auth · Admin-reusable

- **`is_platform_admin()`** · returns bool for current JWT user · `authenticated` · N/A (the gate itself)
- **`grant_platform_admin(user, grant)`** · add/remove `admin` role · service-role only, no in-app path · N/A (ops-only, run from Supabase dashboard/CLI)
- **`admin_overview()`** · dashboard counts (salons, open/overdue statements, amount due, payments to review, open disputes, pending penalties, 30d gross/commission) · admin-gated · **Reusable — dashboard KPIs**
- **`admin_salons()`** · salon list with commission rate, bank status, `accepting_bookings`, outstanding balance, 30d bookings · admin-gated · **Reusable — Salons list**
- **`admin_statements(status?, limit?)`** · all payout statements across salons · admin-gated · **Reusable — Payments/Settlements**
- **`admin_confirm_payment(payment, confirm, note?)`** · confirm/reject a submitted settlement payment · admin-gated, writes `admin_audit` · **Reusable**
- **`admin_mark_paid(payout, reference?)`** · record manual/off-platform payment · admin-gated, audited · **Reusable**
- **`admin_resolve_dispute(dispute, uphold, resolution?, credit?)`** · resolve a settlement dispute, optional credit note · admin-gated, audited, notifies salon · **Reusable**
- **`admin_add_adjustment(salon, amount, reason, payout?, note?)`** · manual ledger adjustment · admin-gated, audited · **Reusable**
- **`admin_waive_penalty(penalty, note?)`** · waive a cancellation penalty · admin-gated, audited, notifies salon · **Reusable**
- **`admin_set_commission(salon, rate 0–50)`** · change a salon's commission rate (future bookings only) · admin-gated, audited · **Reusable**
- **`admin_set_bank_status(salon, status, holder?)`** · manually set bank verification status · admin-gated, audited · **Reusable**
- **`admin_close_cycles(start?, end?)`** · force-run the weekly settlement close · admin-gated, audited · **Reusable**
- **`admin_set_setting(key, value)`** · write to `platform_settings` (WhatsApp templates, commission toggle, collection UPI, referral config, etc.) · admin-gated, audited · **Reusable — Settings module**
- **`salon_account_health(salon)`** / **`salon_standing(salon)`** / **`salon_benchmark(salon)`** · 30-day cancellation/acceptance/completion health scoring, peer percentile · CONFIRMED, caller-scoped by `assert_own_salon` in the partner app · **Reusable if admin bypass is confirmed** (BACKEND VERIFICATION REQUIRED — check whether `is_platform_admin()` is accepted as an alternate caller)
- **`compute_visibility(salon)`** / **`salon_ranking(salon)`** · ranking-score breakdown (plan boost, rating, acceptance, completion, recency, cancellations, boosts) · **Reusable, read-only — powers the "why is this salon ranked here" admin view**
- **`referral_progress()` / `referral_list()`** · referral funnel per salon · `assert_own_salon`-gated · **Needs admin-bypass check** (BACKEND VERIFICATION REQUIRED)
- **`salon_usage(salon)`** · plan limits used vs. available (photos/banners/offers) · `assert_own_salon`-gated · **Needs admin-bypass check**
- **`platform_payment_config()`** · exposes `commission_enabled`/`online_payment_enabled`/`show_billing` flags · public/authenticated · **Reusable — Settings**
- **Edge Functions:** `send-otp`, `verify-otp`, `firebase-session` (auth flow — reused as-is for Admin login); `razorpay-action`, `razorpay-webhook` (payments — admin doesn't call directly, just reads results); `send-booking-push`, `whatsapp-send`, `whatsapp-status` (notifications — admin reads delivery status, doesn't send)

---

## 5. Database Entities (tables actually found)

`users` (shared, `roles: user_role[]` enum array — customer/partner/admin), `salons`, `services` /
`master_categories` / `master_services` / `master_sub_services`, `stylists`, `queue`, `bookings`,
`transactions`, `payouts`, `settlement_payments`, `settlement_disputes`, `settlement_adjustments`,
`invoice_counters`, `subscription_plans`, `salon_subscriptions`, `salon_boosts`, `offers`,
`provider_penalties`, `provider_wallet_ledger`, `bank_change_log`, `salon_availability_log`,
`razorpay_events`, `salon_mandates`, `referral_rewards`, `notifications`, `whatsapp_messages`,
`salon_device_tokens`, `device_tokens` (customer-app-owned), `support_messages`, `platform_settings`,
`admin_audit`. **`reviews` is referenced but never created in this codebase — external/unconfirmed schema.**

---

## 6. Authentication & Authorization

- **Mechanism (CONFIRMED):** Phone number → OTP (own WhatsApp/email sender first, Firebase Phone Auth
  fallback) → server-side exchange for a one-time password → `supabase.auth.signInWithPassword` → real
  Supabase JWT session, auto-refreshed by the SDK.
- **Roles (CONFIRMED):** One shared `auth.users`/`public.users` row per phone number; `roles` is a Postgres
  enum array that can hold `customer`, `partner`, `admin` simultaneously. Appending a role never removes
  another (partner sign-in explicitly appends `'partner'`, never overwrites).
- **Admin role already exists.** `is_platform_admin()` checks `'admin' = any(roles)` for `auth.uid()`.
  `grant_platform_admin()` is **revoked from `public`/`authenticated`** — there is deliberately no in-app
  path to becoming an admin; it must be run by someone with service-role access (Supabase dashboard/CLI).
- **`roles` write protection — RESOLVED, CONFIRMED closed.** A trigger (`protect_user_roles`) rejects any
  change to `roles` unless a session flag `groomto.role_change='allowed'` is set, which only
  `grant_platform_admin()` sets. The earlier hardening migration's comment flagging `roles` as
  "still self-writable, not yet closed" is from `rls_hardening_2.sql` (git-committed 2026-08-09);
  `admin_role.sql`, which adds `trg_protect_user_roles`, is git-committed 2026-08-18 — later, and
  it directly supersedes that note by adding the trigger the comment says was missing. Treated as
  settled from source; a live `select tgname from pg_trigger where tgrelid =
  'public.users'::regclass;` (should show `trg_protect_user_roles`) would still be the way to
  double-check this against the actual deployed database, since git history isn't proof of what's
  applied in production.
- **What AdminPartner needs to add:** nothing new in the auth *mechanism* — reuse phone+OTP sign-in as-is.
  What's new is purely a frontend gate: after sign-in, call `is_platform_admin()`; if false, refuse entry
  with a clear "not an admin account" message and sign the session back out. Never infer admin-ness from
  anything client-side.
- **Recommended future roles** (`SUPER_ADMIN`, `OPERATIONS`, `FINANCE`, `SUPPORT`, `CONTENT_MANAGER`): the
  backend currently only has a single boolean `admin` flag, not tiered RBAC. Treat all admins as one tier
  for now; propose granular roles as a backend change if/when Groomto needs them (see §8 Gap Analysis).

---

## 7. Business Rules (confirmed from SQL/Dart, not invented)

- **Booking statuses:** `pending_approval`/`new` → `confirmed`/`upcoming` (or `suggested`, `rejected`) →
  `in_progress` → `completed`; or `cancelled`/`expired` at various points. No other statuses exist.
- **Auto-expiry:** pending requests expire after 10 min; suggested slots auto-cancel after 15 min of no
  customer response; confirmed bookings auto-cancel as a no-show 10 min past appointment time if never
  started; in-progress bookings auto-complete ~1h past salon closing if never marked done.
- **No reschedule once locked:** a DB trigger blocks changing time/date fields once a booking is
  `confirmed`/`in_progress`/`completed`, and blocks moving it back to an earlier state.
- **Cancellation penalty:** only charged when the *salon* cancels a `confirmed`/`in_progress` booking for a
  reason other than customer no-show/customer-requested. Fee = 10% of price, clamped ₹25–₹200. Partner can
  appeal once; only admin can waive.
- **Commission:** per-salon rate (default 15%, launch-time default 0%), frozen per-transaction at booking
  time — changing the rate never rewrites past transactions. Gated globally by a `commission_enabled`
  platform flag.
- **Settlement:** weekly (Mon–Sun) cycles closed by cron; a `payouts` row nets transactions + penalties per
  salon; due 3 days later; auto-flips to `overdue` if unpaid. Disputes create adjustment credit notes, never
  edit settled history. Refunds reopen a statement rather than silently leaving it "paid."
  Sequential GST invoice numbers per Indian financial year.
- **Subscription plans:** Free / Growth (₹499/mo) / Pro (₹1499/mo) gate photo/banner/offer counts, homepage
  placement, and commission discount. Downgrades never delete existing content, only block further growth.
  One-time 14-day trial or one-time 3-month welcome offer (mutually exclusive, never both).
- **Visibility/ranking:** a deterministic scoring formula (plan boost + rating + acceptance rate +
  completion rate + recency − cancellation penalty, halved if offline) recomputed nightly and on plan
  change; a temporary "boost" adds a flat +1000. **This is the actual ranking algorithm already in
  production — Admin should surface/explain it, not invent a new one.**
- **Referrals:** one-time, only within referred salon's first 30 days, only counts once the referred salon
  completes ≥1 booking (anti-fraud). Every 20 qualified referrals grants 1 month Pro (stacks on existing
  plan).
- **Reviews/ratings:** business rules (who can review, moderation policy) are **unknown** — no code found.

---

## 8. ADMIN API GAP ANALYSIS

### A. Existing and reusable today
```
admin_overview()                 → Dashboard KPIs
admin_salons()                   → Salons list
admin_statements() / admin_confirm_payment() / admin_mark_paid()
admin_resolve_dispute() / admin_add_adjustment() / admin_waive_penalty()
admin_set_commission() / admin_set_bank_status() / admin_close_cycles()
admin_set_setting() / platform_payment_config()
compute_visibility() / salon_ranking()   (read-only explain view)
admin_audit  (table, admin-read RLS)     → Audit Logs, ready today
```

### B. Existing but caller-scoped (partner-only) — admin access status

**RESOLVED (read directly from `supabase/rpc_authorization_fix.sql:26-39` in the Partner app
repo, since live-DB access wasn't available this session):**
```
referral_progress(salon) / referral_list(salon) / salon_usage(salon) / compute_visibility(salon)
```
These are all `security definer` and gated by `assert_own_salon(p_salon)`, whose body is:
```sql
if auth.uid() = p_salon or public.is_platform_admin() then return; end if;
raise exception 'Not allowed' using errcode = '42501';
```
**CONFIRMED — a platform admin can call these for any salon.** Safe to build against today.
`salon_ranking()` needs no salon-scoping at all (returns all salons) and is likewise
`security definer` — used by the Visibility Insight module, shipped this session.

**NEW GAP — comp-grant is not reachable from this app.** `activate_subscription(salon, plan,
interval, amount, payment_id, comped_by, note)` is the only function that writes
`salon_subscriptions`, and it is `revoke all on function ... from public, authenticated`
(`subscription_plans.sql:237-239`). It's called only from `razorpay-webhook` and
`razorpay-action` Edge Functions, both using a service-role client — never from a
browser/`authenticated` session. No admin-gated Postgres wrapper around it exists anywhere in
the schema. **Granting a comp plan from AdminPartner needs a new backend RPC** (e.g.
`admin_grant_subscription(salon, plan, months, note)`, `is_platform_admin()`-gated, calling
`activate_subscription` internally as the function owner) — this is a genuine backend gap, not
a frontend oversight. Until that exists, the Subscriptions module is read-only.

**NEW GAP — pre-existing over-permission bug in the Partner app, not this repo's to fix.**
`salon_plan(salon)` and `salon_plan_state(salon)` (`subscription_plans.sql:127`,
`plans_visibility_upgrade.sql:92`) are `security definer` with **no caller-identity check in the
function body** — not even the `assert_own_salon` pattern used everywhere else. This is despite
`rpc_authorization_fix.sql`'s own header comment explicitly listing `salon_plan_state()` as one
of the functions being locked down; the fix only re-granted its `EXECUTE` privilege to
`authenticated` in a bulk revoke/re-grant loop; it never added the missing check to the function
body. Net effect: any authenticated partner can currently call `salon_plan_state('<any salon>')`
and read that salon's plan tier, rank position, and trial status. Not an AdminPartner bug — it
predates this app and lives entirely in the Partner app's SQL — but it does mean an admin caller
works today (nothing blocks it), which is what AdminPartner's Subscription tab relies on.

**NEW GAP — NOT safe to build against (found this session, not in the original pass):**
```
salon_account_health(salon) / salon_standing(salon) / salon_benchmark(salon)
salon_business_metrics(salon, days)
```
These are plain `language sql stable` — **not** `security definer`, and none of them call
`assert_own_salon`. They query `public.bookings` directly, which relies on RLS
(`bookings_participants_read` in `rls_hardening.sql:60`: `auth.uid() = salon_id or auth.uid() =
customer_id`) for row filtering — and that policy has **no platform-admin bypass**, unlike
`salon_boosts`/`salon_subscriptions`/`razorpay_events` which explicitly OR in
`is_platform_admin()`. The practical effect: an admin calling `salon_standing('<any salon>')`
doesn't get an authorization error — RLS just filters `bookings` down to zero rows for that
caller, and the function's own logic treats `total < 10` as `'good'` standing. **It returns a
plausible, wrong answer instead of failing loudly.** Do not build a "Salon Health" admin page on
these RPCs until one of two backend fixes lands: make them `security definer` with an
`assert_own_salon` check (matching the referral/usage pattern above), or add an
`is_platform_admin()` OR-clause to `bookings_participants_read` (matching every other admin-read
policy in this schema).

### C. Missing Admin APIs — proposed, not built

**`admin_set_salon_status(salon uuid, status text, reason text)`**
- Why: no lever exists today to approve/reject/suspend/reactivate a salon. Only `accepting_bookings`
  (partner's own online/offline toggle) exists — that's an availability toggle, not an admin approval gate.
- Access: `is_platform_admin()` only.
- Request: salon id, new status (`pending|approved|suspended|rejected` — needs a real `salons.status`
  column, which was not found; likely needs to be added), reason text.
- Response: void; writes `admin_audit`.
- Business rule: **ambiguous — flagging per your rules rather than inventing it.** Does a suspended salon
  stop accepting bookings automatically? Does it disappear from the visibility engine? This needs a product
  decision before implementation, not a guess.

**`admin_bookings(filters...)`**
- Why: `bookings` RLS restricts reads to the salon/customer participant; there is no admin-read policy on
  `bookings` (unlike `transactions`/`payouts`/`users`, which already have one).
- Access: admin-gated RPC or a new `bookings_admin_read` RLS policy (`using (is_platform_admin())`) —
  simplest fix, mirrors the existing pattern exactly.
- Request: optional filters (date range, salon, customer, status, payment status).
- Response: paginated booking rows.
- Business rule: none invented — pure read.

**`admin_customers(search?, limit?, offset?)`** — **DOWNGRADED: not required for the customer list.**
- The customer list **shipped without this RPC.** `users_admin_read` (`admin_role.sql:110-112`)
  already grants admins SELECT on `users`, so `/customers` reads the table directly with a
  `roles @> {customer}` filter — the same defensive loosely-typed read `lib/api/salons.ts` uses
  for `salons`/`services`, since `users` isn't created in any migration in this repo and its
  column set isn't authoritatively known.
- **Still worth building for the aggregates only.** Per-customer booking counts, lifetime value,
  and wallet balance are the genuinely blocked part — they need booking data, and `bookings` has
  no admin-read path (see the `admin_bookings` entry above). Fixing `bookings` unblocks both the
  global Bookings view and these aggregates at once; this RPC is then a convenience, not a gate.
- Access: admin-gated. Business rule: none invented.

**`admin_offers(salon?)` + `admin_set_offer_active(offer, active)`**
- Why: offers are plan-limited and salon-owned; no admin write path was found.
- Access: admin-gated, audited.
- Business rule: deactivating an offer should not need to satisfy the plan-limit trigger (that trigger
  guards salon-initiated creation, not admin moderation) — **verify the trigger doesn't block an admin
  UPDATE** before shipping this.

**`admin_analytics(range)`**
- Why: `admin_overview()` gives point-in-time counts, not trend series (daily/weekly bookings & revenue,
  top services, top cities). No such view/RPC exists.
- Access: admin-gated, read-only.
- Business rule: none — pure aggregation of existing `transactions`/`bookings` data. Safe to build once
  someone confirms which time granularity and grouping (city? area? pincode isn't consistently structured
  in older `salons.address` rows per the onboarding model) is actually wanted.

**Reviews/ratings — no proposal made.** The schema owner is outside this repo. Do not guess a `reviews`
table shape; ask before building anything here.

---

## 9. Admin Modules — what ships now vs. what's proposed

| Module | Status |
|---|---|
| Dashboard | Ships now — `admin_overview()` |
| Salons (list, profile, services/staff/hours read, ratings if available) | Ships now (list + read detail); **approve/suspend action blocked** on §8-C `admin_set_salon_status` |
| Payments — Settlements/Disputes | Built — `/payments`, statements by status, confirm/reject, mark paid, resolve dispute |
| Payments — Penalties | **Shipped this session** — `/payments/penalties`, filter by status, waive via `admin_waive_penalty()`. The RPC, the `penalties_admin_read` RLS policy, and the `waivePenalty` server action all already existed; only the UI was missing |
| Settlement close (on demand) | **Shipped this session** — `admin_close_cycles()` in Settings, confirm-dialog gated. The `closeCycles` action existed with no caller |
| Subscriptions & Plans (view; comp-grant NOT possible) | **Shipped this session** — `/subscriptions` (global) + salon detail "Subscription" tab. Comp-grant confirmed blocked: `activate_subscription()` is revoked from `authenticated` entirely (webhook/service-role only, no admin wrapper exists) |
| Referrals | **Shipped this session** — salon detail "Referrals" tab, `referral_progress()`/`referral_list()`, admin-access CONFIRMED (§8-B). No bulk/global referral RPC exists, so this is per-salon only, same as the Partner app itself |
| Visibility/Ranking explainer | **Shipped this session** — `/visibility`, `salon_ranking()` joined with `admin_salons()`, read-only |
| Audit Logs | Ships now — `admin_audit` already exists |
| Settings (platform flags, WhatsApp templates, collection UPI) | Ships now — `admin_set_setting`/`platform_settings` |
| Bookings (global view) | **Future** — needs §8-C `admin_bookings` / RLS policy |
| Customers | **Shipped this session** — `/customers` with phone search, via the pre-existing `users_admin_read` RLS policy; no new RPC was needed. Booking/LTV aggregates remain blocked on `bookings` admin-read |
| Offers & Coupons (admin CRUD) | **Future** — needs §8-C offer RPCs |
| Analytics (trends) | **Future** — needs §8-C `admin_analytics` |
| Reviews & Ratings | **Future / Backend required** — no schema found in this repo |
| Notification broadcast | **Future** — no send-side admin RPC; delivery-status read may be possible today, unconfirmed |
| Partner Health Score / Salon Visibility explainer | Ships now as a *read/explain* view of existing `compute_visibility`/`salon_standing` — do not build a second scoring algorithm |
| Operational Alerts (high cancellation, low rating, inactive partner, payment failures) | **Proposed, not built** — derivable today from `salon_standing`, `admin_statements`, `razorpay_events` for everything except rating-based alerts (blocked on Reviews) |

---

## 10. Navigation (only what's backed by something real)

As built (`components/layout/Sidebar.tsx`):

```
Dashboard                  /
Salons                     /salons  (+ /salons/[id]: Overview | Services |
                             Subscription | Referrals | Bookings* | Reviews*)
Payments                   /payments            — Statements
 └── Penalties             /payments/penalties
Customers                  /customers
Subscriptions & Referrals  /subscriptions
Visibility Insight         /visibility
Audit Logs                 /audit-logs
Settings                   /settings  (platform flags, setting writer,
                             on-demand settlement close)

── Future / Recommended (backend work required first) ──
Bookings (global)          needs bookings admin-read (§8-C)
Offers & Coupons           needs admin offer RPCs (§8-C)
Reviews & Ratings          no schema exists anywhere (§8-C)
Analytics (trends)         needs admin_analytics (§8-C)
Notification Broadcast     no send-side admin RPC
Operational Alerts         partially derivable; rating alerts blocked on Reviews
```

`*` Bookings and Reviews exist as salon-detail tabs that render a
"Future / Recommended" notice explaining the specific backend gap, rather than
being hidden — the same convention as the sidebar's disabled section.

---

## 11. Security Notes

- Admin gate = `is_platform_admin()` called against the live session, always. No `if (user.role==='admin')`
  in frontend code, ever.
- The Supabase **anon key** is not a secret (same trust model as the Flutter app) — it ships in the
  AdminPartner browser bundle via `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- The Supabase **service-role key must never reach the browser**. It isn't needed for anything in §8-A —
  every `admin_*` RPC is `SECURITY DEFINER` and already grantable to `authenticated`. If a future feature
  genuinely needs service-role (e.g. `grant_platform_admin` itself, which is deliberately locked out of the
  app), it belongs in a Next.js Route Handler reading `SUPABASE_SERVICE_ROLE_KEY` from server-only env vars
  — never in a client component.
- First real admin user must be granted via `grant_platform_admin()` run with service-role access
  (Supabase SQL editor or CLI) — outside the app, by design. I cannot and should not build an in-app path
  around this.
