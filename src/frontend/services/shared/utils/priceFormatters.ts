/**
 * Pure price formatting utilities - no domain logic.
 * Stocks: 2 decimal places
 * Crypto: up to 8 decimal places based on price magnitude
 */

const roundToTick = (price: number, tickSize: number): number => {
  return Math.round(price / tickSize) * tickSize;
};

export function formatStockPrice(value: number): string {
  if (!Number.isFinite(value)) return '0.00';
  return value.toFixed(2);
}

export function formatCryptoPrice(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const pipSize = value >= 1000 ? 0.1 : value >= 100 ? 0.01 : value >= 1 ? 0.0001 : 0.00000001;
  const rounded = roundToTick(value, pipSize);
  const decimals = pipSize.toString().split('.')[1]?.length ?? 0;
  return rounded.toFixed(decimals);
}

export function getCryptoPipSize(price: number): number {
  if (price >= 1000) return 0.1;
  if (price >= 100) return 0.01;
  if (price >= 1) return 0.001;
  return 0.0001;
}