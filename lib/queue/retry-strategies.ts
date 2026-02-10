// lib/queue/retry-strategies.ts
// Error classification and exponential backoff utilities for retry system

import {
  ErrorClassification,
  RetryStrategy,
  ErrorCategory,
} from '../types/errors';

/**
 * Classify an error message to determine retry behavior
 * Parses error strings to identify error types and return appropriate classification
 */
export function classifyError(errorMessage?: string): ErrorClassification {
  // Default to retryable for undefined/empty errors (safer to retry)
  if (!errorMessage) {
    return {
      retryable: true,
      strategy: 'exponential',
      userMessage: 'Generation failed, retrying...',
    };
  }

  const lowerMessage = errorMessage.toLowerCase();

  // AUTH_ERROR: 401 Unauthorized - API key invalid
  if (lowerMessage.includes('401') || lowerMessage.includes('unauthorized')) {
    return {
      retryable: false,
      strategy: 'immediate',
      userMessage: 'API authentication failed - check KIE_API_KEY',
      statusCode: 401,
    };
  }

  // AUTH_ERROR: 402 Payment Required
  if (lowerMessage.includes('402') || lowerMessage.includes('payment')) {
    return {
      retryable: false,
      strategy: 'immediate',
      userMessage: 'API payment required - check kie.ai account balance',
      statusCode: 402,
    };
  }

  // VALIDATION_ERROR: 422 - Invalid input
  if (
    lowerMessage.includes('422') ||
    lowerMessage.includes('validation') ||
    lowerMessage.includes('invalid')
  ) {
    return {
      retryable: false,
      strategy: 'immediate',
      userMessage: 'Invalid request parameters - check image URLs',
      statusCode: 422,
    };
  }

  // RATE_LIMIT: 429 Too Many Requests
  if (lowerMessage.includes('429') || lowerMessage.includes('rate limit')) {
    return {
      retryable: true,
      strategy: 'exponential',
      userMessage: 'Rate limited, waiting before retry...',
      statusCode: 429,
    };
  }

  // SERVER_ERROR: 5xx errors
  if (errorMessage.match(/5\d{2}/)) {
    const statusMatch = errorMessage.match(/5(\d{2})/);
    const statusCode = statusMatch ? parseInt(`5${statusMatch[1]}`, 10) : 500;
    return {
      retryable: true,
      strategy: 'exponential',
      userMessage: 'Server error, retrying...',
      statusCode,
    };
  }

  // NETWORK_ERROR: Connection issues
  if (
    lowerMessage.includes('timeout') ||
    lowerMessage.includes('econnrefused') ||
    lowerMessage.includes('econnreset') ||
    lowerMessage.includes('network')
  ) {
    return {
      retryable: true,
      strategy: 'exponential',
      userMessage: 'Network error, retrying...',
    };
  }

  // UNKNOWN_ERROR: Default to retryable with exponential backoff (safer)
  return {
    retryable: true,
    strategy: 'exponential',
    userMessage: 'Generation failed, retrying...',
  };
}

/**
 * Calculate backoff delay based on attempt number and strategy
 * Uses exponential backoff with full jitter to prevent thundering herd
 *
 * @param attemptNumber - Current attempt (1-based)
 * @param strategy - Backoff strategy to use
 * @returns Delay in milliseconds
 */
export function calculateBackoff(
  attemptNumber: number,
  strategy: RetryStrategy
): number {
  // Immediate: no delay
  if (strategy === 'immediate') {
    return 0;
  }

  // Fixed: constant 3 second delay
  if (strategy === 'fixed') {
    return 3000;
  }

  // Exponential backoff with full jitter
  const baseDelay = 1000; // 1 second
  const maxDelay = 60000; // 60 seconds cap
  const factor = 2; // doubles each attempt

  // Calculate exponential delay: baseDelay * factor^(attempt-1)
  const exponentialDelay = Math.min(
    baseDelay * Math.pow(factor, attemptNumber - 1),
    maxDelay
  );

  // Apply full jitter: random value between 0 and exponentialDelay
  // This prevents thundering herd when multiple jobs retry simultaneously
  const jitteredDelay = Math.random() * exponentialDelay;

  return Math.floor(jitteredDelay);
}

/**
 * Promise-based sleep utility for use in retry loops
 * @param ms - Milliseconds to sleep
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get error category from error message for logging/metrics
 */
export function getErrorCategory(errorMessage?: string): ErrorCategory {
  if (!errorMessage) {
    return ErrorCategory.UNKNOWN_ERROR;
  }

  const lowerMessage = errorMessage.toLowerCase();

  if (lowerMessage.includes('401') || lowerMessage.includes('unauthorized')) {
    return ErrorCategory.AUTH_ERROR;
  }
  if (lowerMessage.includes('402') || lowerMessage.includes('payment')) {
    return ErrorCategory.AUTH_ERROR;
  }
  if (
    lowerMessage.includes('422') ||
    lowerMessage.includes('validation') ||
    lowerMessage.includes('invalid')
  ) {
    return ErrorCategory.VALIDATION_ERROR;
  }
  if (lowerMessage.includes('429') || lowerMessage.includes('rate limit')) {
    return ErrorCategory.RATE_LIMIT;
  }
  if (errorMessage.match(/5\d{2}/)) {
    return ErrorCategory.SERVER_ERROR;
  }
  if (
    lowerMessage.includes('timeout') ||
    lowerMessage.includes('econnrefused') ||
    lowerMessage.includes('econnreset') ||
    lowerMessage.includes('network')
  ) {
    return ErrorCategory.NETWORK_ERROR;
  }

  return ErrorCategory.UNKNOWN_ERROR;
}
