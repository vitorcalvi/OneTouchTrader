import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOG_DIR = path.join(__dirname, '../../../logs');
const INVALID_REQUESTS_FILE = path.join(LOG_DIR, 'invalid-requests.jsonl');

// Ensure logs directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * Logs an invalid request to a file for later analysis.
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 * @param {any} body - The request body (if available)
 * @param {Error|string} error - The error message or object
 */
export function logInvalidRequest(req, res, body, error) {
  const statusCode = res.statusCode || 500;
  
  // Only log if it's an error status code (>= 400)
  if (statusCode < 400) return;

  const logEntry = {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
    path: req.path || (req.url ? new URL(req.url, 'http://localhost').pathname : 'unknown'),
    headers: sanitizeHeaders(req.headers),
    body: body || {},
    statusCode,
    error: error instanceof Error ? error.message : error || 'Unknown error',
    stack: error instanceof Error ? error.stack : undefined
  };

  try {
    fs.appendFileSync(INVALID_REQUESTS_FILE, JSON.stringify(logEntry) + '\n');
  } catch (err) {
    console.error('[RequestLogger] Failed to write to log file:', err.message);
  }
}

/**
 * Sanitize headers to remove sensitive information
 */
function sanitizeHeaders(headers) {
  if (!headers) return {};
  const sanitized = { ...headers };
  const sensitiveHeaders = [
    'authorization',
    'apca-api-key-id',
    'apca-api-secret-key',
    'cookie',
    'x-user-id'
  ];

  sensitiveHeaders.forEach(h => {
    if (sanitized[h]) {
      sanitized[h] = '[REDACTED]';
    }
  });

  return sanitized;
}

/**
 * Express middleware for logging invalid requests
 */
export function expressRequestLogger(req, res, next) {
  const oldJson = res.json;
  const oldSend = res.send;

  // Capture the request body
  // Note: This assumes express.json() or similar has already run
  
  res.json = function(data) {
    if (res.statusCode >= 400) {
      logInvalidRequest(req, res, req.body, data?.error || 'JSON Error');
    }
    return oldJson.apply(res, arguments);
  };

  res.send = function(data) {
    if (res.statusCode >= 400) {
      let errorMsg = 'Send Error';
      try {
        if (typeof data === 'string') {
          const parsed = JSON.parse(data);
          errorMsg = parsed.error || errorMsg;
        }
      } catch (e) {
        errorMsg = data;
      }
      logInvalidRequest(req, res, req.body, errorMsg);
    }
    return oldSend.apply(res, arguments);
  };

  next();
}
