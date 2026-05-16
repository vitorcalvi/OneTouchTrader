// Enhanced Logger utility with singleton pattern, security, and telemetry

// Determine environment - check multiple indicators
const isDev = import.meta.env?.DEV || 
              import.meta.env?.MODE === 'development' || 
              (typeof process !== 'undefined' && process.env.NODE_ENV === 'development');

const enableVerboseLogging = import.meta.env?.VITE_CRYPTO_VERBOSE === 'true';

// Redaction patterns for sensitive data
const SENSITIVE_PATTERNS = [
  /api[_-]?key/i,
  /secret[_-]?key/i,
  /password/i,
  /token/i,
  /credential/i,
  /\bauth\b/i
];

// Configuration for logger behavior
interface LoggerConfig {
  enableRedaction: boolean;
  enableTelemetry: boolean;
  maxMessageLength: number;
  telemetryEndpoint?: string;
}

class SecureLogger {
  private config: LoggerConfig;
  private messageCount = 0;
  private lastCleanup = Date.now();
  private telemetryBuffer: Array<{ timestamp: number; level: string; message: string }> = [];

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      enableRedaction: true,
      enableTelemetry: false,
      maxMessageLength: 1000,
      ...config
    };
  }

  private shouldRedact(message: string): boolean {
    return this.config.enableRedaction && SENSITIVE_PATTERNS.some(pattern => pattern.test(message));
  }

  private redactSensitiveData(args: unknown[]): unknown[] {
    return args.map(arg => {
      if (typeof arg === 'string') {
        let redacted = arg;
        SENSITIVE_PATTERNS.forEach(pattern => {
          redacted = redacted.replace(pattern, '[REDACTED]');
        });
        return redacted;
      }
      if (typeof arg === 'object' && arg !== null) {
        // Deep clone and redact sensitive fields
        const cloned = JSON.parse(JSON.stringify(arg));
        const redactField = (obj: any) => {
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
      }
      return arg;
    });
  }

  private recordTelemetry(level: string, message: string) {
    if (!this.config.enableTelemetry) return;

    this.telemetryBuffer.push({
      timestamp: Date.now(),
      level,
      message: message.substring(0, 100) // Truncate for telemetry
    });

    // Cleanup old telemetry every minute
    const now = Date.now();
    if (now - this.lastCleanup > 60000) {
      this.telemetryBuffer = this.telemetryBuffer.filter(t => now - t.timestamp < 300000);
      this.lastCleanup = now;
    }
  }

  private formatMessage(level: string, ...args: unknown[]): string {
    const redactedArgs = this.shouldRedact(args.join(' ')) ? this.redactSensitiveData(args) : args;
    const message = redactedArgs.map(arg => 
      typeof arg === 'string' ? arg.substring(0, this.config.maxMessageLength) : arg
    ).join(' ');
    
    this.recordTelemetry(level, message);
    return `[${level}] ${message}`;
  }

  public configure(config: Partial<LoggerConfig>) {
    this.config = { ...this.config, ...config };
  }

  public getStats() {
    return {
      messageCount: this.messageCount,
      telemetryBufferSize: this.telemetryBuffer.length,
      config: this.config
    };
  }

  public debug(...args: unknown[]): void {
    if (isDev && enableVerboseLogging) {
      this.messageCount++;
      console.log(this.formatMessage('DEBUG', ...args));
    }
  }

  public info(...args: unknown[]): void {
    if (isDev) {
      this.messageCount++;
      console.info(this.formatMessage('INFO', ...args));
    }
  }

  public warn(...args: unknown[]): void {
    this.messageCount++;
    console.warn(this.formatMessage('WARN', ...args));
  }

  public error(...args: unknown[]): void {
    this.messageCount++;
    console.error(this.formatMessage('ERROR', ...args));
  }

  public trade(...args: unknown[]): void {
    if (isDev) {
      this.messageCount++;
      console.log(this.formatMessage('TRADE', ...args));
    }
  }

  public ws(...args: unknown[]): void {
    if (isDev) {
      this.messageCount++;
      console.log(this.formatMessage('WS', ...args));
    }
  }

  public bybit(...args: unknown[]): void {
    if (isDev) {
      this.messageCount++;
      // Special handling for Bybit credentials - always redact in production
      const processedArgs = this.shouldRedact(args.join(' ')) ? this.redactSensitiveData(args) : args;
      console.log(this.formatMessage('BYBIT', ...processedArgs));
    }
  }

  public signal(...args: unknown[]): void {
    if (isDev && enableVerboseLogging) {
      this.messageCount++;
      console.log(this.formatMessage('SIGNAL', ...args));
    }
  }
}

// Singleton instance with secure defaults
const logger = new SecureLogger({
  enableRedaction: true,
  enableTelemetry: false, // Enable for production monitoring
  maxMessageLength: 1000
});

export { logger, SecureLogger };
export default logger;
