/**
 * Request monitoring and metrics collection
 */

import createLogger from "../../shared/logger.mjs";

const logger = createLogger("Monitor");

/**
 * Metrics collector for tracking request statistics
 */
export class MetricsCollector {
  constructor() {
    this.metrics = {
      totalRequests: 0,
      totalErrors: 0,
      totalResponseTime: 0,
      requestsByEndpoint: {},
      errorsByType: {},
    };
  }

  /**
   * Record a request metric
   * @param {Object} options - Metric options
   * @param {string} options.endpoint - API endpoint
   * @param {number} options.duration - Response time in ms
   * @param {boolean} options.error - Whether the request errored
   */
  recordRequest({ endpoint, duration, error }) {
    this.metrics.totalRequests++;
    this.metrics.totalResponseTime += duration;

    if (!this.metrics.requestsByEndpoint[endpoint]) {
      this.metrics.requestsByEndpoint[endpoint] = { count: 0, errors: 0 };
    }
    this.metrics.requestsByEndpoint[endpoint].count++;

    if (error) {
      this.metrics.totalErrors++;
      this.metrics.requestsByEndpoint[endpoint].errors++;
    }
  }

  /**
   * Get current metrics summary
   * @returns {Object} Metrics summary
   */
  getMetrics() {
    const avgResponseTime =
      this.metrics.totalRequests > 0
        ? this.metrics.totalResponseTime / this.metrics.totalRequests
        : 0;

    return {
      ...this.metrics,
      avgResponseTime: Math.round(avgResponseTime * 100) / 100,
      errorRate:
        this.metrics.totalRequests > 0
          ? (this.metrics.totalErrors / this.metrics.totalRequests) * 100
          : 0,
    };
  }

  /**
   * Reset metrics
   */
  reset() {
    this.metrics = {
      totalRequests: 0,
      totalErrors: 0,
      totalResponseTime: 0,
      requestsByEndpoint: {},
      errorsByType: {},
    };
  }
}

// Global metrics instance
export const metrics = new MetricsCollector();

/**
 * Request timing middleware factory
 * @returns {Function} Express-style middleware
 */
export function createTimingMiddleware() {
  return (req, res, next) => {
    const start = Date.now();

    // Track response
    const originalEnd = res.end;
    res.end = function (...args) {
      const duration = Date.now() - start;
      metrics.recordRequest({
        endpoint: req.url,
        duration,
        error: res.statusCode >= 400,
      });
      originalEnd.apply(this, args);
    };

    next();
  };
}

/**
 * Log slow requests (over threshold)
 * @param {number} thresholdMs - Threshold in milliseconds
 */
export function logSlowRequests(thresholdMs = 1000) {
  return (req, res, next) => {
    const start = Date.now();
    const originalEnd = res.end;

    res.end = function (...args) {
      const duration = Date.now() - start;
      if (duration > thresholdMs) {
        logger.warn(
          `Slow request detected: ${req.method} ${req.url} took ${duration}ms`,
        );
      }
      originalEnd.apply(this, args);
    };

    next();
  };
}

export default metrics;
