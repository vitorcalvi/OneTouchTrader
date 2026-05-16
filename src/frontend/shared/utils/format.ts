/**
 * Formatting utilities for display values
 */

import { formatNumber, formatCurrency } from './numbers';

/**
 * Format a number with appropriate suffixes (K, M, B)
 * @param value - The value to format
 * @returns Formatted string (e.g., "1.2M", "345K")
 */
export function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';

  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (absValue >= 1_000_000_000) {
    return `${sign}${(value / 1_000_000_000).toFixed(2)}B`;
  }

  if (absValue >= 1_000_000) {
    return `${sign}${(value / 1_000_000).toFixed(2)}M`;
  }

  if (absValue >= 1_000) {
    return `${sign}${(value / 1_000).toFixed(2)}K`;
  }

  return formatNumber(value, 0);
}

/**
 * Format a large quantity with appropriate decimal places
 * @param value - The quantity to format
 * @returns Formatted quantity string
 */
export function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) return '0';

  if (value === 0) return '0';

  // For very small quantities (crypto), use more decimals
  if (Math.abs(value) < 0.01) {
    return value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  }

  // For normal quantities, remove unnecessary decimals
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

/**
 * Format a date/time to a readable string
 * @param date - Date to format
 * @param format - Format style ('short', 'medium', 'long')
 * @returns Formatted date string
 */
export function formatDate(
  date: string | Date,
  format: 'short' | 'medium' | 'long' = 'medium'
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) return 'Invalid Date';

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: format,
    timeStyle: 'short',
  }).format(dateObj);
}

/**
 * Format a price with appropriate precision based on value
 * @param price - The price to format
 * @returns Formatted price string
 */
export function formatPrice(price: number): string {
  if (!Number.isFinite(price)) return '$0.00';

  // Crypto prices may have more decimals
  if (price < 0.01) {
    return formatCurrency(price, 6);
  }

  // Regular prices
  return formatCurrency(price, 2);
}

/**
 * Format a PnL value with color indicator class name
 * @param pnl - Profit/loss value
 * @returns Object with formatted value and CSS class
 */
export function formatPnl(pnl: number) {
  const formatted = formatCurrency(Math.abs(pnl));
  const sign = pnl >= 0 ? '+' : '-';

  return {
    value: `${sign}${formatted}`,
    isPositive: pnl > 0,
    isNegative: pnl < 0,
    className: pnl >= 0 ? 'text-profit' : 'text-loss',
  };
}
