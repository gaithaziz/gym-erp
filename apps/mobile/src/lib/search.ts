export function normalizeSearchQuery(query: string) {
  return query.trim().toLowerCase();
}

export function matchesSearchQuery(query: string, values: Array<string | null | undefined>) {
  const needle = normalizeSearchQuery(query);
  if (!needle) return true;
  return values
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .some((value) => value.toLowerCase().includes(needle));
}
