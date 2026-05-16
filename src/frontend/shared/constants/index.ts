/**
 * Application constants organized by domain
 */

// ============================================================================
// API CONFIGURATION
// ============================================================================
export const API_CONFIG = {
  BASE_URL: import.meta.env.VITE_API_URL || '',
  TIMEOUT: 10000,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 250, // base delay in ms
  MAX_RETRY_DELAY: 4000,
} as const;

// ============================================================================
// AUTHENTICATION
// ============================================================================
export const AUTH_CONFIG = {
  TOKEN_KEY: 'auth_token',
  TOKEN_REFRESH_THRESHOLD: 5 * 60 * 1000, // 5 minutes
} as const;

// ============================================================================
// TRADING
// ============================================================================
export const TRADING_CONFIG = {
  MARKET_HOURS: {
    OPEN_HOUR: 9,
    OPEN_MINUTE: 30,
    CLOSE_HOUR: 16,
    CLOSE_MINUTE: 0,
  },
  CRYPTO_FEES: 0.001, // 0.1% approx
  STOCK_FEES: 0.001, // 0.1% approx
} as const;

// ============================================================================
// UI / DISPLAY
// ============================================================================
export const UI_CONFIG = {
  CURRENCY: 'USD',
  LOCALE: 'en-US',
  DATE_FORMAT: 'medium' as const,
} as const;

// ============================================================================
// COLOR SCHEME (for dynamic styling)
// ============================================================================
export const THEME_COLORS = {
  BULLISH: '#4ade80',
  BEARISH: '#f87171',
  WARNING: '#fbbf24',
  INFO: '#60a5fa',
  SUCCESS: '#34d399',
} as const;

// ============================================================================
// VALIDATION RULES
// ============================================================================
export const VALIDATION_RULES = {
  PASSWORD_MIN_LENGTH: 8,
  EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  STOCK_SYMBOL_REGEX: /^[A-Z]{1,5}$/,
  CRYPTO_SYMBOL_REGEX: /^[A-Z]{2,15}(\/[A-Z]{3,4}|USD|USDT)?(T)?$/,
} as const;

// ============================================================================
// ERROR CODES
// ============================================================================
export const ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;
