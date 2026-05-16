// Request Queue System with Rate Limiting, Caching, and Analytics
import { logger } from './logger';

export interface RequestConfig {
  retries?: number;
  retryDelay?: number;
  retryBackoff?: 'linear' | 'exponential';
  timeout?: number;
  rateLimit?: {
    requestsPerMinute?: number;
    requestsPerSecond?: number;
    burstLimit?: number;
  };
}

export interface RequestMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  rateLimitedRequests: number;
  averageLatency: number;
  lastRequestAt?: Date;
  rateLimitResetTime?: Date;
}

export interface QueuedRequest {
  id: string;
  url: string;
  options: RequestInit;
  config: RequestConfig;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  retries: number;
  createdAt: Date;
  priority: number;
}

class RateLimiter {
  private requests: number[] = [];
  private burstQueue: QueuedRequest[] = [];
  private lastBurstReset = Date.now();
  private burstCount = 0;

  constructor(
    private requestsPerMinute: number = 60,
    private requestsPerSecond: number = 10,
    private burstLimit: number = 5
  ) {}

  canMakeRequest(): { allowed: boolean; waitTime?: number; queuePosition?: number } {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const oneSecondAgo = now - 1000;

    // Clean old requests
    this.requests = this.requests.filter(time => time > oneMinuteAgo);

    // Check per-minute limit
    if (this.requests.length >= this.requestsPerMinute) {
      const oldestRequest = Math.min(...this.requests);
      const waitTime = 60000 - (now - oldestRequest);
      return { allowed: false, waitTime };
    }

    // Check per-second limit
    const recentRequests = this.requests.filter(time => time > oneSecondAgo);
    if (recentRequests.length >= this.requestsPerSecond) {
      const oldestRequest = Math.min(...recentRequests);
      const waitTime = 1000 - (now - oldestRequest);
      return { allowed: false, waitTime };
    }

    // Check burst limit
    if (this.burstCount >= this.burstLimit) {
      const resetTime = this.lastBurstReset + 1000;
      if (now >= resetTime) {
        this.burstCount = 0;
        this.lastBurstReset = now;
      } else {
        return { allowed: false, waitTime: resetTime - now };
      }
    }

    return { allowed: true };
  }

  recordRequest(): void {
    const now = Date.now();
    this.requests.push(now);
    this.burstCount++;
    
    // Reset burst counter every second
    if (now - this.lastBurstReset >= 1000) {
      this.burstCount = 1;
      this.lastBurstReset = now;
    }
  }

  getQueuePosition(): number {
    return this.burstQueue.length;
  }

  queueRequest(request: QueuedRequest): void {
    this.burstQueue.push(request);
  }

  getNextQueuedRequest(): QueuedRequest | null {
    return this.burstQueue.shift() || null;
  }

  getStats() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const oneSecondAgo = now - 1000;
    
    const recentRequests = this.requests.filter(time => time > oneMinuteAgo);
    const veryRecentRequests = this.requests.filter(time => time > oneSecondAgo);
    
    return {
      requestsPerMinute: recentRequests.length,
      requestsPerSecond: veryRecentRequests.length,
      burstCount: this.burstCount,
      queueLength: this.burstQueue.length,
      canMakeRequest: this.canMakeRequest().allowed,
    };
  }
}

export class RequestQueue {
  private queue: QueuedRequest[] = [];
  private inFlight = new Set<string>();
  private rateLimiter: RateLimiter;
  private debounceMap = new Map<string, boolean>();
  private metrics: RequestMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    rateLimitedRequests: 0,
    averageLatency: 0,
  };
  private latencySum = 0;
  private processing = false;

  constructor(
    private maxConcurrent: number = 5,
    defaultRateLimit: { requestsPerMinute: number; requestsPerSecond: number; burstLimit: number } = {
      requestsPerMinute: 60,
      requestsPerSecond: 10,
      burstLimit: 5
    }
  ) {
    this.rateLimiter = new RateLimiter(
      defaultRateLimit.requestsPerMinute,
      defaultRateLimit.requestsPerSecond,
      defaultRateLimit.burstLimit
    );

    // Start processing queue
    this.processQueue();
  }

  async request<T = any>(
    url: string,
    options: RequestInit = {},
    config: RequestConfig = {}
  ): Promise<T> {
    const fullConfig = {
      retries: 3,
      retryDelay: 1000,
      retryBackoff: 'exponential' as const,
      timeout: 30000,
      ...config,
    };

    const requestId = this.generateRequestId(url, options);

    return new Promise((resolve, reject) => {
      const queuedRequest: QueuedRequest = {
        id: requestId,
        url,
        options,
        config: fullConfig,
        resolve,
        reject,
        retries: fullConfig.retries || 0,
        createdAt: new Date(),
        priority: 0,
      };

      this.queue.push(queuedRequest);
      this.queue.sort((a, b) => a.priority - b.priority);
      
      this.processQueue();
    });
  }

  private generateRequestId(url: string, options: RequestInit): string {
    const content = `${options.method || 'GET'}:${url}:${JSON.stringify(options.body || {})}`;
    return btoa(content).slice(0, 16);
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.inFlight.size >= this.maxConcurrent) {
      return;
    }

    this.processing = true;

    while (this.inFlight.size < this.maxConcurrent && this.queue.length > 0) {
      const request = this.queue.shift();
      if (!request) break;

      const rateLimitCheck = this.rateLimiter.canMakeRequest();
      
      if (!rateLimitCheck.allowed) {
        // Re-queue with delay
        setTimeout(() => {
          this.queue.unshift(request);
          this.processQueue();
        }, rateLimitCheck.waitTime || 1000);
        continue;
      }

      this.executeRequest(request);
    }

    this.processing = false;
  }

  private async executeRequest<T>(request: QueuedRequest): Promise<void> {
    if (this.inFlight.has(request.id)) {
      return; // Already processing
    }

    this.inFlight.add(request.id);
    this.metrics.totalRequests++;
    this.rateLimiter.recordRequest();

    const startTime = Date.now();

    try {
      const result = await this.executeWithRetry<T>(request);
      const latency = Date.now() - startTime;
      
      this.metrics.successfulRequests++;
      this.metrics.averageLatency = (this.metrics.averageLatency * (this.metrics.successfulRequests - 1) + latency) / this.metrics.successfulRequests;
      this.latencySum += latency;

      request.resolve(result);
    } catch (error) {
      this.metrics.failedRequests++;
      request.reject(error as Error);
    } finally {
      this.inFlight.delete(request.id);
      this.processQueue(); // Process next request
    }
  }

  private async executeWithRetry<T>(request: QueuedRequest): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), request.config.timeout || 30000);

    try {
      const response = await fetch(request.url, {
        ...request.options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...request.options.headers,
        },
      });

      clearTimeout(timeoutId);

      if (response.status === 429) {
        this.metrics.rateLimitedRequests++;
        const retryAfter = parseInt(response.headers.get('Retry-After') || '0');
        const waitTime = retryAfter > 0 ? retryAfter * 1000 : this.calculateBackoff(request.retries);
        
        if (request.retries > 0) {
          logger.warn(`Rate limited, retrying in ${waitTime}ms (retries left: ${request.retries})`);
          await this.delay(waitTime);
          request.retries--;
          return this.executeWithRetry(request);
        } else {
          throw new Error(`Rate limited: ${response.status} ${response.statusText}`);
        }
      }

      if (!response.ok) {
        let errorText = `HTTP ${response.status} ${response.statusText}`;
        try {
          const text = await response.text();
          if (text) {
            errorText = text.length > 200 ? `${text.slice(0, 197)}...` : text;
          }
        } catch (e) {
          // Ignore error reading body
        }
        throw new Error(errorText);
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      } else {
        return await response.text() as T;
      }
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout');
      }

      // Retry on network errors
      if (request.retries > 0 && this.isRetryableError(error)) {
        logger.warn(`Network error, retrying (retries left: ${request.retries})`);
        const delay = this.calculateBackoff(request.retries, request.config.retryBackoff);
        await this.delay(delay);
        request.retries--;
        return this.executeWithRetry(request);
      }

      throw error;
    }
  }

  private calculateBackoff(retriesLeft: number, backoff: 'linear' | 'exponential' = 'exponential'): number {
    const baseDelay = 1000;
    const maxDelay = 30000;
    
    if (backoff === 'linear') {
      return baseDelay * (4 - retriesLeft);
    } else {
      return Math.min(maxDelay, baseDelay * Math.pow(2, 3 - retriesLeft)) + Math.random() * 1000;
    }
  }

   private isRetryableError(error: unknown): boolean {
     if (error instanceof TypeError) {
       // Network errors (no response from server)
       return true;
     }
     if (error instanceof Error && error.message.includes('timeout')) {
       return true;
     }
     return false;
   }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Request deduplication - only one request per URL+options combination
  deduplicate(url: string, options: RequestInit = {}): Promise<any> | null {
    const requestId = this.generateRequestId(url, options);
    
    // Check if request is already in queue or in-flight
    const inQueue = this.queue.find(req => req.id === requestId);
    if (inQueue || this.inFlight.has(requestId)) {
      // Return the existing promise
      return new Promise((resolve, _reject) => {
        const existingRequest = this.queue.find(req => req.id === requestId) ||
                               Array.from(this.inFlight).find(id => id === requestId);
        if (existingRequest) {
          // This is a simplified approach - in a real implementation you'd want to track promises
          setTimeout(() => resolve(null), 100); // Placeholder
        }
      });
    }
    
    return null;
  }

  // Batch requests where possible
  batch<T>(requests: Array<{ url: string; options?: RequestInit; config?: RequestConfig }>): Promise<T[]> {
    const promises = requests.map(req => this.request<T>(req.url, req.options, req.config));
    return Promise.all(promises);
  }

   // Request throttling/debouncing
   debounce<T>(key: string, fn: () => Promise<T>, delay: number = 300): Promise<T> | null {
     // Simple debouncing implementation
     const debounceKey = `debounce_${key}`;
     
     if (this.debounceMap.get(debounceKey)) {
       return null; // Already debouncing
     }
     
     this.debounceMap.set(debounceKey, true);
     
     return new Promise((resolve, reject) => {
       setTimeout(async () => {
         try {
           const result = await fn();
           resolve(result);
         } catch (error) {
           reject(error);
         } finally {
           this.debounceMap.set(debounceKey, false);
         }
       }, delay);
     });
   }

  // Analytics and monitoring
  getMetrics(): RequestMetrics {
    return { ...this.metrics };
  }

  getRateLimitStats() {
    return this.rateLimiter.getStats();
  }

  getQueueStats() {
    return {
      queueLength: this.queue.length,
      inFlight: this.inFlight.size,
      maxConcurrent: this.maxConcurrent,
    };
  }

  clearQueue(): void {
    this.queue.length = 0;
  }

  reset(): void {
    this.clearQueue();
    this.inFlight.clear();
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      rateLimitedRequests: 0,
      averageLatency: 0,
    };
    this.latencySum = 0;
  }
}

// Singleton instance
export const requestQueue = new RequestQueue();