import Anthropic from '@anthropic-ai/sdk';

// Singleton pattern for server-side usage
let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

// Model constant for consistency
export const CLAUDE_MODEL = 'claude-sonnet-4-5-20250929';

// Retry configuration
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 2000;
const RATE_LIMIT_DELAY_MS = 30000;

/**
 * Check if an error is retryable
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Anthropic.APIError) {
    // Rate limit or server errors
    if (error.status === 429 || error.status >= 500) {
      return true;
    }
  }

  // Check error message for common retryable patterns
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  const retryablePatterns = [
    '429',
    'rate limit',
    'overloaded',
    'network',
    'timeout',
    'fetch failed',
    'enotfound',
    'econnrefused'
  ];

  return retryablePatterns.some(pattern => message.includes(pattern));
}

/**
 * Check if error is specifically a rate limit error
 */
function isRateLimitError(error: unknown): boolean {
  if (error instanceof Anthropic.APIError && error.status === 429) {
    return true;
  }
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return message.includes('429') || message.includes('rate limit');
}

/**
 * Calculate retry delay with exponential backoff and jitter
 */
function getRetryDelay(attempt: number, isRateLimit: boolean): number {
  const baseDelay = isRateLimit ? RATE_LIMIT_DELAY_MS : BASE_DELAY_MS;
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  // Add jitter (0-25% of delay)
  const jitter = Math.random() * 0.25 * exponentialDelay;
  return exponentialDelay + jitter;
}

/**
 * Retry wrapper for API calls with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  context: string
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (!isRetryableError(error)) {
        // Non-retryable error, throw immediately
        throw error;
      }

      if (attempt < MAX_RETRIES - 1) {
        const delay = getRetryDelay(attempt, isRateLimitError(error));
        console.warn(
          `[Anthropic] ${context} failed (attempt ${attempt + 1}/${MAX_RETRIES}), ` +
          `retrying in ${Math.round(delay / 1000)}s...`,
          error instanceof Error ? error.message : error
        );
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // All retries exhausted
  console.error(`[Anthropic] ${context} failed after ${MAX_RETRIES} attempts`);
  throw lastError;
}
