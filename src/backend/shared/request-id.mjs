import { randomUUID } from 'node:crypto';

export function requestIdMiddleware(req, res, next) {
  const requestId = req.headers['x-request-id'] || randomUUID();
  
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  
  const formatWithRequestId = (args) => {
    if (args.length > 0 && typeof args[0] === 'string') {
      return [`[Request-Id: ${requestId}]`, ...args];
    }
    return [`[Request-Id: ${requestId}]`, ...args];
  };
  
  req.log = (...args) => originalLog(...formatWithRequestId(args));
  req.logError = (...args) => originalError(...formatWithRequestId(args));
  req.logWarn = (...args) => originalWarn(...formatWithRequestId(args));
  
  res.on('finish', () => {
    const logFn = res.statusCode >= 400 ? originalError : originalLog;
    logFn(`[Request-Id: ${requestId}] ${req.method} ${req.originalUrl} ${res.statusCode}`);
  });
  
  next();
}

export default requestIdMiddleware;
