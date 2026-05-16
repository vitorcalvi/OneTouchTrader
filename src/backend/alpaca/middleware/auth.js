/**
 * Authentication middleware for API requests
 * Adds JWT/API key validation for production endpoints
 */

import createLogger from "../../shared/logger.mjs";

const logger = createLogger("Auth");

/**
 * Validate API key from request headers
 * @param {Object} req - HTTP request object
 * @returns {boolean} - Whether the request is authenticated
 */
export function validateApiKey(req) {
  const apiKey = req.headers["x-api-key"];
  const configuredKey = process.env.API_KEY;

  // If no API key configured, allow all requests (development mode)
  if (!configuredKey) {
    return true;
  }

  if (!apiKey) {
    return false;
  }

  // Constant-time comparison to prevent timing attacks
  if (apiKey.length !== configuredKey.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < apiKey.length; i++) {
    result |= apiKey.charCodeAt(i) ^ configuredKey.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Authentication wrapper for HTTP request handler
 * @param {Function} handler - Request handler function
 * @param {boolean} requireAuth - Whether authentication is required
 * @returns {Function} Wrapped handler
 */
export function withAuth(handler, requireAuth = false) {
  return async (req, res, corsHeaders) => {
    // Skip auth if not required and no key configured
    if (!requireAuth || !process.env.API_KEY) {
      req.auth = { authenticated: true, type: "none" };
      return handler(req, res, corsHeaders);
    }

    const isAuthenticated = validateApiKey(req);

    if (!isAuthenticated) {
      logger.warn("[Auth] Unauthorized request to", req.url);
      res.writeHead(401, corsHeaders);
      res.end(
        JSON.stringify({
          success: false,
          error: "Unauthorized - API key required",
        }),
      );
      return;
    }

    req.auth = { authenticated: true, type: "api_key" };
    return handler(req, res, corsHeaders);
  };
}

/**
 * Simple JWT validation (placeholder for future implementation)
 * @param {string} token - JWT token
 * @returns {Object|null} - Decoded token payload or null
 */
export function validateJwt(token) {
  // Placeholder - implement with jsonwebtoken library
  if (!token) return null;
  return null;
}

export default withAuth;
