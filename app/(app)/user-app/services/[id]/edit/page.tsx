import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCatalogSalon } from "@/lib/api/catalog";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import {
  SalonProfileForm,
  type SalonProfileInitial,
} from "@/components/user-app/SalonProfileForm";
import type { WorkingHoursJson } from "@/types/admin";

function text(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

export default async function EditSalonProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let raw;
  try {
    raw = (await getCatalogSalon(id)) as unknown as Record<string, unknown> | null;
  } catch (e) {
    return <ErrorCard error={e} fallback="Could not load this salon." />;
  }
  if (!raw) {
    return (
      <Card>
        <EmptyState title="Salon not found" />
      </Card>
    );
  }

  // Prefilled exactly like the Partner app's edit_salon_info_screen.dart:
  // line 1 falls back to the old one-line `address`, and an unknown type
  // shows as unisex.
  const t = text(raw.type).toLowerCase();
  const wh = raw.working_hours;
  const initial: SalonProfileInitial = {
    name: text(raw.name),
    owner_name: text(raw.owner_name),
    type: t === "men" || t === "women" || t === "unisex" ? t : "unisex",
    description: text(raw.description),
    address_line1: text(raw.address_line1) || text(raw.address),
    address_line2: text(raw.address_line2),
    landmark: text(raw.landmark),
    city: text(raw.city),
    state: text(raw.state),
    pincode: text(raw.pincode),
    latitude: text(raw.latitude),
    longitude: text(raw.longitude),
    working_hours:
      wh && typeof wh === "object" && !Array.isArray(wh) ? (wh as WorkingHoursJson) : {},
    photos: Array.isArray(raw.photos) ? raw.photos.map(String) : [],
  };

  return (
    <div className="space-y-4">
      <div>
        <Link
          href={`/user-app/services/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to {initial.name || "salon"}
        </Link>
        <h2 className="mt-2 text-xl font-semibold text-foreground">Edit salon profile</h2>
      </div>

      <Card>
        <CardHeader title="What customers see" />
        <CardBody>
          <SalonProfileForm salonId={id} initial={initial} />
        </CardBody>
      </Card>

      <p className="text-xs text-muted">
        Not editable here on purpose: phone and email (used for sign-in codes and WhatsApp
        alerts), bank, UPI and tax details, commission (on the Partner App salon page), and the
        salon&apos;s own online/offline switch.
      </p>
    </div>
  );
}
