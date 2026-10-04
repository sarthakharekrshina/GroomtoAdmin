import { getAllServices, getCategories, sortByName } from "@/lib/api/catalog";
import { HOME_CATEGORY_TILES, matchHomeTile } from "@/lib/customer-app/rules";
import { Card, CardHeader } from "@/components/ui/Card";
import { Table, Thead, Th, Tbody, Td } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { EmptyState, FutureFeatureNotice } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { Thumb } from "@/components/ui/Thumb";

export default async function CategoriesPage() {
  let categories;
  let services;
  try {
    [categories, services] = await Promise.all([getCategories(), getAllServices()]);
  } catch (e) {
    return <ErrorCard error={e} fallback="Could not load categories." />;
  }

  // Per category: how many services use it, and how many salons offer it —
  // the latter is what the app filters salons by (SalonProvider categoryIds).
  const serviceCount = new Map<string, number>();
  const salonsWith = new Map<string, Set<string>>();
  for (const s of services) {
    if (!s.category_id) continue;
    serviceCount.set(s.category_id, (serviceCount.get(s.category_id) ?? 0) + 1);
    const set = salonsWith.get(s.category_id) ?? new Set<string>();
    set.add(s.salon_id);
    salonsWith.set(s.category_id, set);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Home “Popular Services” tiles" />
        <p className="px-5 pt-3 text-xs text-muted">
          These 7 tiles are built into the Customer App. When tapped, each picks
          the first category whose name matches — ignoring case, and a partial
          match in either direction counts. If none matches, the salon list
          opens with no category filter and shows every salon.
        </p>
        <Table>
          <Thead>
            <Th>Tile in the app</Th>
            <Th>Looks for</Th>
            <Th>Category it opens</Th>
            <Th>Salons customers will find</Th>
          </Thead>
          <Tbody>
            {HOME_CATEGORY_TILES.map((t) => {
              const cat = matchHomeTile(t.categoryName, categories);
              const exact = cat !== null && (cat.name ?? "").toLowerCase() === t.categoryName.toLowerCase();
              const salons = cat ? (salonsWith.get(cat.id)?.size ?? 0) : null;
              return (
                <tr key={t.label}>
                  <Td className="font-medium text-foreground">{t.label}</Td>
                  <Td>{t.categoryName}</Td>
                  <Td>
                    {cat === null ? (
                      <Badge tone="danger">None — shows every salon</Badge>
                    ) : exact ? (
                      <Badge tone="success">{cat.name}</Badge>
                    ) : (
                      <Badge tone="warning">Partial match: {cat.name || "(blank name)"}</Badge>
                    )}
                  </Td>
                  <Td>
                    {salons === null ? (
                      "All salons"
                    ) : salons > 0 ? (
                      salons
                    ) : (
                      <Badge tone="warning">0 — empty list</Badge>
                    )}
                  </Td>
                </tr>
              );
            })}
          </Tbody>
        </Table>
      </Card>

      <Card>
        <CardHeader title={`All categories (${categories.length})`} />
        {categories.length === 0 ? (
          <EmptyState title="No categories" />
        ) : (
          <Table>
            <Thead>
              <Th>Icon</Th>
              <Th>Name</Th>
              <Th>Description</Th>
              <Th>Services</Th>
              <Th>Salons</Th>
            </Thead>
            <Tbody>
              {sortByName(categories).map((c) => {
                const icon = c.icon ?? "";
                return (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <Td>
                      {/^https?:\/\//.test(icon) ? (
                        <Thumb src={icon} size={32} />
                      ) : (
                        <span className="text-xs text-muted">{icon || "—"}</span>
                      )}
                    </Td>
                    <Td className="font-medium text-foreground">{c.name || "(blank name)"}</Td>
                    <Td className="max-w-md whitespace-normal text-muted">{c.description || "—"}</Td>
                    <Td>{serviceCount.get(c.id) ?? 0}</Td>
                    <Td>{salonsWith.get(c.id)?.size ?? 0}</Td>
                  </tr>
                );
              })}
            </Tbody>
          </Table>
        )}
      </Card>

      <FutureFeatureNotice reason="Read-only on purpose. Renaming or adding a category can change which category a home tile opens (the app matches names loosely and takes the first hit), and the category table's write rules exist only in the live database. Making categories and their home tiles safely editable needs a Customer App release that links tiles to categories by id." />
    </div>
  );
}
