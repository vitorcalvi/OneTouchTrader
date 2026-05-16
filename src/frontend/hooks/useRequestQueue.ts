// React hooks for the request queue system
import { useState, useEffect, useRef, useCallback } from 'react';
import { requestQueue, type RequestConfig, type RequestMetrics } from '../utils/requestQueue';
import { logger } from '../utils/logger';

export interface UseRequestOptions<T = any> extends RequestConfig {
  immediate?: boolean;
  dedupe?: boolean;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
}

export interface UseRequestState<T = any> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  metrics: RequestMetrics;
}

export function useRequest<T = any>(
  url: string | null,
  options: UseRequestOptions<T> = {}
) {
  const {
    immediate = false,
    dedupe = true,
    onSuccess,
    onError,
    ...config
  } = options;

  const [state, setState] = useState<UseRequestState<T>>({
    data: null,
    loading: immediate || false,
    error: null,
    metrics: requestQueue.getMetrics(),
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const execute = useCallback(async (requestUrl?: string, requestOptions?: RequestInit) => {
    if (!mountedRef.current) return;

    const targetUrl = requestUrl || url;
    if (!targetUrl) {
      const error = new Error('No URL provided');
      setState(prev => ({ ...prev, error, loading: false }));
      onError?.(error);
      return;
    }

    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      
      const requestConfig: RequestConfig = {
        ...config,
      };

      const result = await requestQueue.request<T>(
        targetUrl,
        requestOptions || {},
        requestConfig
      );

      if (mountedRef.current) {
        setState(prev => ({ 
          ...prev, 
          data: result, 
          loading: false,
          error: null,
          metrics: requestQueue.getMetrics()
        }));
        onSuccess?.(result);
      }

      return result;
    } catch (error) {
      if (mountedRef.current) {
        const err = error as Error;
        setState(prev => ({ 
          ...prev, 
          loading: false, 
          error: err,
          metrics: requestQueue.getMetrics()
        }));
        onError?.(err);
        logger.error('Request failed:', err);
      }
    }
  }, [url, config, onSuccess, onError]);

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  const reset = useCallback(() => {
    setState({
      data: null,
      loading: false,
      error: null,
      metrics: requestQueue.getMetrics(),
    });
  }, []);

  // Auto-execute if immediate is true
  useEffect(() => {
    if (immediate && url) {
      execute();
    }
  }, [url, immediate, execute]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      cancel();
    };
  }, [cancel]);

  return {
    ...state,
    execute,
    cancel,
    reset,
  };
}

export function useDebouncedRequest<T = any>(
  url: string | null,
  delay: number = 300,
  options: UseRequestOptions<T> = {}
) {
  const [debouncedUrl, setDebouncedUrl] = useState(url);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      setDebouncedUrl(url);
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [url, delay]);

  return useRequest(debouncedUrl, options);
}

export function useBatchRequests<T = any>(
  requests: Array<{ url: string; options?: RequestInit; config?: RequestConfig }>,
  options: UseRequestOptions<T[]> = {}
) {
  const { onSuccess, onError } = options;

  const [state, setState] = useState<UseRequestState<T[]>>({
    data: null,
    loading: false,
    error: null,
    metrics: requestQueue.getMetrics(),
  });

  const execute = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));

      const results = await requestQueue.batch<T>(requests);

      setState(prev => ({
        ...prev,
        data: results,
        loading: false,
        error: null,
        metrics: requestQueue.getMetrics()
      }));

      onSuccess?.(results);
      return results;
    } catch (error) {
      const err = error as Error;
      setState(prev => ({
        ...prev,
        loading: false,
        error: err,
        metrics: requestQueue.getMetrics()
      }));
      logger.error('Batch request failed:', err);
      onError?.(err);
    }
  }, [requests, onSuccess, onError]);

  return {
    ...state,
    execute,
  };
}

export function useRateLimitMonitor() {
  const [stats, setStats] = useState(() => requestQueue.getRateLimitStats());
  const [queueStats, setQueueStats] = useState(() => requestQueue.getQueueStats());

  const refreshStats = useCallback(() => {
    setStats(requestQueue.getRateLimitStats());
    setQueueStats(requestQueue.getQueueStats());
  }, []);

  useEffect(() => {
    const interval = setInterval(refreshStats, 1000);
    return () => clearInterval(interval);
  }, [refreshStats]);

  return {
    rateLimit: stats,
    queue: queueStats,
    refreshStats,
  };
}

// Hook for managing request cleanup on component unmount
export function useRequestCleanup() {
  const activeRequests = useRef<Set<string>>(new Set());

  const trackRequest = useCallback((requestId: string) => {
    activeRequests.current.add(requestId);
  }, []);

  const untrackRequest = useCallback((requestId: string) => {
    activeRequests.current.delete(requestId);
  }, []);

  const cleanup = useCallback(() => {
    // Cancel all tracked requests
    activeRequests.current.forEach(requestId => {
      // In a real implementation, you'd store request objects to cancel them
      logger.debug(`Cleaning up request: ${requestId}`);
    });
    activeRequests.current.clear();
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    trackRequest,
    untrackRequest,
    cleanup,
  };
}

// Hook for retrying failed requests with exponential backoff
// FIXED: Removed Rules of Hooks violation - no longer calls useRequest inside useCallback
export function useRetryableRequest<T = any>(
  url: string | null,
  maxRetries: number = 3,
  options: UseRequestOptions<T> = {}
) {
  const [retryCount, setRetryCount] = useState(0);
  const [shouldRetry, setShouldRetry] = useState(true);
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);

  const { onSuccess, onError, ...config } = options;

  const retryRequest = useCallback(async (requestUrl?: string, requestOptions?: RequestInit) => {
    if (!shouldRetry || retryCount >= maxRetries) {
      return;
    }

    const targetUrl = requestUrl || url;
    if (!targetUrl) {
      const err = new Error('No URL provided');
      setError(err);
      onError?.(err);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const requestConfig: RequestConfig = {
        ...config,
        retries: maxRetries - retryCount,
      };

      const result = await requestQueue.request<T>(
        targetUrl,
        requestOptions || {},
        requestConfig
      );

      if (mountedRef.current) {
        setData(result);
        setLoading(false);
        setRetryCount(0);
        setShouldRetry(true);
        onSuccess?.(result);
      }

      return result;
    } catch (err) {
      if (mountedRef.current) {
        const error = err as Error;
        setError(error);
        setLoading(false);
        setRetryCount(prev => {
          const newCount = prev + 1;
          if (newCount >= maxRetries) {
            setShouldRetry(false);
          }
          return newCount;
        });
        onError?.(error);
        logger.error('Retryable request failed:', error);
      }
    }
  }, [url, config, retryCount, shouldRetry, maxRetries, onSuccess, onError]);

  const resetRetry = useCallback(() => {
    setRetryCount(0);
    setShouldRetry(true);
    setData(null);
    setError(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return {
    data,
    loading,
    error,
    retryCount,
    shouldRetry,
    retryRequest,
    resetRetry,
    canRetry: retryCount < maxRetries && shouldRetry,
  };
}
