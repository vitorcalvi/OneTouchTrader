#!/usr/bin/env node
/**
 * Alpaca API Server - Stock Trading (Port 5171)
 * Modular refactored version - delegates to route handlers
 */

import "../../lib/utils/secure-log.js";
import { loadEnv } from "../shared/env-loader.mjs";
import { validateEnv } from "../shared/env-validator.mjs";
import {
  setupGracefulShutdown,
  registerCleanup,
} from "../shared/graceful-shutdown.mjs";
import { createRateLimiter } from "../shared/rate-limiter.mjs";
import {
  REQUEST_TIMEOUT_MS,
  LOGO_TIMEOUT_MS,
  DEFAULT_RATE_LIMIT_WINDOW_MS,
} from "../../shared/constants.mjs";
import createLogger from "../shared/logger.mjs";

// Import validation middleware
import {
  validateDateRange,
  validateSymbol,
  validateLimit,
} from "./middleware/validation.js";

import Alpaca from "@alpacahq/alpaca-trade-api";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import http from "http";
import { URL } from "url";
import { safeParseFloat } from "../shared/numbers.mjs";
import Stripe from "stripe";
import { SignJWT, jwtVerify } from "jose";
import { Resend } from "resend";
import { randomUUID } from "crypto";

// Import screener services
import {
  scanStocks,
  getPresets as getAlpacaPresets,
  getQuote,
  getBars,
  getBulkMetrics,
} from "./screener.mjs";
import { scanCrypto, getCryptoDetails } from "./crypto-screener.mjs";

// Import route handlers
import {
  handleLiveHealth,
  handleReadyHealth,
  handleHealth,
  handleAccount,
  handleGetPositions,
  handleGetPosition,
  handleClosePosition,
  handleGetOrders,
  handleGetOrder,
  handlePatchOrder,
  handleDeleteOrder,
  handleCancelAllOrders,
  handleCreateOrder,
  handleQuotes,
  handleTrades,
  handleNews,
  handleEarnings,
  handleAssets,
  handleGetAsset,
  handleBars,
  handleDocumentation,
  handleTickerLogo,
  handleScanPresets,
  isHealthRoute,
} from "./routes/index.js";
import {
  handlePostTradeCard,
  handleGetTradeCards,
  handleFireTradeCard,
  handleCancelTradeCard,
} from "./routes/trade-cards.mjs";
import { handleHealthz } from "./routes/healthz.mjs";

// Import WebSocket proxy
import { handleWebSocketUpgrade, closeAllConnections as closeAllWsConnections } from "./websocket-proxy.mjs";

loadEnv();
validateEnv({ checkAlpaca: true, silent: false });

const TRADE_CARD_TOKEN = process.env.VITE_TRADE_CARD_TOKEN || "dev-token";

const logger = createLogger("AlpacaServer");
const PORT = 5171;

// Alpaca API configuration
const ALPACA_PAPER_KEY =
  process.env.ALPACA_PAPER_KEY || process.env.VITE_ALPACA_PAPER_KEY || "";
const ALPACA_PAPER_SECRET =
  process.env.ALPACA_PAPER_SECRET || process.env.VITE_ALPACA_PAPER_SECRET || "";
const ALPACA_LIVE_KEY =
  process.env.ALPACA_LIVE_KEY || process.env.VITE_ALPACA_LIVE_KEY || "";
const ALPACA_LIVE_SECRET =
  process.env.ALPACA_LIVE_SECRET || process.env.VITE_ALPACA_LIVE_SECRET || "";

const hasPaperKeys = !!(ALPACA_PAPER_KEY && ALPACA_PAPER_SECRET);
const hasLiveKeys = !!(ALPACA_LIVE_KEY && ALPACA_LIVE_SECRET);

const alpacaPaper = new Alpaca({
  keyId: ALPACA_PAPER_KEY,
  secretKey: ALPACA_PAPER_SECRET,
  paper: true,
});

const alpacaLive = new Alpaca({
  keyId: ALPACA_LIVE_KEY,
  secretKey: ALPACA_LIVE_SECRET,
  paper: false,
});

const alpacaMetrics = {
  requests: 0,
  errors: 0,
  authErrors: 0,
};

// Rate limiter
const RATE_LIMIT_MAX = Number(
  process.env.RATE_LIMIT_MAX ||
    (process.env.NODE_ENV === "production" ? 100 : 1000),
);
const rateLimiter = createRateLimiter({
  windowMs: DEFAULT_RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
});

// Package version for health checks
const packageVersion = JSON.parse(
  fs.readFileSync(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
      "..",
      "package.json",
    ),
    "utf-8",
  ),
).version;

const serverStartTime = Date.now();

function getUptime() {
  const uptimeMs = Date.now() - serverStartTime;
  const seconds = Math.floor(uptimeMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  return {
    seconds: uptimeMs / 1000,
    human: `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`,
  };
}

async function checkAlpacaAPI() {
  const paperKey = ALPACA_PAPER_KEY;
  const paperSecret = ALPACA_PAPER_SECRET;

  if (!paperKey || !paperSecret) {
    return { status: "not_configured", latency: null };
  }

  try {
    const start = Date.now();
    const response = await fetch(`${ALPACA_PAPER_URL}/v2/clock`, {
      headers: {
        "APCA-API-KEY-ID": paperKey,
        "APCA-API-SECRET-KEY": paperSecret,
      },
      signal: AbortSignal.timeout(5000),
    });

    const latency = Date.now() - start;

    if (!response.ok) {
      return { status: "unhealthy", error: `HTTP ${response.status}`, latency };
    }

    return { status: "healthy", latency };
  } catch (error) {
    return { status: "unhealthy", error: error.message, latency: null };
  }
}

// === STRIPE LICENSING CONFIGURATION ===
const stripe = process.env.STRIPE_SECRET_TEST_API ? new Stripe(process.env.STRIPE_SECRET_TEST_API) : null;
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const JWT_SECRET = process.env.JWT_SECRET ? new TextEncoder().encode(process.env.JWT_SECRET) : null;

const TIER_BY_PRICE = {
  [process.env.STRIPE_PRICE_PRO]: 'pro',
  [process.env.STRIPE_PRICE_PRO_AI]: 'pro_ai',
};

const APP_URL = 'https://app-trader.dyagnosys.com';
const LP_URL  = 'https://trader.dyagnosys.com';
const TRIAL_DAYS = 14;
const JWT_TTL_SEC = 60 * 60 * 24; // 24h

// Rate limiter for recovery
const recoverRate = new Map();

async function issueJwt({ customer_id, tier, status }) {
  if (!JWT_SECRET) throw new Error('JWT_SECRET not configured');
  return await new SignJWT({ tier, status })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(customer_id)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${JWT_TTL_SEC}s`)
    .sign(JWT_SECRET);
}

// Request body reader
const MAX_BODY_SIZE = 1024 * 1024; // 1MB limit

async function readBody(req) {
  let body = "";
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_SIZE) {
      throw new Error("Request body too large");
    }
    body += chunk;
  }
  if (!body) return {};

  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error("Invalid JSON body");
  }
}

// CORS headers helper
function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-User-ID, APCA-API-KEY-ID, APCA-API-SECRET-KEY",
    "Content-Type": "application/json",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  };
}

// Alpaca API request helper (extracted from original server.mjs)
const ALPACA_PAPER_URL = "https://paper-api.alpaca.markets";
const ALPACA_LIVE_URL = "https://api.alpaca.markets";
const ALPACA_DATA_URL = "https://data.alpaca.markets";
const ALPACA_API_TIMEOUT_MS = REQUEST_TIMEOUT_MS;

async function alpacaRequest(
  endpoint,
  method = "GET",
  body = null,
  isLive = false,
  isData = false,
) {
  const defaultKeyId =
    isLive && hasLiveKeys ? ALPACA_LIVE_KEY : ALPACA_PAPER_KEY;
  const defaultSecretKey =
    isLive && hasLiveKeys ? ALPACA_LIVE_SECRET : ALPACA_PAPER_SECRET;

  const keyId = (body && body.__alpacaKeyId) || defaultKeyId;
  const secretKey = (body && body.__alpacaSecretKey) || defaultSecretKey;

  let effectiveIsLive = isLive && hasLiveKeys ? true : false;
  let effectiveKeyId = keyId || ALPACA_PAPER_KEY;
  let effectiveSecretKey = secretKey || ALPACA_PAPER_SECRET;

  if (!effectiveKeyId || !effectiveSecretKey) {
    alpacaMetrics.errors++;
    alpacaMetrics.authErrors++;
    const e = new Error(
      `Alpaca API keys not configured for ${effectiveIsLive ? "LIVE" : "PAPER"} mode`,
    );
    e.code = "ALPACA_KEYS_MISSING";
    throw e;
  }

  const baseUrl = isData
    ? ALPACA_DATA_URL
    : effectiveIsLive
      ? ALPACA_LIVE_URL
      : ALPACA_PAPER_URL;
  const url = `${baseUrl}${endpoint}`;
  const headers = {
    "APCA-API-KEY-ID": effectiveKeyId,
    "APCA-API-SECRET-KEY": effectiveSecretKey,
    "Content-Type": "application/json",
    Connection: "keep-alive",
  };

  const options = {
    method,
    headers,
    signal: AbortSignal.timeout(ALPACA_API_TIMEOUT_MS),
  };

  if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
    // Ensure credentials are never leaked to downstream API body
    const { __alpacaKeyId: _k, __alpacaSecretKey: _s, ...sanitizedBody } = body;
    options.body = JSON.stringify(sanitizedBody);
  }

  alpacaMetrics.requests++;
  const response = await fetch(url, options);

  if (response.status === 204) {
    return null;
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw new Error(`Invalid JSON response from Alpaca API: ${error.message}`);
  }

  if (!response.ok) {
    alpacaMetrics.errors++;
    if (response.status === 401 || response.status === 403)
      alpacaMetrics.authErrors++;
    const err = new Error(
      data.message || `Alpaca API error: ${response.status}`,
    );
    err.statusCode = response.status;
    throw err;
  }

  return data;
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  const corsHeaders = getCorsHeaders();

  // Handle OPTIONS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(200, corsHeaders);
    res.end();
    return;
  }

  // Rate limiting
  const rateLimitResult = rateLimiter(req);
  if (!rateLimitResult.allowed) {
    res.writeHead(429, corsHeaders);
    res.end(
      JSON.stringify({
        success: false,
        error: "Too many requests",
        retryAfter: Math.ceil(rateLimitResult.retryAfter / 1000),
      }),
    );
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;
  const searchParams = parsedUrl.searchParams;

  // Alpaca credentials from request headers
  const reqKeyId =
    typeof req.headers["apca-api-key-id"] === "string"
      ? req.headers["apca-api-key-id"]
      : "";
  const reqSecretKey =
    typeof req.headers["apca-api-secret-key"] === "string"
      ? req.headers["apca-api-secret-key"]
      : "";
  const reqHasAlpacaHeaders = !!(reqKeyId && reqSecretKey);

  try {
    // Health routes
    if (pathname === "/health/live") {
      const result = {
        status: "alive",
        service: "alpaca",
        version: packageVersion,
        uptime: getUptime(),
        hasPaperKeys,
        hasLiveKeys,
        timestamp: new Date().toISOString(),
      };
      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify(result));
      return;
    }

    if (pathname === "/health/ready") {
      const alpacaCheck = await checkAlpacaAPI();
      const isReady = alpacaCheck.status !== "unhealthy";
      res.writeHead(isReady ? 200 : 503, corsHeaders);
      res.end(
        JSON.stringify({
          status: isReady ? "ready" : "not_ready",
          service: "alpaca",
          version: packageVersion,
          uptime: getUptime(),
          hasPaperKeys,
          hasLiveKeys,
          checks: { alpaca: alpacaCheck },
          metrics: alpacaMetrics,
          timestamp: new Date().toISOString(),
        }),
      );
      return;
    }

    if (pathname === "/health") {
      const alpacaCheck = await checkAlpacaAPI();
      res.writeHead(200, corsHeaders);
      res.end(
        JSON.stringify({
          status: "ok",
          service: "alpaca",
          version: packageVersion,
          uptime: getUptime(),
          hasPaperKeys,
          hasLiveKeys,
          checks: { alpaca: alpacaCheck },
          metrics: alpacaMetrics,
          timestamp: new Date().toISOString(),
        }),
      );
      return;
    }

    if (pathname === "/api/alpaca/health" && req.method === "GET") {
      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({ hasPaperKeys, hasLiveKeys }));
      return;
    }

    // Account routes
    if (pathname === "/api/alpaca/account" && req.method === "GET") {
      try {
        const result = await handleAccount(
          req,
          res,
          corsHeaders,
          searchParams,
          reqHasAlpacaHeaders,
          reqKeyId,
          reqSecretKey,
          alpacaRequest,
          alpacaPaper,
          alpacaLive,
          hasLiveKeys,
        );
        res.writeHead(200, corsHeaders);
        res.end(
          JSON.stringify({ ...result, timestamp: new Date().toISOString() }),
        );
      } catch (error) {
        res.writeHead(error.statusCode || 500, corsHeaders);
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
      return;
    }

    if (pathname === "/api/alpaca/positions" && req.method === "GET") {
      try {
        const result = await handleGetPositions(
          searchParams,
          corsHeaders,
          reqHasAlpacaHeaders,
          reqKeyId,
          reqSecretKey,
          alpacaRequest,
          alpacaPaper,
          alpacaLive,
          hasLiveKeys,
        );
        res.writeHead(200, corsHeaders);
        res.end(
          JSON.stringify({ ...result, timestamp: new Date().toISOString() }),
        );
      } catch (error) {
        res.writeHead(500, corsHeaders);
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
      return;
    }

    // Position routes
    const positionMatch = pathname.match(/^\/api\/alpaca\/positions\/([^/]+)$/);
    if (positionMatch) {
      const symbol = positionMatch[1];
      if (req.method === "GET") {
        try {
          const result = await handleGetPosition(
            symbol,
            searchParams,
            corsHeaders,
            reqHasAlpacaHeaders,
            reqKeyId,
            reqSecretKey,
            alpacaRequest,
            alpacaPaper,
            alpacaLive,
            hasLiveKeys,
          );
          res.writeHead(200, corsHeaders);
          res.end(
            JSON.stringify({ ...result, timestamp: new Date().toISOString() }),
          );
        } catch (error) {
          res.writeHead(404, corsHeaders);
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
        return;
      }
      if (req.method === "DELETE") {
        try {
          const result = await handleClosePosition(
            symbol,
            searchParams,
            corsHeaders,
            reqHasAlpacaHeaders,
            reqKeyId,
            reqSecretKey,
            alpacaRequest,
            alpacaPaper,
            alpacaLive,
            hasLiveKeys,
          );
          res.writeHead(200, corsHeaders);
          res.end(
            JSON.stringify({ ...result, timestamp: new Date().toISOString() }),
          );
        } catch (error) {
          const statusCode = error.statusCode || error.status || 500;
          res.writeHead(statusCode, corsHeaders);
          res.end(
            JSON.stringify({
              success: false,
              error: error.message,
              statusCode,
            }),
          );
        }
        return;
      }
    }

    // Orders routes
    if (pathname === "/api/alpaca/orders" && req.method === "GET") {
      try {
        const result = await handleGetOrders(
          searchParams,
          corsHeaders,
          reqHasAlpacaHeaders,
          reqKeyId,
          reqSecretKey,
          alpacaRequest,
          alpacaPaper,
          alpacaLive,
          hasLiveKeys,
        );
        res.writeHead(200, corsHeaders);
        res.end(
          JSON.stringify({ ...result, timestamp: new Date().toISOString() }),
        );
      } catch (error) {
        res.writeHead(500, corsHeaders);
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
      return;
    }

    if (pathname === "/api/alpaca/orders" && req.method === "POST") {
      try {
        const body = await readBody(req);
        const result = await handleCreateOrder(
          body,
          searchParams,
          reqHasAlpacaHeaders,
          reqKeyId,
          reqSecretKey,
          alpacaRequest,
          alpacaPaper,
          alpacaLive,
          hasLiveKeys,
        );
        res.writeHead(200, corsHeaders);
        res.end(
          JSON.stringify({ ...result, timestamp: new Date().toISOString() }),
        );
      } catch (error) {
        const statusCode = error.statusCode || error.status || 500;
        res.writeHead(statusCode, corsHeaders);
        res.end(
          JSON.stringify({
            success: false,
            error: error.message,
            statusCode,
          }),
        );
      }
      return;
    }

    if (
      pathname === "/api/alpaca/orders/cancel-all" &&
      req.method === "DELETE"
    ) {
      try {
        const result = await handleCancelAllOrders(
          searchParams,
          corsHeaders,
          reqHasAlpacaHeaders,
          reqKeyId,
          reqSecretKey,
          alpacaRequest,
        );
        res.writeHead(200, corsHeaders);
        res.end(
          JSON.stringify({ ...result, timestamp: new Date().toISOString() }),
        );
      } catch (error) {
        res.writeHead(500, corsHeaders);
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
      return;
    }

    const orderMatch = pathname.match(/^\/api\/alpaca\/orders\/([^/]+)$/);
    if (orderMatch) {
      const orderId = orderMatch[1];
      if (req.method === "GET") {
        try {
          const result = await handleGetOrder(
            orderId,
            searchParams,
            corsHeaders,
            reqHasAlpacaHeaders,
            reqKeyId,
            reqSecretKey,
            alpacaRequest,
          );
          res.writeHead(200, corsHeaders);
          res.end(
            JSON.stringify({ ...result, timestamp: new Date().toISOString() }),
          );
        } catch (error) {
          res.writeHead(500, corsHeaders);
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
        return;
      }
      if (req.method === "PATCH") {
        try {
          const body = await readBody(req);
          const result = await handlePatchOrder(
            orderId,
            body,
            searchParams,
            corsHeaders,
            reqHasAlpacaHeaders,
            reqKeyId,
            reqSecretKey,
            alpacaRequest,
          );
          res.writeHead(200, corsHeaders);
          res.end(
            JSON.stringify({ ...result, timestamp: new Date().toISOString() }),
          );
        } catch (error) {
          res.writeHead(500, corsHeaders);
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
        return;
      }
      if (req.method === "DELETE") {
        try {
          const result = await handleDeleteOrder(
            orderId,
            searchParams,
            corsHeaders,
            reqHasAlpacaHeaders,
            reqKeyId,
            reqSecretKey,
            alpacaRequest,
          );
          res.writeHead(200, corsHeaders);
          res.end(
            JSON.stringify({ ...result, timestamp: new Date().toISOString() }),
          );
        } catch (error) {
          res.writeHead(500, corsHeaders);
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
        return;
      }
    }

    // Market data routes - quotes - validate symbols
    if (pathname === "/api/alpaca/quotes" && req.method === "GET") {
      const symbols = searchParams.get("symbols") || "AAPL";
      if (!symbols.split(",").every((s) => /^[A-Z0-9./-]{1,15}$/i.test(s.trim()))) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ success: false, error: "Invalid symbol format" }));
        return;
      }
      try {
        const result = await handleQuotes(
          symbols,
          searchParams,
          corsHeaders,
          reqHasAlpacaHeaders,
          reqKeyId,
          reqSecretKey,
          alpacaRequest,
        );
        res.writeHead(200, corsHeaders);
        res.end(
          JSON.stringify({ ...result, timestamp: new Date().toISOString() }),
        );
      } catch (error) {
        res.writeHead(500, corsHeaders);
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
      return;
    }

    // Market data routes - trades - validate symbols
    if (pathname === "/api/alpaca/trades" && req.method === "GET") {
      const symbols = searchParams.get("symbols") || "AAPL";
      if (!symbols.split(",").every((s) => /^[A-Z0-9./-]{1,15}$/i.test(s.trim()))) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ success: false, error: "Invalid symbol format" }));
        return;
      }
      try {
        const result = await handleTrades(
          symbols,
          searchParams,
          corsHeaders,
          reqHasAlpacaHeaders,
          reqKeyId,
          reqSecretKey,
          alpacaRequest,
        );
        res.writeHead(200, corsHeaders);
        res.end(
          JSON.stringify({ ...result, timestamp: new Date().toISOString() }),
        );
      } catch (error) {
        res.writeHead(500, corsHeaders);
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
      return;
    }

    // News route - validate date range and limit
    if (pathname === "/api/alpaca/news" && req.method === "GET") {
      if (!validateDateRange(req, res, corsHeaders)) return;
      const limit = validateLimit(req, res, corsHeaders, 10, 50);
      try {
        const result = await handleNews(
          searchParams,
          corsHeaders,
          reqHasAlpacaHeaders,
          reqKeyId,
          reqSecretKey,
          alpacaRequest,
        );
        res.writeHead(200, corsHeaders);
        res.end(
          JSON.stringify({ ...result, timestamp: new Date().toISOString() }),
        );
      } catch (error) {
        res.writeHead(500, corsHeaders);
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
      return;
    }

    // Earnings route - validate date range parameters
    if (pathname === "/api/alpaca/earnings" && req.method === "GET") {
      if (!validateDateRange(req, res, corsHeaders)) return;
      try {
        const result = await handleEarnings(searchParams, corsHeaders);
        res.writeHead(200, corsHeaders);
        res.end(
          JSON.stringify({ ...result, timestamp: new Date().toISOString() }),
        );
      } catch (error) {
        res.writeHead(500, corsHeaders);
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
      return;
    }

    // Assets routes
    if (pathname === "/api/alpaca/assets" && req.method === "GET") {
      try {
        const result = await handleAssets(
          searchParams,
          corsHeaders,
          reqHasAlpacaHeaders,
          reqKeyId,
          reqSecretKey,
          alpacaRequest,
        );
        res.writeHead(200, corsHeaders);
        res.end(
          JSON.stringify({ ...result, timestamp: new Date().toISOString() }),
        );
      } catch (error) {
        res.writeHead(500, corsHeaders);
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
      return;
    }

    const assetMatch = pathname.match(/^\/api\/alpaca\/assets\/([^/]+)$/);
    if (assetMatch && req.method === "GET") {
      const symbol = assetMatch[1];
      if (!validateSymbol(req, res, corsHeaders)) return;
      try {
        const result = await handleGetAsset(
          symbol,
          reqHasAlpacaHeaders,
          reqKeyId,
          reqSecretKey,
          alpacaRequest,
        );
        res.writeHead(200, corsHeaders);
        res.end(
          JSON.stringify({ ...result, timestamp: new Date().toISOString() }),
        );
      } catch (error) {
        res.writeHead(404, corsHeaders);
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
      return;
    }

    // Bars route - validate symbols and limit
    if (pathname === "/api/alpaca/bars" && req.method === "GET") {
      const symbols = searchParams.get("symbols") || "";
      if (symbols && !symbols.split(",").every((s) => /^[A-Z0-9./-]{1,15}$/i.test(s.trim()))) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ success: false, error: "Invalid symbol format" }));
        return;
      }
      const limit = validateLimit(req, res, corsHeaders, 10, 1000);
      const timeframe = searchParams.get("timeframe") || "1Day";
      try {
        const result = await handleBars(
          symbols,
          timeframe,
          limit,
          reqHasAlpacaHeaders,
          reqKeyId,
          reqSecretKey,
          alpacaRequest,
        );
        res.writeHead(200, corsHeaders);
        res.end(
          JSON.stringify({ ...result, timestamp: new Date().toISOString() }),
        );
      } catch (error) {
        res.writeHead(500, corsHeaders);
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
      return;
    }

    // Documentation route - validate symbol
    if (pathname === "/api/documentation" && req.method === "GET") {
      const symbol = searchParams.get("symbol");
      if (!symbol) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ success: false, error: "Symbol required" }));
        return;
      }
      if (!validateSymbol(req, res, corsHeaders)) return;
      try {
        const result = await handleDocumentation(
          symbol,
          type,
          reqHasAlpacaHeaders,
          reqKeyId,
          reqSecretKey,
          alpacaRequest,
          getCryptoDetails,
        );
        res.writeHead(200, corsHeaders);
        res.end(
          JSON.stringify({ ...result, timestamp: new Date().toISOString() }),
        );
      } catch (error) {
        res.writeHead(500, corsHeaders);
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
      return;
    }

    // Ticker logo route
    if (pathname === "/api/ticker-logo" && req.method === "GET") {
      const symbol = searchParams.get("symbol");
      if (!symbol) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ error: "Symbol required" }));
        return;
      }
      try {
        const imageBuffer = await handleTickerLogo(symbol);
        res.writeHead(200, {
          "Content-Type": "image/png",
          ...corsHeaders,
        });
        res.end(Buffer.from(imageBuffer));
      } catch (error) {
        const statusCode = error.status || 500;
        res.writeHead(statusCode, corsHeaders);
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
      return;
    }

    // Screener routes - presets
    if (pathname === "/api/screener/presets" && req.method === "GET") {
      try {
        const result = await handleScanPresets();
        res.writeHead(200, corsHeaders);
        res.end(
          JSON.stringify({
            success: true,
            ...result,
            timestamp: new Date().toISOString(),
          }),
        );
      } catch (error) {
        res.writeHead(500, corsHeaders);
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
      return;
    }

    // Screener routes - scan
    if (pathname === "/api/screener/scan" && req.method === "GET") {
      const preset = searchParams.get("preset") || "gappers";
      try {
        const result = await scanStocks(preset);
        res.writeHead(200, corsHeaders);
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(500, corsHeaders);
        res.end(
          JSON.stringify({
            success: false,
            error: error.message,
            stocks: [],
            timestamp: new Date().toISOString(),
          }),
        );
      }
      return;
    }

    if (pathname === "/api/screener/scan" && req.method === "POST") {
      const body = await readBody(req);
      const preset = body.preset || "gappers";
      try {
        const result = await scanStocks(preset);
        res.writeHead(200, corsHeaders);
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(500, corsHeaders);
        res.end(
          JSON.stringify({
            success: false,
            error: error.message,
            stocks: [],
            timestamp: new Date().toISOString(),
          }),
        );
      }
      return;
    }

    // Screener quote route
    if (pathname === "/api/screener/quote" && req.method === "GET") {
      const symbol = searchParams.get("symbol") || "AAPL";
      try {
        const result = await getQuote(symbol);
        res.writeHead(200, corsHeaders);
        res.end(
          JSON.stringify({
            success: true,
            data: result,
            timestamp: new Date().toISOString(),
          }),
        );
      } catch (error) {
        res.writeHead(500, corsHeaders);
        res.end(
          JSON.stringify({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString(),
          }),
        );
      }
      return;
    }

    // Screener bars route
    if (pathname === "/api/screener/bars" && req.method === "GET") {
      const symbols = searchParams.get("symbols") || "AAPL";
      const timeframe = searchParams.get("timeframe") || "1Day";
      const limit = searchParams.get("limit") || "10";
      try {
        const result = await getBars(symbols, timeframe, parseInt(limit));
        res.writeHead(200, corsHeaders);
        res.end(
          JSON.stringify({
            success: true,
            data: result,
            timestamp: new Date().toISOString(),
          }),
        );
      } catch (error) {
        res.writeHead(500, corsHeaders);
        res.end(
          JSON.stringify({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString(),
          }),
        );
      }
      return;
    }

    // Crypto screener route
    if (pathname === "/api/screener/crypto" && req.method === "GET") {
      const preset = searchParams.get("preset") || "cryptoGainers";
      try {
        const result = await scanCrypto(preset);
        res.writeHead(200, corsHeaders);
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(500, corsHeaders);
        res.end(
          JSON.stringify({
            success: false,
            error: error.message,
            stocks: [],
            timestamp: new Date().toISOString(),
          }),
        );
      }
      return;
    }

    // Clock route
    if (pathname === "/api/alpaca/clock" && req.method === "GET") {
      try {
        const clock = await alpacaRequest(
          "/v2/clock",
          "GET",
          reqHasAlpacaHeaders
            ? { __alpacaKeyId: reqKeyId, __alpacaSecretKey: reqSecretKey }
            : null,
          false,
        );
        res.writeHead(200, corsHeaders);
        res.end(
          JSON.stringify({
            success: true,
            data: clock,
            timestamp: new Date().toISOString(),
          }),
        );
      } catch (error) {
        res.writeHead(500, corsHeaders);
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
      return;
    }

    // Calendar route
    if (pathname === "/api/alpaca/calendar" && req.method === "GET") {
      const start = searchParams.get("start");
      const end = searchParams.get("end");
      try {
        let url = "/v2/calendar";
        if (start || end) {
          const params = [];
          if (start) params.push(`start=${start}`);
          if (end) params.push(`end=${end}`);
          url += "?" + params.join("&");
        }
        const calendar = await alpacaRequest(
          url,
          "GET",
          reqHasAlpacaHeaders
            ? { __alpacaKeyId: reqKeyId, __alpacaSecretKey: reqSecretKey }
            : null,
          false,
        );
        res.writeHead(200, corsHeaders);
        res.end(
          JSON.stringify({
            success: true,
            data: calendar,
            timestamp: new Date().toISOString(),
          }),
        );
      } catch (error) {
        res.writeHead(500, corsHeaders);
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
      return;
    }

    // Alpaca connection test
    if (pathname === "/api/alpaca/test" && req.method === "GET") {
      const isLive = searchParams.get("live") === "true";
      try {
        const account = await alpacaRequest(
          "/v2/account",
          "GET",
          reqHasAlpacaHeaders
            ? { __alpacaKeyId: reqKeyId, __alpacaSecretKey: reqSecretKey }
            : null,
          isLive,
        );
        res.writeHead(200, corsHeaders);
        res.end(
          JSON.stringify({
            success: true,
            message: "Alpaca connection successful",
            account: {
              id: account.id,
              status: account.status,
              buying_power: safeParseFloat(account.buying_power, 0),
              daytrading_buying_power: safeParseFloat(
                account.daytrading_buying_power,
                0,
              ),
              equity: safeParseFloat(account.equity, 0),
              cash: safeParseFloat(account.cash, 0),
            },
            timestamp: new Date().toISOString(),
          }),
        );
      } catch (error) {
        res.writeHead(500, corsHeaders);
        res.end(
          JSON.stringify({
            success: false,
            message: `Alpaca connection failed: ${error.message}`,
            timestamp: new Date().toISOString(),
          }),
        );
      }
      return;
    }

    // Transactions route
    if (pathname === "/api/transactions" && req.method === "GET") {
      const limit = safeParseInt(searchParams.get("limit"), 100);
      res.writeHead(200, corsHeaders);
      res.end(
        JSON.stringify({
          success: true,
          data: [],
          timestamp: new Date().toISOString(),
        }),
      );
      return;
    }

    // Bulk metrics route
    if (pathname === "/api/screener/metrics" && req.method === "GET") {
      const symbols = searchParams.get("symbols") || "";
      try {
        const result = await getBulkMetrics(symbols);
        res.writeHead(200, corsHeaders);
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(500, corsHeaders);
        res.end(
          JSON.stringify({
            success: false,
            error: error.message,
            stocks: [],
            timestamp: new Date().toISOString(),
          }),
        );
      }
      return;
    }

    if (pathname === "/api/trade-cards" && req.method === "POST") {
      const body = await readBody(req);
      const result = await handlePostTradeCard(body, TRADE_CARD_TOKEN, req);
      res.writeHead(result.status, corsHeaders);
      res.end(JSON.stringify(result.body));
      return;
    }
    if (pathname === "/api/trade-cards" && req.method === "GET") {
      const result = await handleGetTradeCards(searchParams);
      res.writeHead(result.status, corsHeaders);
      res.end(JSON.stringify(result.body));
      return;
    }
    const fireMatch = pathname.match(/^\/api\/trade-cards\/([^/]+)\/fire$/);
    if (fireMatch && req.method === "POST") {
      const id = fireMatch[1];
      const fireOrderFn = async (orderBody) => {
        const url = `http://localhost:5171/api/alpaca/orders?live=false`;
        const r = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(orderBody),
        });
        if (!r.ok) throw new Error(`alpaca order failed: ${r.status} ${await r.text()}`);
        return r.json();
      };
      const result = await handleFireTradeCard(id, fireOrderFn);
      res.writeHead(result.status, corsHeaders);
      res.end(JSON.stringify(result.body));
      return;
    }
    const cancelMatch = pathname.match(/^\/api\/trade-cards\/([^/]+)\/cancel$/);
    if (cancelMatch && req.method === "POST") {
      const result = await handleCancelTradeCard(cancelMatch[1]);
      res.writeHead(result.status, corsHeaders);
      res.end(JSON.stringify(result.body));
      return;
    }

    // healthz route (bare path, for UptimeRobot)
    if (pathname === "/healthz" && req.method === "GET") {
      handleHealthz(req, res);
      return;
    }

    // === LICENSING ROUTES ===
    // POST /checkout { tier: "pro" | "pro_ai" } → { url }
    if (pathname === "/checkout" && req.method === "POST") {
      const reqBody = await readBody(req);
      const { tier } = reqBody;
      const priceId = tier === 'pro_ai' ? process.env.STRIPE_PRICE_PRO_AI : process.env.STRIPE_PRICE_PRO;
      if (!priceId) { res.writeHead(400, corsHeaders); res.end(JSON.stringify({ error: 'invalid_tier' })); return; }

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        subscription_data: { trial_period_days: TRIAL_DAYS, metadata: { tier } },
        success_url: `${LP_URL}/license?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${LP_URL}/?canceled=1`,
        allow_promotion_codes: true,
      });
      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({ url: session.url }));
      return;
    }

    // GET /issue-license?session_id=... → { jwt }
    if (pathname === "/issue-license" && req.method === "GET") {
      const session_id = searchParams.get("session_id");
      if (!session_id) { res.writeHead(400, corsHeaders); res.end(JSON.stringify({ error: 'missing_session_id' })); return; }

      const session = await stripe.checkout.sessions.retrieve(session_id, { expand: ['subscription', 'customer'] });
      if (!session.subscription) { res.writeHead(402, corsHeaders); res.end(JSON.stringify({ error: 'payment_incomplete' })); return; }

      const sub = session.subscription;
      if (!['active', 'trialing'].includes(sub.status)) { res.writeHead(402, corsHeaders); res.end(JSON.stringify({ error: 'subscription_inactive', status: sub.status })); return; }

      const priceId = sub.items.data[0].price.id;
      const tier = TIER_BY_PRICE[priceId] || 'pro';
      const jwt = await issueJwt({ customer_id: sub.customer, tier, status: sub.status });

      if (session.customer_details?.email) {
        resend.emails.send({
          from: 'Fireup Trader <recovery@dyagnosys.com>',
          to: session.customer_details.email,
          subject: 'Your Fireup Trader license',
          text: `Your license token (paste into app):\n\n${jwt}\n\nThis token expires in 24h. Open: ${APP_URL}/#license=${jwt}`,
        }).catch(() => {});
      }

      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({ jwt }));
      return;
    }

    // POST /refresh-license Authorization: Bearer <old jwt> → { jwt }
    if (pathname === "/refresh-license" && req.method === "POST") {
      const old = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!old) { res.writeHead(401, corsHeaders); res.end(JSON.stringify({ error: 'missing_token' })); return; }
      try {
        const { payload } = await jwtVerify(old, JWT_SECRET);
        const customerId = payload.sub;
        const subs = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 5 });
        const active = subs.data.find(s => ['active', 'trialing'].includes(s.status));
        if (!active) { res.writeHead(402, corsHeaders); res.end(JSON.stringify({ error: 'no_active_subscription' })); return; }
        const priceId = active.items.data[0].price.id;
        const tier = TIER_BY_PRICE[priceId] || 'pro';
        const jwt = await issueJwt({ customer_id: customerId, tier, status: active.status });
        res.writeHead(200, corsHeaders);
        res.end(JSON.stringify({ jwt }));
        return;
      } catch {
        res.writeHead(401, corsHeaders);
        res.end(JSON.stringify({ error: 'invalid_token' }));
        return;
      }
    }

    // POST /recover-license { email } → { ok: true }
    if (pathname === "/recover-license" && req.method === "POST") {
      const reqBody = await readBody(req);
      const { email } = reqBody;
      if (!email || typeof email !== 'string') { res.writeHead(400, corsHeaders); res.end(JSON.stringify({ error: 'invalid_email' })); return; }
      const now = Date.now();
      const hits = (recoverRate.get(email) || []).filter(t => now - t < 3600_000);
      if (hits.length >= 5) { res.writeHead(429, corsHeaders); res.end(JSON.stringify({ error: 'rate_limited' })); return; }
      recoverRate.set(email, [...hits, now]);
      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({ ok: true }));

      // async work
      (async () => {
        try {
          const search = await stripe.customers.search({ query: `email:'${email.replace(/'/g, "")}'` });
          for (const cust of search.data) {
            const subs = await stripe.subscriptions.list({ customer: cust.id, status: 'all', limit: 5 });
            const active = subs.data.find(s => ['active', 'trialing'].includes(s.status));
            if (!active) continue;
            const priceId = active.items.data[0].price.id;
            const tier = TIER_BY_PRICE[priceId] || 'pro';
            const jwt = await issueJwt({ customer_id: cust.id, tier, status: active.status });
            await resend.emails.send({
              from: 'Fireup Trader <recovery@dyagnosys.com>',
              to: email,
              subject: 'Your Fireup Trader license (recovery)',
              text: `Here's a fresh license token:\n\n${jwt}\n\nOpen: ${APP_URL}/#license=${jwt}`,
            });
          }
        } catch (e) { console.error('recovery failed', e); }
      })();
      return;
    }

    // 404 fallback
    res.writeHead(404, corsHeaders);
    res.end(JSON.stringify({ success: false, error: "Not found" }));
  } catch (error) {
    res.writeHead(500, corsHeaders);
    res.end(
      JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      }),
    );
  }
});

import { WebSocketServer } from 'ws';

// Setup graceful shutdown
setupGracefulShutdown();
registerCleanup(async () => {
  console.log("[Alpaca Server] Shutting down...");
  closeAllWsConnections();
});

const wss = new WebSocketServer({ noServer: true });

// Handle WebSocket upgrade requests
server.on('upgrade', (req, socket, head) => {
  const pathname = req.url ? new URL(req.url, `http://${req.headers.host}`).pathname : '';
  if (pathname.startsWith('/ws/alpaca')) {
    wss.handleUpgrade(req, socket, head, (ws) => {
      handleWebSocketUpgrade(req, ws);
    });
  } else {
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`[Alpaca Server] Running on http://localhost:${PORT}`);
  console.log("[Alpaca Server] Endpoints: /api/alpaca/*");
  console.log(`[Alpaca Server] WebSocket proxy enabled at ws://localhost:${PORT}/ws/alpaca`);
});
