/**
 * Number parsing and calculation utilities
 */

import { validatePercentage } from './validation';

/**
 * Safely parse a value to float, returning default value if result is NaN
 * @param value - The value to parse
 * @param defaultValue - The default value to return if parsing fails (default: 0)
 * @returns Parsed float or default value
 */
export function safeParseFloat(value: any, defaultValue: number = 0): number {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

/**
 * Safely parse a value to integer, returning default value if result is NaN
 * @param value - The value to parse
 * @param defaultValue - The default value to return if parsing fails (default: 0)
 * @returns Parsed integer or default value
 */
export function safeParseInt(value: any, defaultValue: number = 0): number {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

/**
 * Format a number with specified decimal places
 * @param value - The value to format
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted number string
 */
export function formatNumber(value: number, decimals: number = 2): string {
  if (!Number.isFinite(value)) return '0';
  return value.toFixed(decimals);
}

/**
 * Format a number as currency (USD)
 * @param value - The value to format
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted currency string (e.g., "$1,234.56")
 */
export function formatCurrency(value: number, decimals: number = 2): string {
  if (!Number.isFinite(value)) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Format a number as percentage
 * @param value - The value to format (0-100)
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted percentage string (e.g., "12.34%")
 */
export function formatPercentage(value: number, decimals: number = 2): string {
  if (!Number.isFinite(value)) return '0%';
  return `${value.toFixed(decimals)}%`;
}

/**
 * Calculate percentage change between two values
 * @param oldValue - The original value
 * @param newValue - The new value
 * @returns Percentage change
 */
export function calculatePercentageChange(oldValue: number, newValue: number): number {
  if (oldValue === 0) return 0;
  return ((newValue - oldValue) / Math.abs(oldValue)) * 100;
}

/**
 * Clamp a number between min and max values
 * @param value - The value to clamp
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns Clamped value
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Calculates result of adding a percentage to a base value
 */
export function calculatePercentageAddition(base: any, percentage: any): { 
  result: number; 
  percentageValue: number;
  isValid: boolean;
  error?: string;
} {
  const b = parseFloat(base);
  const p = parseFloat(percentage);
  
  const validation = validatePercentage(percentage);
  if (isNaN(b) || !Number.isFinite(b) || !validation.isValid) {
    return { 
      result: isNaN(b) ? 0 : b, 
      percentageValue: 0,
      isValid: false,
      error: validation.error || 'Invalid number'
    };
  }
  
  // The test expects -100 + 10% = -110 (increasing the magnitude of the negative number)
  // Logic: base + (base * (percentage / 100))
  const pVal = b * (p / 100);
  return { 
    result: b + pVal, 
    percentageValue: pVal,
    isValid: true 
  };
}
