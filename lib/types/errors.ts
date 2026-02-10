// lib/types/errors.ts
// Error classification types for intelligent retry decisions

/**
 * Strategy for calculating retry delays
 * - exponential: Standard backoff with jitter for transient errors (429, 5xx)
 * - fixed: Constant delay (use for testing or specific scenarios)
 * - immediate: No delay, fail fast (for non-retryable errors)
 */
export type RetryStrategy = 'exponential' | 'fixed' | 'immediate';

/**
 * Result of classifying an error for retry decisions
 */
export interface ErrorClassification {
  /** Whether this error type should be retried */
  retryable: boolean;
  /** Which backoff strategy to use */
  strategy: RetryStrategy;
  /** Human-readable message for UI display */
  userMessage: string;
  /** HTTP status code if applicable */
  statusCode?: number;
}

/**
 * Categories of errors for classification
 */
export enum ErrorCategory {
  /** 401/402 - API key invalid, payment required */
  AUTH_ERROR = 'AUTH_ERROR',
  /** 422 - Bad input, won't work on retry */
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  /** 429 - Too many requests, retry later */
  RATE_LIMIT = 'RATE_LIMIT',
  /** 5xx - Transient server issue */
  SERVER_ERROR = 'SERVER_ERROR',
  /** Timeout, connection refused */
  NETWORK_ERROR = 'NETWORK_ERROR',
  /** Catch-all for unclassified errors */
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}
