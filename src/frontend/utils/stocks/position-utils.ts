/**
 * Position action utilities
 */

import { Order, Position } from "@/types";

/**
 * Normalize symbol by removing separators and uppercasing
 */
export function normalizeSymbol(symbol: string): string {
  return symbol
    .replace("/", "")
    .replace("-", "")
    .replace("_", "")
    .toUpperCase()
    .trim();
}

/**
 * Find stale orphan orders (orders without positions older than threshold)
 */
export function findStaleOrphanOrders(
  openOrders: Order[],
  openPositions: Position[],
  excludeOrderIds: string[] = [],
  thresholdMs: number = 5_000,
): Order[] {
  const positionSymbols = new Set(
    openPositions.map((p) => normalizeSymbol(p.symbol)),
  );
  const excluded = new Set(excludeOrderIds);
  const now = Date.now();

  return openOrders.filter((o) => {
    if (excluded.has(o.id)) return false;
    if (positionSymbols.has(normalizeSymbol(o.symbol))) return false;
    if (o.status === "partially_filled") return false;

    const createdAt = Date.parse(o.created_at || o.submitted_at || "");
    if (!Number.isFinite(createdAt)) return false;
    return now - createdAt > thresholdMs;
  });
}
