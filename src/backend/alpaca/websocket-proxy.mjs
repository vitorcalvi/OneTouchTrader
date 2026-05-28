/**
 * Alpaca WebSocket Proxy
 *
 * IMPORTANT:
 * Alpaca enforces connection limits per API key. This proxy must NOT open a new
 * upstream Alpaca WebSocket per browser client; instead we maintain a single
 * upstream per feed URL (IEX/SIP) and fan-out messages to all connected clients.
 */

import { parse } from 'url';
import { createRequire } from 'module';
const cjsRequire = createRequire(import.meta.url);
const WebSocket = cjsRequire('ws');

// Import shared modules
import { getAlpacaCredentials } from '../shared/env-loader.mjs';
import { createLogger } from '../shared/logger.mjs';

const logger = createLogger('ws-proxy');

/**
 * Track client connections.
 * @type {Map<WebSocket, { alpacaWsUrl: string, isLive: boolean }>}
 */
const clientInfoByWs = new Map();

/**
 * @typedef {Object} ClientSubs
 * @property {Set<string>} trades
 * @property {Set<string>} quotes
 */

/**
 * @typedef {Object} Upstream
 * @property {string} url
 * @property {WebSocket|null} ws
 * @property {{ key: string, secret: string }} credentials
 * @property {Set<WebSocket>} clients
 * @property {Map<WebSocket, ClientSubs>} clientSubs
 * @property {boolean} authenticated
 * @property {number} retryCount
 * @property {NodeJS.Timeout|null} reconnectTimer
 * @property {NodeJS.Timeout|null} resubscribeTimer
 * @property {NodeJS.Timeout|null} idleCloseTimer
 * @property {string|null} lastError
 * @property {number} cooldownUntilMs
 * @property {string} id
 * @property {boolean} closing
 */

// Dev/prod guard: ensure we never duplicate upstream state due to accidental
// double-import or other module-level re-initialization.
const GLOBAL_KEY = Symbol.for('fireup.alpacaWsProxy.state');

/**
 * @type {{
 *  upstreamByUrl: Map<string, Upstream>,
 *  nextUpstreamId: number,
 *  cooldownUntilByUrl: Map<string, number>
 * }}
 */
const globalState =
  globalThis[GLOBAL_KEY] ??
  /** @type {any} */ ({
    upstreamByUrl: new Map(),
    nextUpstreamId: 1,
    cooldownUntilByUrl: new Map(),
  });

globalThis[GLOBAL_KEY] = globalState;

/** @type {Map<string, Upstream>} */
const upstreamByUrl = globalState.upstreamByUrl;

// If all browser clients disconnect briefly (page reload, HMR, network hiccup),
// keep the upstream Alpaca connection around for a short grace period so we
// don't churn connections and trip Alpaca's connection limits.
const UPSTREAM_IDLE_CLOSE_MS = 30_000;

function normalizeSymbols(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((s) => typeof s === 'string')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** @param {Upstream} upstream */
function broadcastToClients(upstream, rawData) {
  for (const clientWs of upstream.clients) {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(rawData);
    }
  }
}

/** @param {Upstream} upstream */
function computeUnionSubs(upstream) {
  const trades = new Set();
  const quotes = new Set();
  for (const subs of upstream.clientSubs.values()) {
    for (const s of subs.trades) trades.add(s);
    for (const s of subs.quotes) quotes.add(s);
  }
  return {
    trades: Array.from(trades),
    quotes: Array.from(quotes),
  };
}

/** @param {Upstream} upstream */
function scheduleResubscribe(upstream, delayMs = 100) {
  if (upstream.resubscribeTimer) {
    clearTimeout(upstream.resubscribeTimer);
  }
  upstream.resubscribeTimer = setTimeout(() => {
    upstream.resubscribeTimer = null;
    const ws = upstream.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (!upstream.authenticated) return;

    const union = computeUnionSubs(upstream);
    // Always reset server-side subscriptions to avoid leaked symbols.
    ws.send(
      JSON.stringify({
        action: 'unsubscribe',
        trades: ['*'],
        quotes: ['*'],
      }),
    );

    if (union.trades.length === 0 && union.quotes.length === 0) return;

    ws.send(
      JSON.stringify({
        action: 'subscribe',
        trades: union.trades,
        quotes: union.quotes,
      }),
    );
  }, delayMs);
}

/** @param {Upstream} upstream */
function scheduleReconnect(upstream) {
  if (upstream.closing) return;
  if (upstream.reconnectTimer) return;
  if (upstream.clients.size === 0) return;

  const isConnLimit =
    typeof upstream.lastError === 'string' &&
    upstream.lastError.toLowerCase().includes('connection limit exceeded');

  const baseDelay = isConnLimit ? 60_000 : 1_000;
  const expDelayMs = Math.min(
    baseDelay * Math.pow(2, upstream.retryCount),
    15 * 60_000,
  );
  const cooldownDelayMs = Math.max(0, upstream.cooldownUntilMs - Date.now());
  const delayMs = Math.max(expDelayMs, cooldownDelayMs);
  logger.info(
    `Scheduling upstream reconnect ${upstream.id} in ${Math.round(delayMs / 1000)}s (retry=${upstream.retryCount}, cooldownMs=${cooldownDelayMs})`,
  );
  upstream.reconnectTimer = setTimeout(() => {
    upstream.reconnectTimer = null;
    ensureUpstreamConnected(upstream);
  }, delayMs);
}

/** @param {Upstream} upstream */
function ensureUpstreamConnected(upstream) {
  if (upstream.closing) return;
  // Respect any previously scheduled backoff.
  if (upstream.reconnectTimer) return;

  // Respect cooldown window (e.g., after 1006 or connection-limit errors).
  const now = Date.now();
  if (upstream.cooldownUntilMs > now) {
    globalState.cooldownUntilByUrl.set(upstream.url, upstream.cooldownUntilMs);
    scheduleReconnect(upstream);
    return;
  }

  const existing = upstream.ws;
  if (
    existing &&
    (existing.readyState === WebSocket.OPEN ||
      existing.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  upstream.retryCount = Math.min(upstream.retryCount + 1, 10);
  upstream.authenticated = false;
  upstream.lastError = null;

  const alpacaWs = new WebSocket(upstream.url);
  upstream.ws = alpacaWs;

  alpacaWs.on('open', () => {
    upstream.retryCount = 0;
    const authMsg = {
      action: 'auth',
      key: upstream.credentials.key,
      secret: upstream.credentials.secret,
    };
    if (alpacaWs.readyState === WebSocket.OPEN) {
      alpacaWs.send(JSON.stringify(authMsg));
      logger.debug('Sent authentication message to Alpaca');
    }
  });

  alpacaWs.on('message', (data) => {
    // Forward upstream messages to all clients.
    // Also detect auth success and connection-limit errors for retry logic.
    try {
      const messages = JSON.parse(data.toString());
      if (Array.isArray(messages)) {
        for (const msg of messages) {
          if (msg?.T === 'success' && msg?.msg === 'authenticated') {
            upstream.authenticated = true;
            scheduleResubscribe(upstream, 0);
          }
          if (msg?.T === 'error' && typeof msg?.msg === 'string') {
            upstream.lastError = msg.msg;

            if (msg.msg.toLowerCase().includes('connection limit exceeded')) {
              upstream.cooldownUntilMs = Math.max(
                upstream.cooldownUntilMs,
                Date.now() + 90_000,
              );
              globalState.cooldownUntilByUrl.set(upstream.url, upstream.cooldownUntilMs);
              // Force a close so we can backoff before reconnecting.
              if (alpacaWs.readyState === WebSocket.OPEN) {
                alpacaWs.close(1000, 'Connection limit exceeded');
              }
            }
          }
        }
      }
    } catch {
      // Ignore parse errors; still broadcast raw message.
    }
    broadcastToClients(upstream, data);
  });

  alpacaWs.on('error', (err) => {
    upstream.lastError = err?.message || String(err);
    logger.error('Alpaca WebSocket error:', upstream.lastError);
    // Notify connected clients, but keep them connected; we'll retry upstream.
    broadcastToClients(
      upstream,
      JSON.stringify([
        {
          T: 'error',
          msg: `Alpaca connection error: ${upstream.lastError}`,
        },
      ]),
    );
  });

  alpacaWs.on('close', (code, reason) => {
    logger.info(`Alpaca WebSocket closed: ${code} ${reason}`);

    // If Alpaca closed abnormally, assume the server may still consider the old
    // connection alive; apply a cooldown before reconnecting.
    if (code === 1006) {
      upstream.cooldownUntilMs = Math.max(upstream.cooldownUntilMs, Date.now() + 90_000);
      globalState.cooldownUntilByUrl.set(upstream.url, upstream.cooldownUntilMs);
    }

    if (upstream.ws === alpacaWs) {
      upstream.ws = null;
      upstream.authenticated = false;
    }

    if (upstream.closing) return;
    if (upstream.clients.size === 0) {
      upstreamByUrl.delete(upstream.url);
      return;
    }

    scheduleReconnect(upstream);
  });
}

function getOrCreateUpstream(alpacaWsUrl, credentials) {
  const existing = upstreamByUrl.get(alpacaWsUrl);
  if (existing) return existing;

  /** @type {Upstream} */
  const upstream = {
    url: alpacaWsUrl,
    ws: null,
    credentials: { key: credentials.key, secret: credentials.secret },
    clients: new Set(),
    clientSubs: new Map(),
    authenticated: false,
    retryCount: 0,
    reconnectTimer: null,
    resubscribeTimer: null,
    idleCloseTimer: null,
    lastError: null,
    cooldownUntilMs: globalState.cooldownUntilByUrl.get(alpacaWsUrl) ?? 0,
    id: `up-${globalState.nextUpstreamId++}`,
    closing: false,
  };

  upstreamByUrl.set(alpacaWsUrl, upstream);
  logger.info(`Created upstream ${upstream.id} for ${alpacaWsUrl}`);
  ensureUpstreamConnected(upstream);
  return upstream;
}

/**
 * Handle WebSocket upgrade and proxy to Alpaca
 * @param {import('http').IncomingMessage} req 
 * @param {WebSocket} clientWs 
 */
export function handleWebSocketUpgrade(req, clientWs) {
  const parsedUrl = parse(req.url, true);
  const { pathname, query } = parsedUrl;
  
  // Only handle /ws/alpaca paths
  if (!pathname?.startsWith('/ws/alpaca')) {
    clientWs.close(1008, 'Invalid path');
    return;
  }

  const isLive = query?.live === 'true';
  
  // Get credentials based on mode
  const credentials = getAlpacaCredentials(!isLive); // getAlpacaCredentials(true) = paper

  if (!credentials.key || !credentials.secret) {
    logger.error('Missing Alpaca credentials for WebSocket connection');
    clientWs.close(1008, 'Server misconfigured: missing credentials');
    return;
  }

  // Determine Alpaca WebSocket URL based on mode
  // Paper trading uses IEX feed, Live uses SIP feed
  const alpacaWsUrl = isLive 
    ? 'wss://stream.data.alpaca.markets/v2/sip'
    : 'wss://stream.data.alpaca.markets/v2/iex';

  logger.info(`Client connected. Using upstream Alpaca feed: ${alpacaWsUrl} (live=${isLive})`);

  const upstream = getOrCreateUpstream(alpacaWsUrl, credentials);
  if (upstream.idleCloseTimer) {
    clearTimeout(upstream.idleCloseTimer);
    upstream.idleCloseTimer = null;
  }
  logger.info(
    `Client attached to upstream ${upstream.id} (${alpacaWsUrl}). clients=${upstream.clients.size + 1}`,
  );
  upstream.clients.add(clientWs);
  upstream.clientSubs.set(clientWs, { trades: new Set(), quotes: new Set() });

  clientInfoByWs.set(clientWs, { alpacaWsUrl, isLive });

  // Client -> Upstream subscription management.
  clientWs.on('message', (raw) => {
    let payload;
    try {
      payload = JSON.parse(raw.toString());
    } catch {
      return;
    }

    const messages = Array.isArray(payload) ? payload : [payload];
    const subs = upstream.clientSubs.get(clientWs);
    if (!subs) return;

    let changed = false;
    for (const msg of messages) {
      if (!msg || typeof msg !== 'object') continue;

      if (msg.action === 'subscribe') {
        const trades = normalizeSymbols(msg.trades);
        const quotes = normalizeSymbols(msg.quotes);
        for (const s of trades) {
          if (s === '*') continue;
          if (!subs.trades.has(s)) {
            subs.trades.add(s);
            changed = true;
          }
        }
        for (const s of quotes) {
          if (s === '*') continue;
          if (!subs.quotes.has(s)) {
            subs.quotes.add(s);
            changed = true;
          }
        }
      }

      if (msg.action === 'unsubscribe') {
        const trades = normalizeSymbols(msg.trades);
        const quotes = normalizeSymbols(msg.quotes);
        if (trades.includes('*')) {
          if (subs.trades.size > 0) {
            subs.trades.clear();
            changed = true;
          }
        } else {
          for (const s of trades) {
            if (subs.trades.delete(s)) changed = true;
          }
        }
        if (quotes.includes('*')) {
          if (subs.quotes.size > 0) {
            subs.quotes.clear();
            changed = true;
          }
        } else {
          for (const s of quotes) {
            if (subs.quotes.delete(s)) changed = true;
          }
        }
      }
    }

    if (changed) {
      scheduleResubscribe(upstream, 100);
    }
  });

  clientWs.on('close', (code, reason) => {
    logger.info(`Client WebSocket closed: ${code} ${reason}`);
    clientInfoByWs.delete(clientWs);
    upstream.clients.delete(clientWs);
    upstream.clientSubs.delete(clientWs);

    if (upstream.clients.size === 0) {
      logger.info(
        `No clients remain for upstream ${upstream.id}; scheduling idle close in ${Math.round(UPSTREAM_IDLE_CLOSE_MS / 1000)}s`,
      );

      if (!upstream.idleCloseTimer) {
        upstream.idleCloseTimer = setTimeout(() => {
          upstream.idleCloseTimer = null;
          if (upstream.clients.size > 0) return;

          logger.info(`Idle closing upstream ${upstream.id}`);

          if (upstream.reconnectTimer) {
            clearTimeout(upstream.reconnectTimer);
            upstream.reconnectTimer = null;
          }
          if (upstream.resubscribeTimer) {
            clearTimeout(upstream.resubscribeTimer);
            upstream.resubscribeTimer = null;
          }

          if (upstream.ws && upstream.ws.readyState === WebSocket.OPEN) {
            upstream.ws.close(1000, 'Idle (no clients)');
          }

          upstreamByUrl.delete(alpacaWsUrl);
        }, UPSTREAM_IDLE_CLOSE_MS);
      }
      return;
    }

    scheduleResubscribe(upstream, 100);
  });

  clientWs.on('error', (err) => {
    logger.error('Client WebSocket error:', err.message);
  });
}

/**
 * Get active connection count
 * @returns {number}
 */
export function getConnectionCount() {
  return clientInfoByWs.size;
}

/**
 * Close all WebSocket connections (for shutdown)
 */
export function closeAllConnections() {
  logger.info(
    `Closing ${clientInfoByWs.size} client WS and ${upstreamByUrl.size} upstream WS`,
  );

  for (const clientWs of clientInfoByWs.keys()) {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(1000, 'Server shutting down');
    }
  }
  clientInfoByWs.clear();

  for (const upstream of upstreamByUrl.values()) {
    upstream.closing = true;
    if (upstream.reconnectTimer) {
      clearTimeout(upstream.reconnectTimer);
      upstream.reconnectTimer = null;
    }
    if (upstream.resubscribeTimer) {
      clearTimeout(upstream.resubscribeTimer);
      upstream.resubscribeTimer = null;
    }
    if (upstream.idleCloseTimer) {
      clearTimeout(upstream.idleCloseTimer);
      upstream.idleCloseTimer = null;
    }
    if (upstream.ws && upstream.ws.readyState === WebSocket.OPEN) {
      upstream.ws.close(1000, 'Server shutting down');
    }
  }
  upstreamByUrl.clear();
}

export default {
  handleWebSocketUpgrade,
  getConnectionCount,
  closeAllConnections,
};
