/**
 * Safe number parsing utilities for backend
 */

export function safeParseFloat(value, defaultValue = 0) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

export function safeParseInt(value, defaultValue = 0) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

export default {
  safeParseFloat,
  safeParseInt
};
