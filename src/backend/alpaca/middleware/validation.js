/**
 * Input validation middleware for API requests
 * Validates query parameters, request bodies, and path parameters
 */

import { URL } from "url";

/**
 * Validate that a value is a valid date string (YYYY-MM-DD)
 */
export function isValidDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return false;
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}

/**
 * Validate that a value is a valid stock symbol
 */
export function isValidSymbol(symbol) {
  if (!symbol || typeof symbol !== "string") return false;
  // Allow letters, numbers, and common separators
  return /^[A-Z0-9./-]{1,10}$/i.test(symbol.trim());
}

/**
 * Validate numeric range
 */
export function isValidRange(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const num = Number(value);
  return !isNaN(num) && num >= min && num <= max;
}

/**
 * Validate and sanitize date range parameters
 */
export function validateDateRange(req, res, corsHeaders) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (from && !isValidDate(from)) {
    res.writeHead(400, corsHeaders);
    res.end(
      JSON.stringify({
        success: false,
        error: "Invalid 'from' date format. Use YYYY-MM-DD.",
      }),
    );
    return false;
  }

  if (to && !isValidDate(to)) {
    res.writeHead(400, corsHeaders);
    res.end(
      JSON.stringify({
        success: false,
        error: "Invalid 'to' date format. Use YYYY-MM-DD.",
      }),
    );
    return false;
  }

  // Validate date order
  if (from && to && new Date(from) > new Date(to)) {
    res.writeHead(400, corsHeaders);
    res.end(
      JSON.stringify({
        success: false,
        error: "'from' date must be before 'to' date.",
      }),
    );
    return false;
  }

  return true;
}

/**
 * Validate symbol parameter
 */
export function validateSymbol(req, res, corsHeaders) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const symbol = url.searchParams.get("symbol");

  if (symbol && !isValidSymbol(symbol)) {
    res.writeHead(400, corsHeaders);
    res.end(
      JSON.stringify({
        success: false,
        error: "Invalid symbol format.",
      }),
    );
    return false;
  }

  return true;
}

/**
 * Validate numeric limit parameter
 */
export function validateLimit(req, res, corsHeaders, defaultLimit = 100, maxLimit = 1000) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const limit = url.searchParams.get("limit");

  if (limit && !isValidRange(limit, 1, maxLimit)) {
    res.writeHead(400, corsHeaders);
    res.end(
      JSON.stringify({
        success: false,
        error: `Invalid limit. Must be between 1 and ${maxLimit}.`,
      }),
    );
    return defaultLimit;
  }

  return limit ? parseInt(limit, 10) : defaultLimit;
}

/**
 * Compose multiple validators
 */
export function composeValidators(...validators) {
  return (req, res, corsHeaders) => {
    for (const validator of validators) {
      const result = validator(req, res, corsHeaders);
      if (result === false) return false;
    }
    return true;
  };
}

export default {
  validateDateRange,
  validateSymbol,
  validateLimit,
  composeValidators,
};
