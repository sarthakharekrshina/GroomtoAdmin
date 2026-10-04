type PageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

/**
 * Reads every row of a query, a page at a time. Supabase caps one response at
 * the project's max-rows setting (1000 by default) whatever `.limit()` asks
 * for, so a plain select silently truncates a large table.
 *
 * `build` must return a fresh, stably ordered query for each range — query
 * builders can't be reused. Paging advances by the rows actually returned and
 * stops on an empty page, so a server cap smaller than `pageSize` can't cut
 * the result short.
 */
export async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<PageResult<T>>,
  { pageSize = 1000, maxRows = 50000 } = {},
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  while (from < maxRows) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    if (page.length === 0) break;
    rows.push(...page);
    from += page.length;
  }
  return rows;
}
