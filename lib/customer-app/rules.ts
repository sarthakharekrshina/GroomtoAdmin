import type {
  CustomerAppSalon,
  OfferRow,
  WorkingHoursJson,
} from "@/types/admin";

/**
 * Customer App rules, mirrored for admin PREVIEWS ONLY.
 *
 * The admin panel never enforces any of this — the Customer App does, on the
 * customer's phone. These copies exist so "what the customer sees" pages show
 * exactly what the app shows. Each one names the Dart source it was copied
 * from (F:\UserAppRepo\groomto-Customer-App\lib\...); if the app changes, this
 * file must follow, or the previews drift.
 */

// ── Parsing (Dart _toDouble / _toInt / DateTime.tryParse) ──────────────────

/** models/salon.dart `_toDouble`: a number, or a numeric string, else null. */
export function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const s = String(value).trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** models/offer.dart `_toInt`: int as-is, num rounded, string parsed, else 0. */
function parseOfferInt(value: unknown): number {
  if (typeof value === "number") return Math.round(value);
  const s = String(value ?? "").trim();
  return /^[+-]?\d+$/.test(s) ? Number(s) : 0;
}

function parseDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function str(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

// ── Salons (models/salon.dart, providers/salon_provider.dart) ───────────────

/** Salon.fromMap — same fields, same fallbacks ("Salon" for a blank name). */
export function toCustomerAppSalon(row: Record<string, unknown>): CustomerAppSalon {
  const name = typeof row.name === "string" && row.name.trim() ? row.name : "Salon";
  const wh = row.working_hours;
  return {
    id: String(row.id),
    name,
    owner_name: str(row.owner_name),
    address: str(row.address),
    city: str(row.city),
    pincode: str(row.pincode),
    phone: str(row.phone),
    type: str(row.type),
    description: str(row.description),
    latitude: parseNumber(row.latitude),
    longitude: parseNumber(row.longitude),
    photos: Array.isArray(row.photos) ? row.photos.map((p) => String(p)) : [],
    working_hours:
      wh && typeof wh === "object" && !Array.isArray(wh)
        ? (wh as WorkingHoursJson)
        : {},
    rating_avg: parseNumber(row.rating_avg),
    rating_count: Math.trunc(parseNumber(row.rating_count) ?? 0),
    visibility_score: parseNumber(row.visibility_score) ?? 0,
    referral_code: str(row.referral_code),
    rating_override_avg: parseNumber(row.rating_override_avg),
  };
}

/** Salon.displayRating — 0 until the salon has at least one rating. */
export function displayRating(s: CustomerAppSalon): number {
  return s.rating_count > 0 ? (s.rating_avg ?? 0) : 0;
}

/** SalonProvider._matchesGender — Men/Women include unisex; null = everyone. */
export function matchesGender(s: CustomerAppSalon, gender: string | null): boolean {
  if (!gender) return true;
  const t = (s.type ?? "").toLowerCase();
  const unisex = t.includes("unisex") || t.includes("both");
  return gender === "men"
    ? unisex || (t.includes("men") && !t.includes("women"))
    : unisex || t.includes("women");
}

/** SalonProvider._kCityAliases */
const CITY_ALIASES = [
  ["gurugram", "gurgaon", "gudgaon"],
  ["bengaluru", "bangalore"],
  ["mumbai", "bombay"],
  ["kolkata", "calcutta"],
  ["chennai", "madras"],
];

/** SalonProvider._spellings */
function spellings(place: string): string[] {
  const p = place.toLowerCase().trim();
  for (const names of CITY_ALIASES) {
    if (names.some((n) => p.includes(n))) return Array.from(new Set([p, ...names]));
  }
  return [p];
}

/** SalonProvider._inArea — salon's city/address vs the selected area. */
export function inArea(s: CustomerAppSalon, area: string | null): boolean {
  if (!area) return true;
  const city = (s.city ?? "").toLowerCase();
  const address = (s.address ?? "").toLowerCase();
  for (const needle of spellings(area)) {
    if (city && (city.includes(needle) || needle.includes(city))) return true;
    if (address.includes(needle)) return true;
  }
  return false;
}

/**
 * Dart's String.compareTo on lowercased names — plain code-unit order, not
 * locale-aware, so ties break exactly as they do in the app.
 */
function byName(a: CustomerAppSalon, b: CustomerAppSalon): number {
  const x = a.name.toLowerCase();
  const y = b.name.toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
}

/** SalonProvider._baseReferralPoints — a salon missing from groomto_top10(). */
export const TOP10_BASE_POINTS = 100;

/**
 * SalonProvider.groomtoTop10 — referral points (groomto_top10()) first, then
 * visibility score, then name. The home row shows the first 10.
 */
export function orderTop10(
  salons: CustomerAppSalon[],
  points: Map<string, number>,
): CustomerAppSalon[] {
  const pts = (id: string) => points.get(id) ?? TOP10_BASE_POINTS;
  return [...salons].sort((a, b) => {
    const byReferrals = pts(b.id) - pts(a.id);
    if (byReferrals !== 0) return byReferrals;
    const byScore = b.visibility_score - a.visibility_score;
    if (byScore !== 0) return byScore;
    return byName(a, b);
  });
}

/** SalonProvider.topRated — "Recommended for you" and the Offer Zone order. */
export function orderTopRated(salons: CustomerAppSalon[]): CustomerAppSalon[] {
  return [...salons].sort((a, b) => {
    const byRating = displayRating(b) - displayRating(a);
    if (byRating !== 0) return byRating;
    return byName(a, b);
  });
}

/**
 * SalonProvider.load — a salon's "starting from" price is its cheapest
 * service with a parseable price.
 */
export function minPriceBySalon(
  services: { salon_id: string; price: unknown }[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of services) {
    const price = parseNumber(s.price);
    if (price === null) continue;
    const current = out.get(s.salon_id);
    if (current === undefined || price < current) out.set(s.salon_id, price);
  }
  return out;
}

// ── Working hours (models/working_hours.dart, services/slot_engine.dart) ────

/** WorkingHours.to12Hour — "13:30" → "1:30 PM". */
function to12Hour(value: string | null | undefined): string {
  if (!value) return "";
  const [h, m] = value.split(":");
  if (m === undefined) return value;
  const hour = Number.parseInt(h, 10) || 0;
  const period = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${m} ${period}`;
}

/**
 * SlotEngine.isOpenOn — without open/close times AND at least one working
 * day, the app offers no bookable slots at all.
 */
export function hasBookableHours(wh: WorkingHoursJson): boolean {
  return Boolean(wh.open && wh.close && Array.isArray(wh.days) && wh.days.length > 0);
}

export function workingHoursSummary(wh: WorkingHoursJson): string | null {
  if (!wh.open || !wh.close) return null;
  const days = Array.isArray(wh.days) && wh.days.length ? wh.days.join(", ") : "No days set";
  const brk =
    wh.hasBreak && wh.breakStart && wh.breakEnd
      ? ` · break ${to12Hour(wh.breakStart)} – ${to12Hour(wh.breakEnd)}`
      : "";
  return `${days} · ${to12Hour(wh.open)} – ${to12Hour(wh.close)}${brk}`;
}

// ── Home "Popular Services" row (models/service_category.dart) ─────────────

/**
 * kServiceCategories — HARDCODED in the app. Each tile is matched to a
 * `master_categories` row by name at tap time — see matchHomeTile().
 */
export const HOME_CATEGORY_TILES = [
  { label: "Facial", categoryName: "Skin & Face" },
  { label: "Haircut", categoryName: "Hair Services" },
  { label: "Shaving", categoryName: "Grooming Services (Men)" },
  { label: "Bridal", categoryName: "Bridal & Special" },
  { label: "Make Up", categoryName: "Beauty Services" },
  { label: "Spa", categoryName: "Premium Services" },
  { label: "Massage", categoryName: "Body Services" },
] as const;

/**
 * HomeScreen._openCategory / CategoryPage._idFor — case-insensitive, and a
 * partial match in EITHER direction counts; the FIRST category in the order
 * the database returned them wins. No match → the salon list opens with no
 * category filter (every salon). MasterCategory.fromMap turns a null name into
 * "", which partially matches every tile — mirrored here too.
 */
export function matchHomeTile<T extends { id: string; name: string | null }>(
  categoryName: string,
  categoriesInDbOrder: T[],
): T | null {
  const needle = categoryName.toLowerCase();
  for (const c of categoriesInDbOrder) {
    const n = (c.name ?? "").toLowerCase();
    if (n === needle || n.includes(needle) || needle.includes(n)) return c;
  }
  return null;
}

// ── Offers (models/offer.dart, providers/offers_provider.dart) ─────────────

export type OfferKind = "percent" | "flat" | "free";

export interface ParsedOffer {
  id: string;
  salonId: string;
  title: string;
  discount: number;
  kind: OfferKind;
  maxDiscount: number | null;
  minOrder: number | null;
  freeItem: string | null;
  code: string | null;
  active: boolean;
  validFrom: Date | null;
  validUntil: Date | null;
  createdAt: Date | null;
}

/** Offer.fromMap — note `active` defaults to TRUE when the column is null. */
export function parseOffer(row: OfferRow): ParsedOffer {
  const t = (row.offer_type ?? "").toString().trim().toLowerCase();
  return {
    id: row.id,
    salonId: row.salon_id,
    title: (row.title ?? "").trim(),
    discount: parseOfferInt(row.discount),
    kind: t === "flat" ? "flat" : t === "free" ? "free" : "percent",
    maxDiscount: parseNumber(row.max_discount),
    minOrder: parseNumber(row.min_order),
    freeItem: row.free_item?.trim() || null,
    code: row.code?.trim() || null,
    active: row.active ?? true,
    validFrom: parseDate(row.valid_from),
    validUntil: parseDate(row.valid_until),
    createdAt: parseDate(row.created_at),
  };
}

/** Offer.hasBenefit */
function hasBenefit(o: ParsedOffer): boolean {
  return o.kind === "free" ? Boolean(o.freeItem) : o.discount > 0;
}

export type OfferStatus = "live" | "scheduled" | "expired" | "inactive" | "no-benefit";

/**
 * "live" is exactly what customers see: Offer.isUsable (active, started, not
 * ended) AND hasBenefit — the filter OffersProvider.load applies.
 */
export function offerStatus(o: ParsedOffer, now = new Date()): OfferStatus {
  if (!o.active) return "inactive";
  if (o.validUntil && o.validUntil.getTime() <= now.getTime()) return "expired";
  if (o.validFrom && o.validFrom.getTime() > now.getTime()) return "scheduled";
  if (!hasBenefit(o)) return "no-benefit";
  return "live";
}

/** Rupees as the app prints them: whole amounts without decimals, others with (salon_detail_screen.dart _priceText). */
export function formatRupees(v: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: v % 1 === 0 ? 0 : 2,
  }).format(v);
}

const hasCap = (o: ParsedOffer) => (o.maxDiscount ?? 0) > 0;
const hasMinOrder = (o: ParsedOffer) => (o.minOrder ?? 0) > 0;

/** Offer.headline — "50% OFF · up to ₹50", "₹100 OFF", "Free Head massage". */
export function offerHeadline(o: ParsedOffer): string {
  if (o.kind === "percent") {
    return hasCap(o)
      ? `${o.discount}% OFF · up to ${formatRupees(o.maxDiscount!)}`
      : `${o.discount}% OFF`;
  }
  if (o.kind === "flat") return `${formatRupees(o.discount)} OFF`;
  return `Free ${o.freeItem ?? ""}`.trim();
}

/** Offer.minOrderNote */
export function offerMinOrderNote(o: ParsedOffer): string | null {
  return hasMinOrder(o) ? `On orders above ${formatRupees(o.minOrder!)}` : null;
}

/** Offer.discountFor on Offer.referenceOrder (₹1000) — Offer.rankValue. */
function rankValue(o: ParsedOffer): number {
  const subtotal = 1000;
  if (hasMinOrder(o) && subtotal < o.minOrder!) return 0;
  let raw = 0;
  if (o.kind === "percent") {
    const pct = (subtotal * Math.min(100, Math.max(0, o.discount))) / 100;
    raw = hasCap(o) && pct > o.maxDiscount! ? o.maxDiscount! : pct;
  } else if (o.kind === "flat") {
    raw = o.discount;
  }
  return Math.round(Math.min(subtotal, Math.max(0, raw)));
}

/** Offer.compareBest — biggest real saving first, then the bigger number. */
export function compareBestOffer(a: ParsedOffer, b: ParsedOffer): number {
  const bySaving = rankValue(b) - rankValue(a);
  return bySaving !== 0 ? bySaving : b.discount - a.discount;
}

// ── Referral program (server values — hardcoded in the SQL functions) ──────

/**
 * From the Customer App's supabase/migrations: apply_user_referral() +
 * referrals_on_booking_completed() award POINTS_PER_REFERRAL to the referrer
 * when the referred friend's first booking completes (current rule, migration
 * 20261004000000); redeem_referral_points() turns REDEEM_THRESHOLD points
 * into a fixed REDEEM_RUPEES discount and resets the balance to 0;
 * salon_referral_points() gives every salon 100 + 1 per customer signed up
 * with its code, capped at SALON_POINTS_CAP. Changing any of these means
 * changing those SQL functions — nothing here can.
 */
export const REFERRAL_RULES = {
  POINTS_PER_REFERRAL: 5,
  REDEEM_THRESHOLD: 50,
  REDEEM_RUPEES: 50,
  SALON_POINTS_BASE: 100,
  SALON_POINTS_CAP: 250,
} as const;
