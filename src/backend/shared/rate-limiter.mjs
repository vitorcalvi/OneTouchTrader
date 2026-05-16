/**
 * Simple Rate Limiter
 * FIX: HIGH #8 - Rate limiting
 */

import { registerCleanup } from './graceful-shutdown.mjs';
import { DEFAULT_RATE_LIMIT_WINDOW_MS, DEFAULT_RATE_LIMIT_MAX } from '../../shared/constants.mjs';

const stores = new Map();
const cleanupIntervals = new Map();

export function createRateLimiter(options = {}) {
  const windowMs = options.windowMs || DEFAULT_RATE_LIMIT_WINDOW_MS;
  const maxRequests = options.max || DEFAULT_RATE_LIMIT_MAX;
  const storeKey = `${windowMs}:${maxRequests}`;

  if (!stores.has(storeKey)) {
    stores.set(storeKey, new Map());
  }

  const store = stores.get(storeKey);

  // Cleanup old entries periodically (only once per storeKey)
  if (!cleanupIntervals.has(storeKey)) {
    const intervalId = setInterval(() => {
      const now = Date.now();
      for (const [key, data] of store.entries()) {
        if (now - data.resetTime > windowMs) {
          store.delete(key);
        }
      }
    }, windowMs);
    cleanupIntervals.set(storeKey, intervalId);
  }

  const check = (req) => {
    const key =
      req?.headers?.['x-forwarded-for']?.split(',')[0].trim() ||
      req?.ip ||
      req?.socket?.remoteAddress ||
      req?.connection?.remoteAddress ||
      'unknown';
    const now = Date.now();

    let record = store.get(key);

    if (!record || now - record.resetTime > windowMs) {
      record = { count: 0, resetTime: now };
      store.set(key, record);
    }

    record.count++;

    if (record.count > maxRequests) {
      return {
        allowed: false,
        retryAfter: Math.max(0, record.resetTime + windowMs - now)
      };
    }

    return { allowed: true, retryAfter: 0 };
  };

  // Dual-mode middleware:
  // - Express: (req, res, next)
  // - Check-only: (req) -> { allowed, retryAfter }
  return (req, res, next) => {
    const result = check(req);

    if (!result.allowed) {
      // Express pattern
      if (res && res.status && typeof res.status === 'function') {
        res.status(429).json({
          success: false,
          error: 'Too many requests, please try again later',
          code: 429,
          timestamp: new Date().toISOString(),
          retryAfter: result.retryAfter
        });
        return result;
      }

      // Check-only pattern
      if (!next || typeof next !== 'function') {
        return result;
      }
    }

    if (next && typeof next === 'function') {
      next();
    }

    return result;
  };
}

/**
 * Reset all rate limiter stores (for testing)
 */
export function resetRateLimiters() {
  for (const intervalId of cleanupIntervals.values()) {
    clearInterval(intervalId);
  }
  stores.clear();
  cleanupIntervals.clear();
}

// Register cleanup handler for graceful shutdown
registerCleanup(async () => {
  console.log('[RateLimiter] Cleaning up intervals...');
  for (const intervalId of cleanupIntervals.values()) {
    clearInterval(intervalId);
  }
  cleanupIntervals.clear();
  stores.clear();
});
