/**
 * Pure function to detect if a symbol is cryptocurrency.
 * This is the single source of truth for asset class detection.
 * Used by the facade to route to correct OrderManager.
 */
export function isCryptoSymbol(symbol: string): boolean {
  const upper = symbol.toUpperCase();
  if (upper.includes('/')) return true;
  return /^[A-Z0-9]{2,15}USD(T)?$/.test(upper);
}