import Link from "next/link";
import { getCustomerAppSalons, getTop10Points } from "@/lib/api/catalog";
import { getAllOffers } from "@/lib/api/offers";
import {
  TOP10_BASE_POINTS,
  compareBestOffer,
  displayRating,
  inArea,
  matchesGender,
  offerHeadline,
  offerMinOrderNote,
  offerStatus,
  orderTop10,
  orderTopRated,
  parseOffer,
} from "@/lib/customer-app/rules";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Td } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { Thumb } from "@/components/ui/Thumb";
import { formatRating } from "@/lib/utils";

type Params = { area?: string; gender?: string };

const INPUT =
  "rounded-md border border-border px-3 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

export default async function DiscoveryPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const area = params.area?.trim() || null;
  const gender = params.gender === "men" || params.gender === "women" ? params.gender : null;

  let salons;
  try {
    salons = await getCustomerAppSalons();
  } catch (e) {
    return <ErrorCard error={e} fallback="Could not load salons." />;
  }

  // Both are best-effort in the app too: without referral points every salon
  // counts as the base 100, and without offers the Offer Zone hides itself.
  const [pointsR, offersR] = await Promise.allSettled([getTop10Points(), getAllOffers()]);
  const points = pointsR.status === "fulfilled" ? pointsR.value : new Map<string, number>();
  const liveOffers =
    offersR.status === "fulfilled"
      ? offersR.value.map(parseOffer).filter((o) => offerStatus(o) === "live")
      : [];

  const areas = Array.from(
    new Set(salons.map((s) => (s.city ?? "").trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));

  const visible = salons.filter((s) => inArea(s, area) && matchesGender(s, gender));
  const top10 = orderTop10(visible, points).slice(0, 10);
  const topRated = orderTopRated(visible);
  const deals = topRated
    .flatMap((s) =>
      liveOffers.filter((o) => o.salonId === s.id).map((offer) => ({ salon: s, offer })),
    )
    .sort((a, b) => compareBestOffer(a.offer, b.offer));

  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="space-y-3">
          <p className="text-sm text-muted">
            A preview of the Customer App&apos;s home screen, built with the
            app&apos;s own ordering rules (home_screen.dart, salon_provider.dart).
            Pick the area a customer has selected and their gender switch.
            Distance-based sorting depends on the customer&apos;s live location,
            so it can&apos;t be previewed here.
          </p>
          <form className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Customer&apos;s area</label>
              <select name="area" defaultValue={area ?? ""} className={`${INPUT} w-52`}>
                <option value="">No area selected (all salons)</option>
                {areas.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Gender switch</label>
              <select name="gender" defaultValue={gender ?? ""} className={`${INPUT} w-36`}>
                <option value="">All</option>
                <option value="men">Men</option>
                <option value="women">Women</option>
              </select>
            </div>
            <button
              type="submit"
              className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
            >
              Preview
            </button>
          </form>
          {pointsR.status === "rejected" && (
            <p className="text-xs text-warning">
              Referral points couldn&apos;t be loaded, so every salon counts as{" "}
              {TOP10_BASE_POINTS} — the same fallback the app uses.
            </p>
          )}
        </CardBody>
      </Card>

      {visible.length === 0 ? (
        <Card>
          {area && !salons.some((s) => inArea(s, area)) ? (
            <EmptyState
              title="Not serving this area"
              description="No salon matches this area, so the app shows its “not serving here yet” page."
            />
          ) : (
            <EmptyState
              title="No salons for this gender switch"
              description="The home rows are empty for this customer."
            />
          )}
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader title="Groomto Top 10" />
            <p className="px-5 pt-3 text-xs text-muted">
              Ranked only by salon referral points (100 + 1 per customer who signed
              up with the salon&apos;s code, max 250), then visibility score, then name.
            </p>
            <Table>
              <Thead>
                <Th>#</Th>
                <Th>Salon</Th>
                <Th>Referral points</Th>
                <Th>Visibility score</Th>
                <Th>Rating</Th>
              </Thead>
              <Tbody>
                {top10.map((s, i) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <Td className="font-semibold text-brand">{i + 1}</Td>
                    <Td>
                      <Link href={`/user-app/services/${s.id}`} className="flex items-center gap-2.5 hover:text-brand">
                        <Thumb src={s.photos[0]} size={32} placeholder="" />
                        <span>
                          <span className="font-medium">{s.name}</span>
                          <span className="block text-xs text-muted">{s.city ?? "—"}</span>
                        </span>
                      </Link>
                    </Td>
                    <Td>{points.get(s.id) ?? TOP10_BASE_POINTS}</Td>
                    <Td>{s.visibility_score.toFixed(0)}</Td>
                    <Td>{formatRating(s.rating_avg, s.rating_count)}</Td>
                  </tr>
                ))}
              </Tbody>
            </Table>
          </Card>

          <Card>
            <CardHeader title="Offer Zone" />
            <p className="px-5 pt-3 text-xs text-muted">
              Every live offer of every salon in view, biggest real saving on a
              ₹1,000 order first. Hidden in the app when there are none.
            </p>
            {deals.length === 0 ? (
              <CardBody>
                <p className="text-sm text-muted">No live offers — this section is hidden for the customer.</p>
              </CardBody>
            ) : (
              <Table>
                <Thead>
                  <Th>#</Th>
                  <Th>Salon</Th>
                  <Th>Deal</Th>
                  <Th>Terms</Th>
                  <Th>Code</Th>
                </Thead>
                <Tbody>
                  {deals.map(({ salon, offer }, i) => (
                    <tr key={offer.id} className="hover:bg-slate-50">
                      <Td className="text-muted">{i + 1}</Td>
                      <Td>{salon.name}</Td>
                      <Td className="font-medium text-foreground">{offerHeadline(offer)}</Td>
                      <Td>{offerMinOrderNote(offer) ?? "—"}</Td>
                      <Td className="font-mono text-xs">{offer.code ?? "—"}</Td>
                    </tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </Card>

          <Card>
            <CardHeader title="Recommended for you" />
            <p className="px-5 pt-3 text-xs text-muted">
              Highest rated first (salons with no ratings count as 0), then name.
              Showing the first 10 of {topRated.length}.
            </p>
            <Table>
              <Thead>
                <Th>#</Th>
                <Th>Salon</Th>
                <Th>Rating used for ordering</Th>
                <Th>Shown</Th>
              </Thead>
              <Tbody>
                {topRated.slice(0, 10).map((s, i) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <Td className="text-muted">{i + 1}</Td>
                    <Td>
                      <Link href={`/user-app/services/${s.id}`} className="hover:text-brand hover:underline">
                        {s.name}
                      </Link>
                    </Td>
                    <Td>{displayRating(s).toFixed(1)}</Td>
                    <Td>{formatRating(s.rating_avg, s.rating_count)}</Td>
                  </tr>
                ))}
              </Tbody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
