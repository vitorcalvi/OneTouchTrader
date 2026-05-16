/**
 * API error classes for consistent error handling across the application
 */

/**
 * Base API error class with standard structure
 */
export class ApiError extends Error {
  code: string;
  status?: number;
  data?: Record<string, unknown>;

  constructor(
    message: string,
    code: string = 'API_ERROR',
    status?: number,
    data?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.data = data;

    // Maintains proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      status: this.status,
      data: this.data,
    };
  }
}

/**
 * Authentication error (401)
 */
export class AuthError extends ApiError {
  constructor(message: string = 'Authentication failed') {
    super(message, 'UNAUTHORIZED', 401);
    this.name = 'AuthError';
  }
}

/**
 * Authorization error (403)
 */
export class ForbiddenError extends ApiError {
  constructor(message: string = 'Access forbidden') {
    super(message, 'FORBIDDEN', 403);
    this.name = 'ForbiddenError';
  }
}

/**
 * Not found error (404)
 */
export class NotFoundError extends ApiError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

/**
 * Rate limit error (429)
 */
export class RateLimitError extends ApiError {
  retryAfter?: number;

  constructor(message: string = 'Too many requests', retryAfter?: number) {
    super(message, 'RATE_LIMIT_EXCEEDED', 429);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * Validation error (422)
 */
export class ValidationError extends ApiError {
  constructor(message: string = 'Validation failed') {
    super(message, 'VALIDATION_ERROR', 422);
    this.name = 'ValidationError';
  }
}

/**
 * Network error (connection issues)
 */
export class NetworkError extends ApiError {
  constructor(message: string = 'Network error') {
    super(message, 'NETWORK_ERROR');
    this.name = 'NetworkError';
  }
}

/**
 * Timeout error
 */
export class TimeoutError extends ApiError {
  constructor(timeout: number = 10000) {
    super(`Request timed out after ${timeout}ms`, 'TIMEOUT_ERROR');
    this.name = 'TimeoutError';
  }
}

/**
 * Type guard to check if an error is an ApiError
 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/**
 * Convert an unknown error to an ApiError
 */
export function toApiError(error: unknown): ApiError {
  if (isApiError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new ApiError(error.message, 'UNKNOWN_ERROR');
  }

  if (typeof error === 'string') {
    return new ApiError(error);
  }

  return new ApiError('An unknown error occurred');
}
