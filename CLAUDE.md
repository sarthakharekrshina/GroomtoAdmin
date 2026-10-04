@AGENTS.md

# Groomto AdminPartner

Admin panel for the Groomto salon marketplace. **Read `ADMIN_ANALYSIS.md` first** — it is the
master reference (architecture, confirmed backend facts, API gap analysis, what's built vs.
proposed). This file is the short operational brief; that one is the source of truth.

## The one rule that matters

**One backend, one database, multiple clients.** The backend is an existing Supabase project
(`oepwnbtoruxhdjnkcazu.supabase.co`) shared with the Groomto Partner Mobile App
(`F:\GroomtoRepo\Groomto-Partner-Mobile-App`, Flutter/Dart — the sibling repo this admin panel
was reverse-engineered from). **Never invent a new backend, database, API, or business rule.**
If something isn't supported by an existing RPC/table, it goes in the sidebar's
"Future / Recommended" section, not a fake implementation. See `ADMIN_ANALYSIS.md` §8 for the
exact list of what's real today vs. proposed.

## Auth & security model

- Sign-in is phone + OTP via the same Supabase Edge Functions the Partner app uses
  (`send-otp` / `verify-otp`), landing on a real Supabase JWT session.
- Admins can also sign in with **email + password** (`signInWithEmail`), meant for a dedicated
  email-only Supabase user created in the dashboard. **Never give a phone-number account a
  password**: phone logins are shared by the Customer/Partner apps and `verify-otp` manages their
  password — setting one signs that number out of both apps and is overwritten at its next OTP
  sign-in. Both paths end at the same `is_platform_admin()` gate.
- Admin-ness is **never** a frontend flag. Every gated page/action calls the
  `is_platform_admin()` Postgres RPC (or an RPC that internally checks it). The gate lives in
  `app/(app)/layout.tsx`.
- The Supabase **anon key** (in `.env.local`, `NEXT_PUBLIC_*`) is meant to be public — RLS is the
  real boundary. The **service-role key must never be added to a `NEXT_PUBLIC_*` var or shipped
  to a Client Component.** Nothing currently needs it (every `admin_*` RPC is already grantable
  to `authenticated`).
- First admin user is granted via `grant_platform_admin()`, run with service-role access outside
  this app (Supabase SQL editor/CLI) — there is deliberately no in-app path to becoming an admin.

## Architecture / conventions

- Next.js 16 App Router, TypeScript, Tailwind v4 (CSS-first theme in `app/globals.css`, brand
  tokens: `--brand` royal blue, `--gold` accent).
- `lib/supabase/{client,server,middleware}.ts` — standard `@supabase/ssr` pattern.
  `proxy.ts` (Next 16 renamed `middleware.ts` → `proxy.ts`) refreshes the session and redirects
  unauthenticated requests to `/login`.
- `lib/api/*.ts` — all Supabase reads live here (typed wrappers around RPCs/table selects). Pages
  never call `supabase.from()`/`supabase.rpc()` directly.
- `app/actions/*.ts` — all mutations are Server Actions (`"use server"`), each returning
  `{ ok, error? }`. Every admin RPC mutation writes to `admin_audit` on the backend automatically
  — don't add a second audit trail.
- `types/admin.ts` — types mirror RPC return shapes exactly; don't add fields an RPC doesn't
  return.
- Route group `app/(app)/` = authenticated shell (Sidebar + Header, admin-gated). `app/login/` is
  outside it deliberately (no sidebar there).
- Destructive/state-changing actions use an inline `<dialog>` confirm pattern (see
  `components/payments/PaymentActions.tsx`, `components/ui/ConfirmButton.tsx`) — **don't** wrap a
  ref-closing callback in a render-prop passed into a function call during render;
  `eslint-plugin-react-hooks`'s `react-hooks/refs` rule flags it even through `useCallback`. Give
  each dialog its own local `useRef` and inline `onClick` handlers instead.

## Current status (see ADMIN_ANALYSIS.md §9 for the full table)

**Built and working:** phone+OTP login, admin RBAC gate, sidebar/header shell with a visible
"Future/Recommended" nav section, Dashboard (`admin_overview`), Salons list + detail (profile,
services/subscription/referrals tabs, commission-rate editor, bank-status editor), Payments —
Statements (by status, confirm/reject payment, mark paid, resolve disputes) and Penalties
(`/payments/penalties`, filterable by status, waive via `admin_waive_penalty()`), Customers
(`/customers`, phone search — direct `users` read under the existing `users_admin_read` policy),
Subscriptions & Referrals (`/subscriptions` — global plan breakdown from `salon_subscriptions`/
`subscription_plans` table reads; per-salon plan state, subscription history, and referral
funnel on the salon detail page's Subscription/Referrals tabs — read-only, no comp-grant, see
below), Visibility Insight (`salon_ranking()` joined with `admin_salons()` — read-only view of
the live production ranking), Audit Logs, Settings (platform flags, generic `admin_set_setting`
writer, and an on-demand settlement close via `admin_close_cycles()`).

**Not built yet — backend-blocked, not a TODO for the frontend alone:** global Bookings view,
Offers/Coupons admin CRUD, Analytics/trends, Reviews (no backend schema exists anywhere in the
reviewed codebase — flag to the user before ever building this), Notification broadcast, salon
approve/suspend (needs a product decision on what "suspended" means operationally — don't guess,
see ADMIN_ANALYSIS.md §8-C), granting/changing a salon's subscription plan (see finding below —
`activate_subscription()` isn't reachable from this app), and per-customer booking history /
lifetime value (needs the same `bookings` admin-read fix as the global Bookings view).

**Before assuming something is "backend-blocked", check the RLS policies.** Two modules the
analysis doc listed as needing new RPCs turned out to need none: Customers works today because
`users_admin_read` (`admin_role.sql:110`) already grants admins SELECT on `users`, and Penalties
works because `penalties_admin_read` plus `admin_waive_penalty()` both already existed — the
`waivePenalty`/`closeCycles` server actions had been written but were never called by any UI.
The proposed `admin_customers()` RPC was only ever a convenience wrapper for booking aggregates,
not an access prerequisite.

**Resolved this session by reading the live SQL in the sibling Partner app repo** (no live-DB
query access was available, so this was settled from source, not the running database):
- `assert_own_salon()` **CONFIRMED** to accept a platform admin as caller
  (`supabase/rpc_authorization_fix.sql:33`: `if auth.uid() = p_salon or public.is_platform_admin()`).
  This makes `referral_progress()`, `referral_list()`, `salon_usage()`, and `compute_visibility()`
  safe to call for any salon as admin — they're `security definer` and gated through this
  function. Subscriptions & Referrals module can now be built without further backend work.
- `users.roles` self-write **CONFIRMED closed** — `admin_role.sql` (2026-08-18, the newer of the
  two conflicting migrations) adds `trg_protect_user_roles`, which supersedes
  `rls_hardening_2.sql`'s (2026-08-09) "still self-writable" comment.
- **Comp-grant confirmed NOT buildable today:** `activate_subscription()` (the only RPC that
  writes `salon_subscriptions`) is `revoke all ... from public, authenticated` — it's called only
  from the Razorpay webhook and `razorpay-action` Edge Function, both using a service-role
  client. There is no admin-gated Postgres wrapper around it. The Subscriptions page is read-only
  by design; don't add a "grant plan" button against a direct table write, that would bypass the
  `salon_subs_one_active` invariant and the notification the RPC sends.
- **Another pre-existing over-permission bug found, not ours to fix:** `salon_plan()` and
  `salon_plan_state()` (`supabase/subscription_plans.sql`, `supabase/plans_visibility_upgrade.sql`)
  are `security definer` with **no caller check at all** — not even the `assert_own_salon` bypass
  pattern, despite `rpc_authorization_fix.sql`'s own header comment claiming `salon_plan_state()`
  is one of the functions it protects. Practically: any authenticated partner can currently read
  any other salon's plan/rank/trial state, and it also means an admin caller works fine (nothing
  to bypass). Used as-is in the Subscription tab; flagged here because it's a real Partner-app
  security gap outside this repo's scope to patch.
- **New gap found, not previously documented:** `salon_account_health()`, `salon_standing()`,
  `salon_benchmark()`, and `salon_business_metrics()` are plain `language sql stable` (**not**
  `security definer`) and query `public.bookings` directly. The `bookings_participants_read` RLS
  policy (`rls_hardening.sql:60`) only allows `auth.uid() = salon_id or auth.uid() = customer_id`
  — no admin bypass. Called by an admin for a salon that isn't their own, these functions don't
  error; they silently return zero-row aggregates (e.g. `salon_standing` reports `'good'` standing
  with `sample: 0` for every salon). **Do not build a Salon Health/Standing admin view against
  these RPCs as-is** — it would show plausible-looking but wrong data. Needs a backend fix first
  (either make them `security definer` + `assert_own_salon`, or add a `bookings_admin_read` RLS
  policy) before any admin UI is built on top.

## User App section (Customer App admin) — `app/(app)/user-app/`

The sidebar has a Partner App / User App switch. The User App section manages what the
**Groomto Customer App** (`F:\UserAppRepo\groomto-Customer-App`, Flutter, same Supabase project)
shows: Overview (+ data-health checks), Customers (search/filters/detail), Salons & Services
(customer view + price/picture/rating editors), All Services, Reviews & Ratings, Offers & Deals,
Discovery Preview (home Top 10 / Offer Zone / Recommended), Referrals, Categories. All read-only
except the three editors backed by `supabase/proposed/admin_customer_app.sql` (applied).

- `lib/customer-app/rules.ts` mirrors Customer App display rules (offer "live" status, Top 10 and
  rating order, area/gender matching, home-tile category matching, referral constants) **for
  previews only**, each tagged with its Dart source. If the app changes, update it there.
- Home category tiles are hardcoded in the app and matched to `master_categories` **loosely**
  (case-insensitive, partial match either way, first row in DB order wins; no match → unfiltered
  list) — `getCategories()` therefore returns DB order, unsorted.
- Live-DB-only objects (no SQL in either repo): `reviews` + its rating trigger, `favorites`,
  `loyalty_ledger`, `master_categories`/`master_services`, offers RLS, account-deletion RPCs,
  `my_queue_position`, `redeem_points`. Read them with `select("*")` and render defensively.
- Phase 2 (`supabase/proposed/phase2_admin_functions.sql`, functions only — no table/column/
  policy/trigger changes; tested on PGlite/Postgres 17 in two schema variants): Support Inbox
  (`/user-app/support` customers + `/support` salons, replies are `sender='support'`), Bookings
  (`admin_bookings`, read-only, whole rows as JSON), referral records + cancel (PENDING/VERIFIED
  only), offer pause/resume (`offers.active`, plan-limit trigger still applies), salon profile
  editing (allow-listed fields, Partner-app shapes, photos remove-only), review moderation
  (clear comment / delete; original kept in admin_audit). Push broadcast is the Edge Function
  `supabase/functions/admin-broadcast-push` (needs deploying; reuses FIREBASE_SERVICE_ACCOUNT;
  taps open My Bookings in today's app). Pages show a "switch on" hint until the SQL is applied.
- Still not built: customer block (user chose to skip), home banners/tiles and feature toggles
  (hardcoded in the app — need a release), referral amounts (fixed in SQL).
- Pre-existing risks found: `device_tokens_all` policy is `using (true)`; the app marks bookings
  paid client-side (Razorpay in mock mode); Google Maps key hardcoded in the app.

## Dev environment notes (this machine)

- Node.js was installed via winget mid-session (`OpenJS.NodeJS.LTS`, v24 LTS) at
  `C:\Program Files\nodejs\`. New PowerShell invocations on this machine don't always pick up the
  updated PATH automatically — prefix commands with
  `$env:Path = "C:\Program Files\nodejs;" + $env:Path` if `node`/`npm` aren't found.
- Git identity for this repo is set **locally** (not global) as
  `Groomto Admin <groomto.india@gmail.com>` — global git config was intentionally left untouched.
- `npm run dev` / `npm run build` / `npm run lint` all pass clean as of the last commit.
