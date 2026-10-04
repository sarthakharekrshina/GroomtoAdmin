"use client";

import { useState, useTransition } from "react";
import {
  clearSalonRating,
  removeServiceImage,
  setSalonRating,
  setServicePrice,
  uploadServiceImage,
} from "@/app/actions/admin";
import type { ServiceVariant } from "@/types/admin";

const PRICE_RE = /^\d+(\.\d{1,2})?$/;

const INPUT =
  "rounded-md border border-border px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";
const SAVE_BUTTON =
  "rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60";

type Message = { ok: boolean; text: string } | null;

/**
 * Flat price plus one price box per variant. Labels and durations are passed
 * back unchanged — this editor only touches prices.
 */
export function ServicePriceForm({
  serviceId,
  salonId,
  currentPrice,
  currentVariants,
}: {
  serviceId: string;
  salonId: string;
  currentPrice: string;
  currentVariants: ServiceVariant[];
}) {
  const [price, setPrice] = useState(currentPrice);
  const [variantPrices, setVariantPrices] = useState(
    currentVariants.map((v) => String(v.price ?? "")),
  );
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<Message>(null);

  function handleSave() {
    const trimmed = price.trim();
    if (!PRICE_RE.test(trimmed)) {
      setMessage({ ok: false, text: "Enter a valid price." });
      return;
    }
    if (variantPrices.some((p) => !PRICE_RE.test(p.trim()))) {
      setMessage({ ok: false, text: "Every option needs a valid price." });
      return;
    }
    const variants =
      currentVariants.length > 0
        ? currentVariants.map((v, i) => ({ ...v, price: variantPrices[i].trim() }))
        : null;

    startTransition(async () => {
      const result = await setServicePrice(serviceId, salonId, trimmed, variants);
      setMessage(
        result.ok
          ? { ok: true, text: "Saved." }
          : { ok: false, text: result.error ?? "Update failed." },
      );
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-24 text-xs text-muted">
          {currentVariants.length > 0 ? "Base price ₹" : "Price ₹"}
        </span>
        <input
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className={`${INPUT} w-24`}
        />
      </div>
      {currentVariants.map((v, i) => (
        <div key={`${v.label}-${i}`} className="flex flex-wrap items-center gap-2">
          <span className="w-24 truncate text-xs text-muted" title={v.label}>
            {v.label} ₹
          </span>
          <input
            inputMode="decimal"
            value={variantPrices[i]}
            onChange={(e) =>
              setVariantPrices((prev) =>
                prev.map((p, j) => (j === i ? e.target.value : p)),
              )
            }
            className={`${INPUT} w-24`}
          />
        </div>
      ))}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className={SAVE_BUTTON}
        >
          {isPending ? "Saving…" : "Save"}
        </button>
        {message && (
          <p className={`text-xs ${message.ok ? "text-success" : "text-danger"}`}>
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}

export function SalonRatingForm({
  salonId,
  currentAvg,
  currentCount,
  overrideActive,
}: {
  salonId: string;
  currentAvg: number | null;
  currentCount: number | null;
  overrideActive: boolean;
}) {
  const [avg, setAvg] = useState(currentAvg?.toString() ?? "0");
  const [count, setCount] = useState(currentCount?.toString() ?? "0");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<Message>(null);

  function handleSave() {
    const parsedAvg = Number(avg);
    const parsedCount = Number(count);
    if (Number.isNaN(parsedAvg) || parsedAvg < 0 || parsedAvg > 5) {
      setMessage({ ok: false, text: "Rating must be between 0 and 5." });
      return;
    }
    if (!Number.isInteger(parsedCount) || parsedCount < 0) {
      setMessage({ ok: false, text: "Count must be a whole number, 0 or more." });
      return;
    }
    startTransition(async () => {
      const result = await setSalonRating(salonId, parsedAvg, parsedCount);
      setMessage(
        result.ok
          ? { ok: true, text: "Rating updated." }
          : { ok: false, text: result.error ?? "Update failed." },
      );
    });
  }

  function handleClear() {
    startTransition(async () => {
      const result = await clearSalonRating(salonId);
      setMessage(
        result.ok
          ? { ok: true, text: "Override removed — rating restored from reviews." }
          : { ok: false, text: result.error ?? "Update failed." },
      );
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      {overrideActive && (
        <p className="w-full text-xs font-medium text-gold">
          Admin override active — new reviews won&apos;t change this rating
          until the override is removed.
        </p>
      )}
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">
          Rating (0–5)
        </label>
        <input
          type="number"
          min={0}
          max={5}
          step={0.1}
          value={avg}
          onChange={(e) => setAvg(e.target.value)}
          className={`${INPUT} w-24`}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">
          Number of ratings
        </label>
        <input
          type="number"
          min={0}
          step={1}
          value={count}
          onChange={(e) => setCount(e.target.value)}
          className={`${INPUT} w-28`}
        />
      </div>
      <button
        type="button"
        onClick={handleSave}
        disabled={isPending}
        className={SAVE_BUTTON}
      >
        {isPending ? "Saving…" : overrideActive ? "Update override" : "Set override"}
      </button>
      {overrideActive && (
        <button
          type="button"
          onClick={handleClear}
          disabled={isPending}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-slate-50 disabled:opacity-60"
        >
          Remove override
        </button>
      )}
      {message && (
        <p className={`text-xs ${message.ok ? "text-success" : "text-danger"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}

/**
 * Thumbnail + upload/remove. With no image_url set, the Customer app shows a
 * stock placeholder, so that's what "No picture" means to a customer.
 */
export function ServiceImageForm({
  serviceId,
  salonId,
  currentUrl,
}: {
  serviceId: string;
  salonId: string;
  currentUrl: string | null;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<Message>(null);

  function handleUpload() {
    if (!file) {
      setMessage({ ok: false, text: "Choose a picture first." });
      return;
    }
    const data = new FormData();
    data.set("serviceId", serviceId);
    data.set("salonId", salonId);
    data.set("file", file);
    startTransition(async () => {
      const result = await uploadServiceImage(data);
      if (result.ok) {
        setFile(null);
        setInputKey((k) => k + 1);
      }
      setMessage(
        result.ok
          ? { ok: true, text: "Picture updated." }
          : { ok: false, text: result.error ?? "Upload failed." },
      );
    });
  }

  function handleRemove() {
    startTransition(async () => {
      const result = await removeServiceImage(serviceId, salonId);
      setMessage(
        result.ok
          ? { ok: true, text: "Picture removed." }
          : { ok: false, text: result.error ?? "Update failed." },
      );
    });
  }

  return (
    <div className="flex items-start gap-3">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-slate-50">
        {currentUrl ? (
          // Supabase public URL; next/image would need remotePatterns config
          // for a 64px admin thumbnail.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={currentUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="px-1 text-center text-[10px] text-muted">
            No picture
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        <input
          key={inputKey}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-52 text-xs text-muted file:mr-2 file:rounded-md file:border file:border-border file:bg-surface file:px-2 file:py-1 file:text-xs file:font-medium file:text-foreground"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleUpload}
            disabled={isPending || !file}
            className={SAVE_BUTTON}
          >
            {isPending ? "Saving…" : "Upload"}
          </button>
          {currentUrl && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={isPending}
              className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-slate-50 disabled:opacity-60"
            >
              Remove
            </button>
          )}
        </div>
        {message && (
          <p className={`text-xs ${message.ok ? "text-success" : "text-danger"}`}>
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
