// Shapes mirror the Postgres RPCs exactly (see supabase/admin_operations.sql
// in the Partner App repo). Do not add fields these RPCs don't return.

export interface AdminOverview {
  salons_total: number;
  statements_open: number;
  statements_overdue: number;
  amount_due: number;
  payments_to_review: number;
  disputes_open: number;
  penalties_pending: number;
  gross_30d: number;
  commission_30d: number;
}

export interface AdminSalon {
  id: string;
  name: string;
  owner_name: string | null;
  phone: string | null;
  commission_rate: number | null;
  bank_status: string | null;
  accepting_bookings: boolean | null;
  outstanding: number;
  bookings_30d: number;
}

export type StatementStatus =
  | "pending"
  | "submitted"
  | "paid"
  | "overdue"
  | "disputed";

export interface AdminStatement {
  id: string;
  salon_id: string;
  salon_name: string | null;
  invoice_no: string | null;
  period_start: string | null;
  period_end: string | null;
  due_date: string | null;
  bookings_count: number | null;
  amount: number;
  direction: "incoming" | "outgoing";
  status: StatementStatus;
  payment_id: string | null;
  payment_ref: string | null;
  dispute_id: string | null;
}

// Columns per the insert in supabase/cancellation_penalties.sql:42 and the
// appeal columns added in supabase/partner_standards.sql:70-72. Penalty status
// moves pending → appealed (partner contests) → waived (admin decision).
export interface ProviderPenalty {
  id: string;
  provider_id: string;
  booking_id: string | null;
  amount: number;
  reason: string | null;
  status: string;
  appeal_reason: string | null;
  appealed_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface SalonRanking {
  salon_id: string;
  score: number;
  boosted: boolean;
}

export interface SubscriptionPlan {
  code: string;
  name: string;
  tagline: string | null;
  price_monthly: number;
  price_yearly: number;
  sort_order: number;
  active: boolean;
  features: Record<string, unknown>;
  benefits: string[];
}

export type SubscriptionStatus = "pending" | "active" | "expired" | "cancelled";

export interface SalonSubscription {
  id: string;
  salon_id: string;
  plan_code: string;
  status: SubscriptionStatus;
  interval: "monthly" | "yearly" | string;
  amount: number;
  started_at: string;
  expires_at: string | null;
  cancelled_at: string | null;
  rzp_payment_id: string | null;
  comped_by: string | null;
  note: string | null;
  created_at: string;
}

export interface SalonPlanState {
  plan_code: string;
  plan_name: string;
  status: string;
  expires_at: string | null;
  is_trial: boolean;
  trial_used: boolean;
  boosts_left: number;
  boost_active: boolean;
  boost_ends: string | null;
  rank_position: number | null;
  rank_total: number | null;
}

export interface ReferralProgress {
  code: string | null;
  invited: number;
  qualified: number;
  progress: number;
  goal: number;
  rewards_earned: number;
  reward_plan: string | null;
  reward_months: number;
  reward_name: string | null;
  can_redeem: boolean;
  referred_by: string | null;
}

export interface ReferredSalon {
  name: string;
  city: string | null;
  joined_at: string | null;
  qualified: boolean;
}

export interface AuditLogEntry {
  id: string;
  admin_id: string;
  action: string;
  target_id: string | null;
  salon_id: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
}

/**
 * One priced option on a service — shape from the Partner app's
 * supabase/service_variants_column.sql: {label, price, duration}, prices
 * stored as strings.
 */
export interface ServiceVariant {
  label: string;
  price: string;
  duration?: string;
}

/** `services` row as the Customer app storefront reads it. */
export interface CatalogService {
  id: string;
  salon_id: string;
  name: string | null;
  price: string | number | null;
  duration: string | number | null;
  category_id: string | null;
  variants: ServiceVariant[] | null;
  /** Added by supabase/proposed/admin_customer_app.sql — undefined until applied. */
  image_url?: string | null;
}

export interface CatalogSalon {
  id: string;
  name: string | null;
  rating_avg: number | null;
  rating_count: number | null;
  /** Non-null while an admin override pins the rating (admin_customer_app.sql). */
  rating_override_avg?: number | null;
  rating_override_count?: number | null;
}

/**
 * `salons.working_hours` JSONB — shape from the Customer App's WorkingHours
 * model (lib/models/working_hours.dart).
 */
export interface WorkingHoursJson {
  days?: string[];
  open?: string | null;
  close?: string | null;
  hasBreak?: boolean;
  breakStart?: string | null;
  breakEnd?: string | null;
}

/**
 * A salon exactly as the Customer App reads it (Salon.fromMap in
 * lib/models/salon.dart), plus the two admin-relevant columns it doesn't
 * display. Built by toCustomerAppSalon() in lib/customer-app/rules.ts.
 */
export interface CustomerAppSalon {
  id: string;
  name: string;
  owner_name: string | null;
  address: string | null;
  city: string | null;
  pincode: string | null;
  phone: string | null;
  type: string | null;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  photos: string[];
  working_hours: WorkingHoursJson;
  rating_avg: number | null;
  rating_count: number;
  visibility_score: number;
  referral_code: string | null;
  rating_override_avg: number | null;
}

/** `offers` row — columns the Customer App's Offer.fromMap reads. */
export interface OfferRow {
  id: string;
  salon_id: string;
  title: string | null;
  discount: number | string | null;
  offer_type: string | null;
  max_discount: number | string | null;
  min_order: number | string | null;
  free_item: string | null;
  code: string | null;
  active: boolean | null;
  valid_from?: string | null;
  valid_until?: string | null;
  created_at: string | null;
}

/** `reviews` row — columns the Customer App's Review model and ReviewService use. */
export interface ReviewRow {
  id: string;
  salon_id: string | null;
  booking_id: string | null;
  customer_id: string | null;
  rating: number | null;
  comment: string | null;
  customer_name: string | null;
  customer_photo: string | null;
  created_at: string | null;
}

/** `master_categories` row — columns the Customer App's MasterCategory reads. */
export interface MasterCategoryRow {
  id: string;
  name: string | null;
  icon: string | null;
  description: string | null;
}

// ── Phase 2 admin RPC shapes (supabase/proposed/phase2_admin_functions.sql) ──

/** admin_support_threads() row. */
export interface SupportThread {
  id: string;
  name: string | null;
  phone: string | null;
  messages: number;
  last_at: string;
  last_sender: string | null;
  last_message: string | null;
  needs_reply: boolean;
}

/** admin_support_messages() row. */
export interface SupportMessage {
  id: string;
  sender: string | null;
  message: string | null;
  created_at: string;
}

/**
 * admin_bookings() row: the whole `bookings` row (to_jsonb) plus salon_name.
 * Only the fields admin pages read are named; the rest stay loosely typed
 * because the two apps add booking columns independently.
 */
export type AdminBookingRow = Record<string, unknown> & {
  id: string;
  salon_id: string | null;
  customer_id: string | null;
  status: string | null;
  salon_name: string | null;
  created_at: string | null;
};

/** admin_bookings() result. */
export interface AdminBookingsResult {
  total: number;
  status_counts: Record<string, number>;
  completed_value: number;
  rows: AdminBookingRow[];
}

/** admin_referrals() row. */
export interface ReferralRecord {
  id: string;
  referral_type: string;
  status: string;
  referral_code: string;
  points_awarded: number;
  created_at: string;
  verified_at: string | null;
  completed_at: string | null;
  referrer_id: string | null;
  referrer_name: string | null;
  referrer_phone: string | null;
  referrer_salon_id: string | null;
  referrer_salon_name: string | null;
  referred_user_id: string;
  referred_name: string | null;
  referred_phone: string | null;
}

/** admin_referrals() result. */
export interface AdminReferralsResult {
  total: number;
  status_counts: Record<string, number>;
  rows: ReferralRecord[];
}
