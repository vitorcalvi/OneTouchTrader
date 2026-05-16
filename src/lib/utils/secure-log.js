const SENSITIVE_KEYS = [
  'password', 'passwordHash', 'secret', 'key', 'token', 'apiKey', 'api_key',
  'apiSecret', 'api_secret', 'secretKey', 'secret_key', 'credential',
  'authorization', 'accessToken', 'access_token', 'refreshToken', 'refresh_token',
  'privateKey', 'private_key', 'passphrase', 'jwt', 'session', 'cookie'
];

const MASK = '***REDACTED***';

function maskSecrets(obj, depth = 0) {
  if (depth > 10) return '[MAX_DEPTH]';
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => maskSecrets(item, depth + 1));
  }
  
  const masked = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = SENSITIVE_KEYS.some(sk => lowerKey.includes(sk.toLowerCase()));
    
    if (isSensitive) {
      masked[key] = MASK;
    } else if (typeof value === 'object' && value !== null) {
      masked[key] = maskSecrets(value, depth + 1);
    } else {
      masked[key] = value;
    }
  }
  return masked;
}

function safeError(error) {
  if (!error) return { message: 'Unknown error' };
  
  if (error instanceof Error) {
    const safe = {
      name: error.name,
      message: error.message
    };
    if (process.env.NODE_ENV !== 'production') {
      safe.stack = error.stack?.split('\n').slice(0, 3).join('\n');
    }
    if (error.code) safe.code = error.code;
    if (error.statusCode) safe.statusCode = error.statusCode;
    if (error.status) safe.status = error.status;
    return safe;
  }
  
  return maskSecrets(error);
}

function secureLog(prefix, data, ...args) {
  if (typeof data === 'object' && data !== null) {
    console.log(prefix, JSON.stringify(maskSecrets(data)), ...args);
  } else {
    console.log(prefix, data, ...args);
  }
}

function secureError(prefix, error, ...args) {
  console.error(prefix, safeError(error), ...args);
}

function secureDebug(prefix, data, ...args) {
  if (process.env.NODE_ENV !== 'production') {
    secureLog(prefix, data, ...args);
  }
}

export { secureLog, secureError, secureDebug, safeError, maskSecrets, MASK };
