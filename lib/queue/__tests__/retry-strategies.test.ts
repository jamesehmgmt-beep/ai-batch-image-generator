import { describe, it, expect } from 'vitest';
import { classifyError, calculateBackoff, sleep } from '../retry-strategies';

describe('classifyError', () => {
  it('classifies 401 errors as non-retryable auth errors', () => {
    const result = classifyError('Non-retryable error (401): Unauthorized');
    expect(result.retryable).toBe(false);
    expect(result.strategy).toBe('immediate');
    expect(result.userMessage).toContain('authentication');
  });

  it('classifies 402 errors as non-retryable payment errors', () => {
    const result = classifyError('Non-retryable error (402): Payment required');
    expect(result.retryable).toBe(false);
    expect(result.strategy).toBe('immediate');
    expect(result.userMessage).toContain('payment');
  });

  it('classifies 422 errors as non-retryable validation errors', () => {
    const result = classifyError('Non-retryable error (422): Invalid input');
    expect(result.retryable).toBe(false);
    expect(result.strategy).toBe('immediate');
    expect(result.userMessage).toContain('Invalid');
  });

  it('classifies 429 errors as retryable rate limits', () => {
    const result = classifyError('Retryable error (429): Too Many Requests');
    expect(result.retryable).toBe(true);
    expect(result.strategy).toBe('exponential');
    expect(result.userMessage).toContain('Rate limited');
  });

  it('classifies 5xx errors as retryable server errors', () => {
    const result = classifyError('Retryable error (503): Service Unavailable');
    expect(result.retryable).toBe(true);
    expect(result.strategy).toBe('exponential');
    expect(result.userMessage).toContain('Server error');
  });

  it('classifies 500 errors as retryable server errors', () => {
    const result = classifyError('Internal Server Error (500)');
    expect(result.retryable).toBe(true);
    expect(result.strategy).toBe('exponential');
    expect(result.statusCode).toBe(500);
  });

  it('classifies network errors as retryable', () => {
    const result = classifyError('ECONNREFUSED');
    expect(result.retryable).toBe(true);
    expect(result.strategy).toBe('exponential');
  });

  it('classifies timeout errors as retryable', () => {
    const result = classifyError('Request timeout');
    expect(result.retryable).toBe(true);
    expect(result.strategy).toBe('exponential');
  });

  it('defaults to retryable for unknown errors', () => {
    const result = classifyError('Something weird happened');
    expect(result.retryable).toBe(true);
    expect(result.strategy).toBe('exponential');
  });

  it('handles undefined error message', () => {
    const result = classifyError(undefined);
    expect(result.retryable).toBe(true);
    expect(result.strategy).toBe('exponential');
  });

  it('handles empty error message', () => {
    const result = classifyError('');
    expect(result.retryable).toBe(true);
    expect(result.strategy).toBe('exponential');
  });
});

describe('calculateBackoff', () => {
  it('returns 0 for immediate strategy', () => {
    expect(calculateBackoff(1, 'immediate')).toBe(0);
    expect(calculateBackoff(5, 'immediate')).toBe(0);
    expect(calculateBackoff(10, 'immediate')).toBe(0);
  });

  it('returns 3000 for fixed strategy', () => {
    expect(calculateBackoff(1, 'fixed')).toBe(3000);
    expect(calculateBackoff(5, 'fixed')).toBe(3000);
    expect(calculateBackoff(10, 'fixed')).toBe(3000);
  });

  it('returns exponential values with jitter', () => {
    // Run multiple times to verify jitter
    const delays = Array.from({ length: 10 }, () =>
      calculateBackoff(3, 'exponential')
    );

    // All should be different (jitter creates randomness)
    const uniqueDelays = new Set(delays);
    expect(uniqueDelays.size).toBeGreaterThan(1);

    // All should be <= 4000 (base * 2^2 = 1000 * 4)
    delays.forEach((d) => expect(d).toBeLessThanOrEqual(4000));
  });

  it('increases delay with attempt number', () => {
    // Get multiple samples at each attempt level
    const getAvgDelay = (attempt: number) => {
      const samples = Array.from({ length: 100 }, () =>
        calculateBackoff(attempt, 'exponential')
      );
      return samples.reduce((a, b) => a + b, 0) / samples.length;
    };

    const avg1 = getAvgDelay(1); // max 1000
    const avg3 = getAvgDelay(3); // max 4000
    const avg5 = getAvgDelay(5); // max 16000

    // Average delays should increase (due to higher caps)
    expect(avg3).toBeGreaterThan(avg1);
    expect(avg5).toBeGreaterThan(avg3);
  });

  it('caps at 60 seconds', () => {
    // Attempt 10: 1000 * 2^9 = 512000, should cap at 60000
    const delays = Array.from({ length: 100 }, () =>
      calculateBackoff(10, 'exponential')
    );
    delays.forEach((d) => expect(d).toBeLessThanOrEqual(60000));
  });

  it('caps at 60 seconds for very high attempt numbers', () => {
    // Attempt 20: would be astronomical without cap
    const delays = Array.from({ length: 100 }, () =>
      calculateBackoff(20, 'exponential')
    );
    delays.forEach((d) => expect(d).toBeLessThanOrEqual(60000));
  });

  it('returns integer values', () => {
    const delays = Array.from({ length: 100 }, () =>
      calculateBackoff(5, 'exponential')
    );
    delays.forEach((d) => expect(Number.isInteger(d)).toBe(true));
  });
});

describe('sleep', () => {
  it('waits for specified duration', async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    // Allow variance for timing imprecision
    expect(elapsed).toBeGreaterThanOrEqual(45);
    expect(elapsed).toBeLessThan(150); // Should not take too long
  });

  it('returns a promise that resolves', async () => {
    const result = sleep(10);
    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBeUndefined();
  });

  it('handles zero milliseconds', async () => {
    const start = Date.now();
    await sleep(0);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50); // Should be nearly instant
  });
});
