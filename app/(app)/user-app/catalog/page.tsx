import Link from "next/link";
import { Scissors } from "lucide-react";
import {
  getAllServices,
  getCategories,
  getCustomerAppSalons,
  sortByName,
} from "@/lib/api/catalog";
import { formatRupees, parseNumber } from "@/lib/customer-app/rules";
import { Card, CardHeader } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Td } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { StatCard } from "@/components/ui/StatCard";
import { Thumb } from "@/components/ui/Thumb";

type Params = { q?: string; category?: string; salon?: string; missing?: string };

/** Rows rendered at once — filters narrow the list, nothing is hidden from the counts. */
const MAX_ROWS = 300;

const INPUT =
  "rounded-md border border-border px-3 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

export default async function AllServicesPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;

  let services;
  let salons;
  let categories;
  try {
    [services, salons, categories] = await Promise.all([
      getAllServices(),
      getCustomerAppSalons(),
      getCategories().catch(() => []),
    ]);
  } catch (e) {
    return <ErrorCard error={e} fallback="Could not load services." />;
  }

  const salonName = new Map(salons.map((s) => [s.id, s.name]));
  const categoryName = new Map(categories.map((c) => [c.id, c.name ?? ""]));

  const term = (params.q ?? "").trim().toLowerCase();
  const matching = services.filter((s) => {
    if (term && !(s.name ?? "").toLowerCase().includes(term)) return false;
    if (params.category && s.category_id !== params.category) return false;
    if (params.salon && s.salon_id !== params.salon) return false;
    if (params.missing === "price" && parseNumber(s.price) !== null) return false;
    if (params.missing === "picture" && s.image_url) return false;
    return true;
  });
  matching.sort(
    (a, b) =>
      (salonName.get(a.salon_id) ?? "").localeCompare(salonName.get(b.salon_id) ?? "") ||
      (a.name ?? "").localeCompare(b.name ?? ""),
  );
  const filtered = Boolean(params.q || params.category || params.salon || params.missing);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Services listed" value={services.length} icon={Scissors} />
        <StatCard
          label="With a picture"
          value={services.filter((s) => s.image_url).length}
          tone="success"
          hint="The rest show a stock placeholder"
        />
        <StatCard
          label="Without a price"
          value={services.filter((s) => parseNumber(s.price) === null).length}
          tone="warning"
          hint="Shown to customers with no price"
        />
      </div>

      <form className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Service name</label>
          <input type="search" name="q" defaultValue={params.q ?? ""} className={`${INPUT} w-56`} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Salon</label>
          <select name="salon" defaultValue={params.salon ?? ""} className={`${INPUT} w-48`}>
            <option value="">All salons</option>
            {salons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        {categories.length > 0 && (
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Category</label>
            <select name="category" defaultValue={params.category ?? ""} className={`${INPUT} w-48`}>
              <option value="">All categories</option>
              {sortByName(categories).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Show</label>
          <select name="missing" defaultValue={params.missing ?? ""} className={`${INPUT} w-44`}>
            <option value="">Everything</option>
            <option value="picture">Missing a picture</option>
            <option value="price">Missing a price</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
        >
          Apply
        </button>
        {filtered && (
          <Link href="/user-app/catalog" className="pb-1.5 text-sm text-muted hover:text-foreground">
            Clear
          </Link>
        )}
      </form>

      <Card>
        <CardHeader
          title={`${matching.length} service${matching.length === 1 ? "" : "s"}${
            matching.length > MAX_ROWS ? ` — showing the first ${MAX_ROWS}, narrow the filters to see more` : ""
          }`}
        />
        {matching.length === 0 ? (
          <EmptyState title="No services match" description="Try different filters." />
        ) : (
          <Table>
            <Thead>
              <Th>Picture</Th>
              <Th>Service</Th>
              <Th>Salon</Th>
              <Th>Category</Th>
              <Th>Duration</Th>
              <Th>Price</Th>
              <Th>{""}</Th>
            </Thead>
            <Tbody>
              {matching.slice(0, MAX_ROWS).map((s) => {
                const price = parseNumber(s.price);
                const options = Array.isArray(s.variants) ? s.variants.length : 0;
                return (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <Td>
                      <Thumb src={s.image_url} size={40} placeholder="Stock" />
                    </Td>
                    <Td className="font-medium text-foreground">
                      {s.name ?? "—"}
                      {options > 0 && (
                        <span className="ml-1.5 text-xs font-normal text-muted">
                          {options} option{options === 1 ? "" : "s"}
                        </span>
                      )}
                    </Td>
                    <Td>{salonName.get(s.salon_id) ?? "Unknown salon"}</Td>
                    <Td>{(s.category_id && categoryName.get(s.category_id)) || "—"}</Td>
                    <Td>{s.duration ? `${s.duration} min` : "—"}</Td>
                    <Td>
                      {price !== null ? formatRupees(price) : <Badge tone="warning">No price</Badge>}
                    </Td>
                    <Td>
                      <Link
                        href={`/user-app/services/${s.salon_id}`}
                        className="text-sm font-medium text-brand hover:underline"
                      >
                        Edit
                      </Link>
                    </Td>
                  </tr>
                );
              })}
            </Tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
