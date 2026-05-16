import { useState, useEffect, useCallback, useRef } from 'react';
import { logger } from '../utils/logger';

// Error types for different categories
export type ErrorCategory = 
  | 'network'
  | 'authentication'
  | 'validation'
  | 'state'
  | 'component'
  | 'unknown';

export interface AppErrorInfo {
  category: ErrorCategory;
  message: string;
  stack?: string;
  componentStack?: string;
  timestamp: number;
  userAgent: string;
  url: string;
  userId?: string;
  sessionId?: string;
  context?: Record<string, any>;
}

export interface ErrorMetrics {
  totalErrors: number;
  errorsByCategory: Record<ErrorCategory, number>;
  lastError: AppErrorInfo | null;
  errorsPerMinute: number;
  sessionStartTime: number;
}

interface UseErrorHandlerOptions {
  maxErrors?: number;
  enableTelemetry?: boolean;
  enableMetrics?: boolean;
  onError?: (error: AppErrorInfo) => void;
}

interface UseErrorHandlerReturn {
  error: Error | null;
  errorInfo: AppErrorInfo | null;
  errorMetrics: ErrorMetrics;
  handleError: (error: Error | string, category?: ErrorCategory, context?: Record<string, any>) => void;
  clearError: () => void;
  resetMetrics: () => void;
  reportError: (error: Error | string, category?: ErrorCategory, context?: Record<string, any>) => Promise<void>;
}

// Global error metrics (shared across all instances)
const globalMetrics: ErrorMetrics = {
  totalErrors: 0,
  errorsByCategory: {
    network: 0,
    authentication: 0,
    validation: 0,
    state: 0,
    component: 0,
    unknown: 0,
  },
  lastError: null,
  errorsPerMinute: 0,
  sessionStartTime: Date.now(),
};

// Rate limiting for error reporting
const errorRateLimit = {
  windowMs: 60000, // 1 minute
  maxErrors: 10,
  timestamps: [] as number[],
};

let sessionId = crypto.randomUUID();

export const useErrorHandler = (options: UseErrorHandlerOptions = {}): UseErrorHandlerReturn => {
  const {
    maxErrors = 100,
    enableTelemetry = true,
    enableMetrics = true,
    onError,
  } = options;

  const [error, setError] = useState<Error | null>(null);
  const [errorInfo, setErrorInfo] = useState<AppErrorInfo | null>(null);
  const [metrics, setMetrics] = useState<ErrorMetrics>({ ...globalMetrics });
  const metricsRef = useRef(metrics);

  // Update metrics ref when state changes
  useEffect(() => {
    metricsRef.current = metrics;
  }, [metrics]);

  // Rate limiting check
  const isWithinRateLimit = useCallback((): boolean => {
    const now = Date.now();
    // Remove old timestamps
    errorRateLimit.timestamps = errorRateLimit.timestamps.filter(
      timestamp => now - timestamp < errorRateLimit.windowMs
    );
    
    return errorRateLimit.timestamps.length < errorRateLimit.maxErrors;
  }, []);

  // Calculate errors per minute
  const calculateErrorsPerMinute = useCallback((): number => {
    const now = Date.now();
    const recentErrors = errorRateLimit.timestamps.filter(
      timestamp => now - timestamp < 60000
    );
    return recentErrors.length;
  }, []);

  // Create error info object
  const createErrorInfo = useCallback((
    error: Error | string,
    category: ErrorCategory,
    context?: Record<string, any>
  ): AppErrorInfo => {
    const errorObj = typeof error === 'string' ? new Error(error) : error;
    const stack = errorObj.stack;
    
    // Try to get component stack from ErrorInfo if available
    let componentStack: string | undefined;
    try {
      const errorStack = new Error().stack;
      if (errorStack) {
        const lines = errorStack.split('\n');
        const reactLines = lines.filter(line => line.includes('in ') || line.includes('at '));
        componentStack = reactLines.slice(0, 10).join('\n');
      }
    } catch {
      // Ignore component stack errors
    }

    return {
      category,
      message: errorObj.message,
      stack,
      componentStack,
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      userId: undefined,
      sessionId,
      context,
    };
  }, []);

  // Handle error with comprehensive logging and metrics
  const handleError = useCallback((
    error: Error | string,
    category: ErrorCategory = 'unknown',
    context?: Record<string, any>
  ) => {
    try {
      // Rate limiting
      if (!isWithinRateLimit()) {
        console.warn('Error rate limit exceeded, skipping error reporting');
        return;
      }

      // Add timestamp for rate limiting
      errorRateLimit.timestamps.push(Date.now());

      const errorInfo = createErrorInfo(error, category, context);
      
      // Update global metrics
      if (enableMetrics) {
        globalMetrics.totalErrors++;
        globalMetrics.errorsByCategory[category]++;
        globalMetrics.lastError = errorInfo;
        globalMetrics.errorsPerMinute = calculateErrorsPerMinute();
        
        // Cap total errors to prevent memory issues
        if (globalMetrics.totalErrors > maxErrors * 10) {
          globalMetrics.totalErrors = Math.floor(maxErrors * 0.8);
        }
      }

      // Update local state
      setError(typeof error === 'string' ? new Error(error) : error);
      setErrorInfo(errorInfo);
      setMetrics({ ...globalMetrics });

      // Enhanced logging
      const logMessage = `[${category.toUpperCase()}] ${errorInfo.message}`;
      
      if (category === 'network') {
        logger.error(logMessage, { 
          ...errorInfo.context, 
          stack: errorInfo.stack,
          url: errorInfo.url 
        });
      } else if (category === 'authentication') {
        logger.warn(logMessage, { 
          ...errorInfo.context, 
          userId: errorInfo.userId,
          url: errorInfo.url 
        });
      } else {
        logger.error(logMessage, { 
          ...errorInfo.context, 
          stack: errorInfo.stack,
          componentStack: errorInfo.componentStack 
        });
      }

      // Call optional error handler
      if (onError) {
        onError(errorInfo);
      }

      // Trigger custom error event for monitoring
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('appError', { 
          detail: errorInfo 
        }));
      }

    } catch (handlerError) {
      // Fallback logging if error handler itself fails
      console.error('Error in error handler:', handlerError);
    }
  }, [maxErrors, enableMetrics, onError, createErrorInfo, isWithinRateLimit, calculateErrorsPerMinute]);

  // Clear current error
  const clearError = useCallback(() => {
    setError(null);
    setErrorInfo(null);
  }, []);

  // Reset metrics
  const resetMetrics = useCallback(() => {
    globalMetrics.totalErrors = 0;
    globalMetrics.errorsByCategory = {
      network: 0,
      authentication: 0,
      validation: 0,
      state: 0,
      component: 0,
      unknown: 0,
    };
    globalMetrics.lastError = null;
    globalMetrics.errorsPerMinute = 0;
    errorRateLimit.timestamps = [];
    
    setMetrics({ ...globalMetrics });
  }, []);

  // Report error to external service (placeholder for telemetry)
  const reportError = useCallback(async (
    error: Error | string,
    category: ErrorCategory = 'unknown',
    context?: Record<string, any>
  ): Promise<void> => {
    if (!enableTelemetry) return;

    const errorInfo = createErrorInfo(error, category, context);

    try {
      // Here you would send to your telemetry service
      // Example: Sentry, LogRocket, Datadog, etc.
      
      // For now, we'll just log it
      logger.info('Error reported to telemetry', { 
        errorInfo,
        sessionId,
        environment: import.meta.env?.MODE || 'development'
      });

    } catch (reportError) {
      console.error('Failed to report error to telemetry:', reportError);
      // Don't throw here to avoid infinite error loops
    }
  }, [enableTelemetry, createErrorInfo]);

  // Update metrics periodically
  useEffect(() => {
    const interval = setInterval(() => {
      if (enableMetrics) {
        globalMetrics.errorsPerMinute = calculateErrorsPerMinute();
        setMetrics({ ...globalMetrics });
      }
    }, 10000); // Update every 10 seconds

    return () => clearInterval(interval);
  }, [enableMetrics, calculateErrorsPerMinute]);

  return {
    error,
    errorInfo,
    errorMetrics: metrics,
    handleError,
    clearError,
    resetMetrics,
    reportError,
  };
};