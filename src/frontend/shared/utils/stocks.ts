/**
 * Stock and trading-specific utilities
 */

import type { Position, Order } from '../types';

/**
 * Check if a symbol is a cryptocurrency
 * @param symbol - The symbol to check
 * @returns true if symbol is crypto
 */
export function isCryptoSymbol(symbol: string): boolean {
  const upper = symbol.toUpperCase();
  if (upper.includes('/')) return true;
  return /^[A-Z0-9]{2,15}USD(T)?$/.test(upper);
}

/**
 * Normalize a crypto symbol to Alpaca format
 * @param symbol - The symbol to normalize
 * @returns Normalized symbol (e.g., "BTC/USD")
 */
export function normalizeCryptoSymbol(symbol: string): string {
  if (symbol.includes('/')) return symbol;
  if (symbol.endsWith('USDT')) return `${symbol.slice(0, -4)}/USDT`;
  if (symbol.endsWith('USD')) return `${symbol.slice(0, -3)}/USD`;
  return symbol;
}

/**
 * Convert position symbol to API format (remove / for crypto)
 * @param symbol - The symbol to convert
 * @returns API-formatted symbol
 */
export function toPositionSymbol(symbol: string): string {
  if (isCryptoSymbol(symbol)) return symbol.replace('/', '');
  return symbol;
}

/**
 * Calculate break-even price considering fees
 * @param entryPrice - Entry price
 * @param isCrypto - Whether this is a crypto position
 * @param orderType - Type of order ('market', 'limit', etc.)
 * @returns Break-even price
 */
export function calculateBreakEven(entryPrice: number, isCrypto: boolean, orderType: 'market' | 'limit' | string): number {
  // Simple approximation - can be enhanced with actual fee calculations
  const feeMultiplier = isCrypto ? 0.001 : 0.001; // 0.1% fee approximation
  return orderType === 'limit'
    ? entryPrice
    : entryPrice * (1 + feeMultiplier);
}

/**
 * Get the opposite side of a trade
 * @param side - Current side
 * @returns Opposite side
 */
export function getOppositeSide(side: 'long' | 'short'): 'short' | 'long' {
  return side === 'long' ? 'short' : 'long';
}

/**
 * Check if an order is active (open or partially filled)
 * @param order - The order to check
 * @returns true if order is active
 */
export function isOrderActive(order: Order): boolean {
  return ['new', 'accepted', 'partially_filled', 'held'].includes(order.status);
}

/**
 * Check if an order is a stop order
 * @param order - The order to check
 * @returns true if order is a stop or stop_limit order
 */
export function isStopOrder(order: Order): boolean {
  return order.type === 'stop' || order.type === 'stop_limit';
}

/**
 * Get stop loss orders for a position
 * @param orders - All orders
 * @param position - The position
 * @returns Array of stop loss orders
 */
export function getStopLossOrders(orders: Order[], position: Position): Order[] {
  const buySellSide: 'buy' | 'sell' = position.side === 'long' ? 'sell' : 'buy';
  return orders.filter(o => isStopOrder(o) && o.side === buySellSide && o.symbol === position.symbol);
}

export function getTrailingStopOrder(orders: Order[], position: Position): Order | undefined {
  const buySellSide: 'buy' | 'sell' = position.side === 'long' ? 'sell' : 'buy';
  return orders.find(o => o.type === 'trailing_stop' && o.side === buySellSide && o.symbol === position.symbol);
}
