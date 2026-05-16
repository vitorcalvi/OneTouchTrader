/**
 * Backend Logger Utility
 * Provides structured logging with levels (debug/info/warn/error)
 * Replaces console.log throughout the backend for consistent logging
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

const LOG_LEVEL = process.env.LOG_LEVEL?.toUpperCase() || 
  (process.env.NODE_ENV === 'production' ? 'INFO' : 'DEBUG');

const CURRENT_LEVEL = LOG_LEVELS[LOG_LEVEL] ?? LOG_LEVELS.INFO;

const SENSITIVE_PATTERNS = [
  /api[_-]?key/i,
  /secret[_-]?key/i,
  /password/i,
  /token/i,
  /credential/i,
  /\bauth\b/i
];

function formatTimestamp() {
  return new Date().toISOString();
}

function formatPrefix(level, context) {
  const ts = formatTimestamp();
  const ctx = context ? `[${context}]` : '';
  return `[${ts}] [${level}]${ctx}`;
}

function shouldRedact(message) {
  return SENSITIVE_PATTERNS.some(pattern => pattern.test(message));
}

function redactSensitiveData(args) {
  return args.map(arg => {
    if (typeof arg === 'string') {
      let redacted = arg;
      SENSITIVE_PATTERNS.forEach(pattern => {
        redacted = redacted.replace(pattern, '[REDACTED]');
      });
      return redacted;
    }
    if (typeof arg === 'object' && arg !== null) {
      try {
        const cloned = JSON.parse(JSON.stringify(arg));
        const redactField = (obj) => {
          if (!obj || typeof obj !== 'object') return;
          Object.keys(obj).forEach(key => {
            if (SENSITIVE_PATTERNS.some(pattern => pattern.test(key))) {
              obj[key] = '[REDACTED]';
            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
              redactField(obj[key]);
            }
          });
        };
        redactField(cloned);
        return cloned;
      } catch {
        return arg;
      }
    }
    return arg;
  });
}

class Logger {
  constructor(context = 'App') {
    this.context = context;
  }

  child(context) {
    return new Logger(`${this.context}:${context}`);
  }

  debug(...args) {
    if (CURRENT_LEVEL <= LOG_LEVELS.DEBUG) {
      const processed = shouldRedact(args.join(' ')) ? redactSensitiveData(args) : args;
      console.log(formatPrefix('DEBUG', this.context), ...processed);
    }
  }

  info(...args) {
    if (CURRENT_LEVEL <= LOG_LEVELS.INFO) {
      const processed = shouldRedact(args.join(' ')) ? redactSensitiveData(args) : args;
      console.info(formatPrefix('INFO', this.context), ...processed);
    }
  }

  warn(...args) {
    if (CURRENT_LEVEL <= LOG_LEVELS.WARN) {
      const processed = shouldRedact(args.join(' ')) ? redactSensitiveData(args) : args;
      console.warn(formatPrefix('WARN', this.context), ...processed);
    }
  }

  error(...args) {
    if (CURRENT_LEVEL <= LOG_LEVELS.ERROR) {
      const processed = shouldRedact(args.join(' ')) ? redactSensitiveData(args) : args;
      console.error(formatPrefix('ERROR', this.context), ...processed);
    }
  }

  trade(...args) {
    if (CURRENT_LEVEL <= LOG_LEVELS.INFO) {
      console.log(formatPrefix('TRADE', this.context), ...args);
    }
  }

  ws(...args) {
    if (CURRENT_LEVEL <= LOG_LEVELS.DEBUG) {
      console.log(formatPrefix('WS', this.context), ...args);
    }
  }
}

function createLogger(context) {
  return new Logger(context);
}

export { Logger, createLogger, LOG_LEVELS };
export default createLogger;
