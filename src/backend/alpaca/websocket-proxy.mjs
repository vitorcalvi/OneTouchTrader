/**
 * Alpaca WebSocket Proxy
 * 
 * Proxies WebSocket connections from frontend to Alpaca WebSocket API
 * Backend handles authentication with server-side credentials
 * Forwards real-time data bidirectionally
 */

import { parse } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const WebSocket = require('ws');

// Import shared modules
import { getAlpacaCredentials } from '../shared/env-loader.mjs';
import { createLogger } from '../shared/logger.mjs';

const logger = createLogger('ws-proxy');

/**
 * Map of client WebSocket to Alpaca WebSocket
 * @type {Map<WebSocket, { alpacaWs: WebSocket, isLive: boolean }>}
 */
const connectionMap = new Map();

/**
 * Track Alpaca WS connections by feed URL to enforce at-most-one-per-type.
 * @type {Map<string, { alpacaWs: WebSocket, clientWs: WebSocket }>}
 */
const alpacaConnectionsByUrl = new Map();

/** Cooldown in ms before allowing a new Alpaca WS for the same URL after closing one. */
const ALPACA_WS_COOLDOWN_MS = 1500;

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

  logger.info(`Connecting to Alpaca WebSocket: ${alpacaWsUrl} (live=${isLive})`);

  // Deduplicate: close any existing Alpaca WS of the same feed type before creating a new one.
  // This prevents "connection limit exceeded" errors when clients reconnect rapidly.
  const existing = alpacaConnectionsByUrl.get(alpacaWsUrl);
  if (existing && existing.alpacaWs.readyState !== WebSocket.CLOSED) {
    logger.info(`Closing existing Alpaca WS for ${alpacaWsUrl} (dedup)`);
    existing.alpacaWs.removeAllListeners('close');
    existing.alpacaWs.close(1000, 'Reconnecting');
    alpacaConnectionsByUrl.delete(alpacaWsUrl);
  }

  // Connect to Alpaca WebSocket
  const alpacaWs = new WebSocket(alpacaWsUrl);

  // Store connection mapping
  const connectionInfo = { alpacaWs, isLive };
  connectionMap.set(clientWs, connectionInfo);
  alpacaConnectionsByUrl.set(alpacaWsUrl, { alpacaWs, clientWs });

  // Handle Alpaca WebSocket open
  alpacaWs.on('open', () => {
    logger.info('Connected to Alpaca WebSocket');
    
    // Authenticate with Alpaca
    const authMsg = {
      action: 'auth',
      key: credentials.key,
      secret: credentials.secret,
    };
    
    if (alpacaWs.readyState === WebSocket.OPEN) {
      alpacaWs.send(JSON.stringify(authMsg));
      logger.debug('Sent authentication message to Alpaca');
    }
  });

  // Forward messages from Alpaca to client
  alpacaWs.on('message', (data) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      try {
        // Parse and potentially filter/transform messages
        const messages = JSON.parse(data.toString());
        
        // Log successful authentication
        if (Array.isArray(messages)) {
          messages.forEach(msg => {
            if (msg.T === 'success' && msg.msg === 'authenticated') {
              logger.info('Alpaca WebSocket authenticated successfully');
            }
            if (msg.T === 'error') {
              logger.error('Alpaca WebSocket error:', msg.msg);
            }
          });
        }
        
        // Forward to client
        clientWs.send(data);
      } catch (err) {
        logger.error('Error forwarding Alpaca message:', err.message);
      }
    }
  });

  // Handle messages from client to Alpaca
  clientWs.on('message', (data) => {
    if (alpacaWs.readyState === WebSocket.OPEN) {
      try {
        // Parse client message to validate/transform if needed
        const messages = JSON.parse(data.toString());
        
        // Log subscription changes
        if (Array.isArray(messages)) {
          messages.forEach(msg => {
            if (msg.action === 'subscribe') {
              logger.info('Client subscribing:', { trades: msg.trades, quotes: msg.quotes });
            }
            if (msg.action === 'unsubscribe') {
              logger.info('Client unsubscribing:', { trades: msg.trades, quotes: msg.quotes });
            }
          });
        }
        
        // Forward to Alpaca
        alpacaWs.send(data);
      } catch (err) {
        logger.error('Error forwarding client message:', err.message);
      }
    }
  });

  // Handle Alpaca WebSocket errors
  alpacaWs.on('error', (err) => {
    logger.error('Alpaca WebSocket error:', err.message);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify([{
        T: 'error',
        msg: `Alpaca connection error: ${err.message}`,
      }]));
    }
  });

  // Helper to clean up the URL dedup map
  const cleanupUrlTracking = () => {
    const entry = alpacaConnectionsByUrl.get(alpacaWsUrl);
    if (entry && entry.alpacaWs === alpacaWs) {
      alpacaConnectionsByUrl.delete(alpacaWsUrl);
    }
  };

  // Handle Alpaca WebSocket close
  alpacaWs.on('close', (code, reason) => {
    logger.info(`Alpaca WebSocket closed: ${code} ${reason}`);
    connectionMap.delete(clientWs);
    cleanupUrlTracking();
    if (clientWs.readyState === WebSocket.OPEN) {
      const closeCode = (code === 1005 || code === 1006) ? 1000 : (code || 1000);
      clientWs.close(closeCode, reason?.toString());
    }
  });

  // Handle client WebSocket close
  clientWs.on('close', (code, reason) => {
    logger.info(`Client WebSocket closed: ${code} ${reason}`);
    connectionMap.delete(clientWs);
    cleanupUrlTracking();
    if (alpacaWs.readyState === WebSocket.OPEN) {
      const closeCode = (code === 1005 || code === 1006) ? 1000 : (code || 1000);
      alpacaWs.close(closeCode, reason?.toString());
    }
  });

  // Handle client WebSocket errors
  clientWs.on('error', (err) => {
    logger.error('Client WebSocket error:', err.message);
  });
}

/**
 * Get active connection count
 * @returns {number}
 */
export function getConnectionCount() {
  return connectionMap.size;
}

/**
 * Close all WebSocket connections (for shutdown)
 */
export function closeAllConnections() {
  logger.info(`Closing ${connectionMap.size} WebSocket connections`);
  for (const [clientWs, { alpacaWs }] of connectionMap.entries()) {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(1000, 'Server shutting down');
    }
    if (alpacaWs.readyState === WebSocket.OPEN) {
      alpacaWs.close(1000, 'Server shutting down');
    }
  }
  connectionMap.clear();
  alpacaConnectionsByUrl.clear();
}

export default {
  handleWebSocketUpgrade,
  getConnectionCount,
  closeAllConnections,
};
