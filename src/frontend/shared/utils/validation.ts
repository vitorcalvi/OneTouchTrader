/**
 * Validation utilities for various data types
 */

export interface ValidationRule<T = any> {
  validate: (value: T) => boolean;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validate an email address
 * @param email - Email to validate
 * @returns true if valid email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate percentage value (0-100)
 * @param value - Percentage value to validate
 * @returns Validation result with error message if invalid
 */
export function validatePercentage(value: string | number): { isValid: boolean; error?: string } {
  const numValue = typeof value === 'string' ? parseFloat(value) : value;

  if (!Number.isFinite(numValue)) {
    return { isValid: false, error: 'Invalid number' };
  }

  if (numValue < 0) {
    return { isValid: false, error: 'Percentage cannot be negative' };
  }

  if (numValue > 100) {
    return { isValid: false, error: 'Percentage cannot exceed 100%' };
  }

  return { isValid: true };
}

/**
 * Validate password strength
 * @param password - Password to validate
 * @returns Validation result with errors
 */
export function validatePassword(password: string): ValidationResult {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate stock symbol format
 * @param symbol - Stock symbol to validate
 * @returns true if valid symbol format
 */
export function isValidStockSymbol(symbol: string): boolean {
  // Standard US stock symbols: 1-5 uppercase letters
  return /^[A-Z]{1,5}$/.test(symbol);
}

/**
 * Validate crypto symbol format
 * @param symbol - Crypto symbol to validate
 * @returns true if valid crypto symbol format
 */
export function isValidCryptoSymbol(symbol: string): boolean {
  // Crypto symbols: BTC/USD, SOLUSDT, etc.
  return /^[A-Z]{2,15}(\/[A-Z]{3,4}|USD|USDT)?(T)?$/.test(symbol);
}
