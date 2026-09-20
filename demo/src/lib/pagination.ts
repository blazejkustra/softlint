export type Page = { limit: number; cursor?: string };

/** Reads `?limit=` and `?cursor=` from a query string. `limit` is clamped to 1–100 and defaults to 20. */
export function readPage(query: Record<string, unknown>): Page {
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const cursor = typeof query.cursor === "string" && query.cursor ? query.cursor : undefined;
  return { limit, cursor };
}
