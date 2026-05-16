/**
 * Symbol normalization utilities - converts between display and API formats.
 * Stocks: AAPL (no change)
 * Crypto: BTC/USD (display) ↔ BTCUSD (API)
 */

export function normalizeCryptoSymbol(symbol: string): string {
  if (symbol.includes('/')) return symbol;
  if (symbol.endsWith('USDT')) return `${symbol.slice(0, -4)}/USDT`;
  if (symbol.endsWith('USD')) return `${symbol.slice(0, -3)}/USD`;
  return symbol;
}

export function toApiSymbol(symbol: string): string {
  return symbol.replace('/', '');
}

export function toDisplaySymbol(symbol: string): string {
  return normalizeCryptoSymbol(symbol);
}