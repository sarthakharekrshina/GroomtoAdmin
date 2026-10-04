"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSalonProfile } from "@/app/actions/userApp";
import type { WorkingHoursJson } from "@/types/admin";

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const TYPES = [
  { value: "unisex", label: "Unisex" },
  { value: "men", label: "Men" },
  { value: "women", label: "Women" },
] as const;

const INPUT =
  "w-full rounded-md border border-border px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";
const LABEL = "mb-1 block text-xs font-medium text-muted";

export interface SalonProfileInitial {
  name: string;
  owner_name: string;
  type: string;
  description: string;
  address_line1: string;
  address_line2: string;
  landmark: string;
  city: string;
  state: string;
  pincode: string;
  latitude: string;
  longitude: string;
  working_hours: WorkingHoursJson;
  photos: string[];
}

type Form = Omit<SalonProfileInitial, "working_hours" | "photos"> & {
  days: string[];
  open: string;
  close: string;
  hasBreak: boolean;
  breakStart: string;
  breakEnd: string;
  removed: string[];
};

function toForm(i: SalonProfileInitial): Form {
  const wh = i.working_hours ?? {};
  return {
    name: i.name,
    owner_name: i.owner_name,
    type: i.type,
    description: i.description,
    address_line1: i.address_line1,
    address_line2: i.address_line2,
    landmark: i.landmark,
    city: i.city,
    state: i.state,
    pincode: i.pincode,
    latitude: i.latitude,
    longitude: i.longitude,
    days: Array.isArray(wh.days) ? wh.days.filter((d) => (WEEK as readonly string[]).includes(d)) : [],
    open: wh.open ?? "",
    close: wh.close ?? "",
    hasBreak: wh.hasBreak === true,
    breakStart: wh.breakStart ?? "",
    breakEnd: wh.breakEnd ?? "",
    removed: [],
  };
}

const ADDRESS_KEYS = ["address_line1", "address_line2", "landmark", "city", "state", "pincode"] as const;
const TEXT_KEYS = ["name", "owner_name", "description"] as const;

/** Only what changed — the server rejects "nothing changed" and anything not allowed. */
function diff(
  initial: SalonProfileInitial,
  base: Form,
  f: Form,
): { changes: Record<string, unknown>; labels: string[]; error?: string } {
  const changes: Record<string, unknown> = {};
  const labels: string[] = [];

  for (const k of TEXT_KEYS) {
    if (f[k].trim() !== base[k].trim()) {
      changes[k] = f[k].trim();
      labels.push(k === "owner_name" ? "owner name" : k);
    }
  }
  if (!f.name.trim()) return { changes, labels, error: "Salon name is required." };
  if (f.type !== base.type) {
    changes.type = f.type;
    labels.push("salon type");
  }

  // Address: sent as a full set so the server recomposes `address` from it,
  // exactly as the Partner app's edit screen does.
  if (ADDRESS_KEYS.some((k) => f[k].trim() !== base[k].trim())) {
    if (!f.address_line1.trim()) return { changes, labels, error: "Address line 1 is required." };
    if (f.pincode.trim() && !/^\d{6}$/.test(f.pincode.trim())) {
      return { changes, labels, error: "Pincode must be 6 digits." };
    }
    for (const k of ADDRESS_KEYS) changes[k] = f[k].trim();
    labels.push("address");
  }

  if (f.latitude.trim() !== base.latitude.trim() || f.longitude.trim() !== base.longitude.trim()) {
    const lat = Number(f.latitude);
    const lng = Number(f.longitude);
    if (!f.latitude.trim() || !f.longitude.trim() || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { changes, labels, error: "Enter both latitude and longitude as numbers." };
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return { changes, labels, error: "That location is out of range." };
    }
    changes.latitude = lat;
    changes.longitude = lng;
    labels.push("map location");
  }

  const hoursChanged =
    f.days.slice().sort().join() !== base.days.slice().sort().join() ||
    f.open !== base.open ||
    f.close !== base.close ||
    f.hasBreak !== base.hasBreak ||
    (f.hasBreak && (f.breakStart !== base.breakStart || f.breakEnd !== base.breakEnd));
  if (hoursChanged) {
    if (f.days.length === 0) return { changes, labels, error: "Pick at least one working day." };
    if (!f.open || !f.close) return { changes, labels, error: "Set opening and closing times." };
    if (f.close <= f.open) return { changes, labels, error: "Closing time must be after opening time." };
    if (f.hasBreak) {
      if (!f.breakStart || !f.breakEnd) return { changes, labels, error: "Set both break times." };
      if (!(f.open <= f.breakStart && f.breakStart < f.breakEnd && f.breakEnd <= f.close)) {
        return { changes, labels, error: "The break must fall inside opening hours." };
      }
    }
    changes.working_hours = {
      days: WEEK.filter((d) => f.days.includes(d)),
      open: f.open,
      close: f.close,
      hasBreak: f.hasBreak,
      breakStart: f.hasBreak ? f.breakStart : null,
      breakEnd: f.hasBreak ? f.breakEnd : null,
    };
    labels.push("opening hours");
  }

  if (f.removed.length > 0) {
    changes.photos = initial.photos.filter((p) => !f.removed.includes(p));
    labels.push(`photos (${f.removed.length} removed)`);
  }

  return { changes, labels };
}

export function SalonProfileForm({
  salonId,
  initial,
}: {
  salonId: string;
  initial: SalonProfileInitial;
}) {
  const router = useRouter();
  const confirmRef = useRef<HTMLDialogElement>(null);
  const [base] = useState(() => toForm(initial));
  const [f, setF] = useState<Form>(() => toForm(initial));
  const [pending, setPending] = useState<{ changes: Record<string, unknown>; labels: string[] } | null>(null);
  const [isSaving, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((prev) => ({ ...prev, [k]: v }));

  function review() {
    setError(null);
    const d = diff(initial, base, f);
    if (d.error) {
      setError(d.error);
      return;
    }
    if (d.labels.length === 0) {
      setError("Nothing has changed.");
      return;
    }
    setPending({ changes: d.changes, labels: d.labels });
    confirmRef.current?.showModal();
  }

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL}>Salon name</label>
          <input className={INPUT} value={f.name} onChange={(e) => set("name", e.target.value)} maxLength={100} />
        </div>
        <div>
          <label className={LABEL}>Owner name</label>
          <input className={INPUT} value={f.owner_name} onChange={(e) => set("owner_name", e.target.value)} maxLength={100} />
        </div>
        <div>
          <label className={LABEL}>Salon type</label>
          <select className={INPUT} value={f.type} onChange={(e) => set("type", e.target.value)}>
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={LABEL}>Description</label>
          <textarea
            className={INPUT}
            rows={3}
            maxLength={1000}
            value={f.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Address</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={LABEL}>Address line 1</label>
            <input className={INPUT} value={f.address_line1} onChange={(e) => set("address_line1", e.target.value)} maxLength={200} />
          </div>
          <div>
            <label className={LABEL}>Address line 2</label>
            <input className={INPUT} value={f.address_line2} onChange={(e) => set("address_line2", e.target.value)} maxLength={200} />
          </div>
          <div>
            <label className={LABEL}>Landmark</label>
            <input className={INPUT} value={f.landmark} onChange={(e) => set("landmark", e.target.value)} maxLength={200} />
          </div>
          <div>
            <label className={LABEL}>City</label>
            <input className={INPUT} value={f.city} onChange={(e) => set("city", e.target.value)} maxLength={200} />
          </div>
          <div>
            <label className={LABEL}>State</label>
            <input className={INPUT} value={f.state} onChange={(e) => set("state", e.target.value)} maxLength={200} />
          </div>
          <div>
            <label className={LABEL}>Pincode</label>
            <input className={INPUT} value={f.pincode} onChange={(e) => set("pincode", e.target.value)} maxLength={6} inputMode="numeric" />
          </div>
        </div>
        <p className="mt-2 text-xs text-muted">
          Customers see these joined into one line, the same way the Partner app builds it.
          City also decides which area a salon shows up in.
        </p>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Map location</h3>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className={LABEL}>Latitude</label>
            <input className={`${INPUT} w-40`} value={f.latitude} onChange={(e) => set("latitude", e.target.value)} inputMode="decimal" />
          </div>
          <div>
            <label className={LABEL}>Longitude</label>
            <input className={`${INPUT} w-40`} value={f.longitude} onChange={(e) => set("longitude", e.target.value)} inputMode="decimal" />
          </div>
          {f.latitude && f.longitude && (
            <a
              href={`https://www.google.com/maps?q=${encodeURIComponent(f.latitude)},${encodeURIComponent(f.longitude)}`}
              target="_blank"
              rel="noreferrer"
              className="pb-1.5 text-sm text-brand hover:underline"
            >
              Check on Google Maps
            </a>
          )}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Opening hours</h3>
        <div className="flex flex-wrap gap-1.5">
          {WEEK.map((d) => {
            const on = f.days.includes(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => set("days", on ? f.days.filter((x) => x !== d) : [...f.days, d])}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  on ? "bg-brand text-white" : "bg-slate-100 text-muted hover:text-foreground"
                }`}
              >
                {d}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-4">
          <div>
            <label className={LABEL}>Opens</label>
            <input type="time" className={`${INPUT} w-32`} value={f.open} onChange={(e) => set("open", e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>Closes</label>
            <input type="time" className={`${INPUT} w-32`} value={f.close} onChange={(e) => set("close", e.target.value)} />
          </div>
          <label className="flex items-center gap-1.5 pb-1.5 text-sm text-foreground">
            <input type="checkbox" checked={f.hasBreak} onChange={(e) => set("hasBreak", e.target.checked)} />
            Daily break
          </label>
          {f.hasBreak && (
            <>
              <div>
                <label className={LABEL}>Break from</label>
                <input type="time" className={`${INPUT} w-32`} value={f.breakStart} onChange={(e) => set("breakStart", e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>Break until</label>
                <input type="time" className={`${INPUT} w-32`} value={f.breakEnd} onChange={(e) => set("breakEnd", e.target.value)} />
              </div>
            </>
          )}
        </div>
        <p className="mt-2 text-xs text-muted">
          Customers can only book on the selected days, in 15-minute slots that fit before closing.
        </p>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Photos</h3>
        {initial.photos.length === 0 ? (
          <p className="text-sm text-muted">No photos — customers see stock placeholder photos.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-3">
              {initial.photos.map((p, i) => {
                const removed = f.removed.includes(p);
                return (
                  <div key={p} className="w-28">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p}
                      alt=""
                      className={`h-28 w-28 rounded-lg border border-border object-cover ${removed ? "opacity-30" : ""}`}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        set("removed", removed ? f.removed.filter((x) => x !== p) : [...f.removed, p])
                      }
                      className="mt-1 w-full rounded-md border border-border px-2 py-0.5 text-xs font-medium text-foreground hover:bg-slate-50"
                    >
                      {removed ? "Keep" : i === 0 ? "Remove (cover)" : "Remove"}
                    </button>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted">
              Remove only. Adding or reordering photos stays with the salon — the Partner
              app files photos into its own slots and re-sorts them on every save.
            </p>
          </>
        )}
      </section>

      <div className="flex items-center gap-3 border-t border-border pt-4">
        <button
          type="button"
          onClick={review}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
        >
          Review changes
        </button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>

      <dialog ref={confirmRef} className="rounded-xl border border-border p-0 shadow-lg backdrop:bg-black/30">
        <div className="w-96 p-5">
          <h3 className="text-sm font-semibold text-foreground">Update this salon&apos;s profile?</h3>
          <p className="mt-2 text-sm text-muted">Changing: {pending?.labels.join(", ")}.</p>
          <p className="mt-2 text-sm text-muted">
            Customers see it immediately. The salon gets a notification saying Groomto
            updated their profile, and the before/after values go to Audit Logs.
          </p>
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => confirmRef.current?.close()}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-muted hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSaving || !pending}
              onClick={() =>
                startTransition(async () => {
                  if (!pending) return;
                  setError(null);
                  const result = await updateSalonProfile(salonId, pending.changes);
                  if (!result.ok) {
                    setError(result.error ?? "Could not save.");
                    return;
                  }
                  confirmRef.current?.close();
                  router.push(`/user-app/services/${salonId}`);
                })
              }
              className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
            >
              {isSaving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
