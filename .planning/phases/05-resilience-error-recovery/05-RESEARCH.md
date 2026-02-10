# Phase 5: Resilience & Error Recovery - Research

**Researched:** 2026-01-26
**Domain:** Distributed job queue resilience, retry patterns, error recovery
**Confidence:** HIGH

## Summary

This phase adds comprehensive resilience to the existing queue processing system, ensuring that no image generation is ever lost and all failures are handled gracefully with automatic recovery. The research focused on industry-standard patterns for retry logic, orphaned job detection, rate limiting, and error handling in distributed systems.

The current implementation already has a strong foundation with p-queue (concurrency control), p-retry (exponential backoff), and proper database state tracking. However, it lacks automatic retry orchestration at the job level, orphaned job detection, and sophisticated error classification for retry decisions.

The standard approach combines multiple resilience patterns: exponential backoff with jitter for transient failures, immediate abort for non-retryable errors, timestamp-based orphaned job detection, and clear error reporting to users. This creates a self-healing system that maximizes successful completion rates while preventing retry storms and resource exhaustion.

**Primary recommendation:** Build a multi-layer retry system with job-level retry orchestration (wraps p-retry), scheduled orphaned job recovery process, and enhanced error classification that distinguishes transient from permanent failures.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| p-retry | 7.1.1 | Exponential backoff retry logic | Industry standard for promise-based retries, supports AbortError for non-retryable failures, configurable backoff |
| p-queue | 9.1.0 | Concurrency-limited queue | Battle-tested queue management, handles 20 concurrent jobs, prevents overload |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| opossum | Latest | Circuit breaker pattern | If we need to protect against cascading failures to external APIs (optional enhancement) |
| node-cron | Latest | Scheduled task execution | For running orphaned job detection on a schedule (alternative to manual polling) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| p-retry | Custom retry logic | p-retry is battle-tested with proper jitter, backoff, and abort handling - no reason to hand-roll |
| Timestamp-based detection | Heartbeat mechanism | Timestamps are simpler and sufficient for our use case; heartbeats add complexity for marginal benefit |
| Job-level retry | Only API-level retry | Need both layers: API retries handle transient network issues, job retries handle API failures |

**Installation:**
```bash
# Already installed
npm install p-queue@9.1.0 p-retry@7.1.1

# Optional enhancements
npm install opossum node-cron
```

## Architecture Patterns

### Recommended Project Structure
```
lib/
├── queue/
│   ├── generation-queue.ts      # Already exists, needs job-level retry
│   ├── kie-api-client.ts        # Already exists, has API-level retry
│   ├── retry-strategies.ts      # NEW: Retry decision logic
│   └── recovery-manager.ts      # NEW: Orphaned job detection/recovery
├── db/
│   └── job-queries.ts           # NEW: Database queries for stuck jobs
└── types/
    └── errors.ts                # NEW: Error classification types
```

### Pattern 1: Multi-Layer Retry Architecture
**What:** Separate retry concerns into API-level (p-retry in kie-api-client) and job-level (queue manager) retries
**When to use:** When you need to handle both transient network failures and API-level failures differently
**Example:**
```typescript
// API-level retry (already exists in kie-api-client.ts)
// Handles: network timeouts, 429 rate limits, 5xx server errors
export async function createKieAITask(payload: KieAIPayload): Promise<string> {
  return pRetry(
    async () => {
      const response = await fetch(/*...*/);

      // Non-retryable: auth/payment/validation errors
      if (response.status === 401 || response.status === 402 || response.status === 422) {
        throw new AbortError(`Non-retryable error (${response.status})`);
      }

      // Retryable: rate limits, server errors
      if (response.status === 429 || response.status >= 500) {
        throw new Error(`Retryable error (${response.status})`);
      }

      return data.data.taskId;
    },
    {
      retries: 5,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 30000,
      randomize: true, // Jitter prevents thundering herd
    }
  );
}

// Job-level retry (needs to be added to generation-queue.ts)
// Handles: failed generation attempts, orchestrates retries until success
async addGenerationWithRetry(job: GenerationJob): Promise<GenerationResult> {
  const maxRetries = Infinity; // PROC-04: Never skip, retry forever
  let attemptCount = 0;

  while (true) {
    attemptCount++;

    try {
      // Update retry count in database
      await this.updateRetryCount(job.id, attemptCount);

      // Attempt generation (already has API-level retry)
      const result = await this.addGeneration(job);

      if (result.state === GenerationState.COMPLETED) {
        return result;
      }

      // Failed but might be retryable
      const errorType = classifyError(result.errorMessage);

      if (!errorType.retryable) {
        // Permanent failure - don't retry
        return result;
      }

      // Calculate backoff with jitter
      const backoffMs = calculateBackoff(attemptCount, errorType.strategy);
      await sleep(backoffMs);

    } catch (error) {
      // Unexpected error - log and retry with backoff
      console.error(`[Retry] Attempt ${attemptCount} failed:`, error);
      const backoffMs = calculateBackoff(attemptCount, 'exponential');
      await sleep(backoffMs);
    }
  }
}
```

### Pattern 2: Error Classification for Retry Decisions
**What:** Categorize errors into retryable vs. non-retryable based on HTTP status and error type
**When to use:** Always - prevents wasting retries on permanent failures like auth errors
**Example:**
```typescript
// Source: Based on AWS best practices and p-retry documentation
interface ErrorClassification {
  retryable: boolean;
  strategy: 'exponential' | 'fixed' | 'immediate';
  userMessage: string;
}

function classifyError(errorMessage?: string): ErrorClassification {
  if (!errorMessage) {
    return {
      retryable: true,
      strategy: 'exponential',
      userMessage: 'Generation failed, retrying...'
    };
  }

  // Non-retryable: Auth/Payment errors
  if (errorMessage.includes('401') || errorMessage.includes('402')) {
    return {
      retryable: false,
      strategy: 'immediate',
      userMessage: 'API authentication failed - check your KIE_API_KEY'
    };
  }

  // Non-retryable: Validation errors
  if (errorMessage.includes('422')) {
    return {
      retryable: false,
      strategy: 'immediate',
      userMessage: 'Invalid request - check image URLs and parameters'
    };
  }

  // Retryable with intelligent backoff: Rate limits
  if (errorMessage.includes('429')) {
    return {
      retryable: true,
      strategy: 'exponential',
      userMessage: 'Rate limited, waiting before retry...'
    };
  }

  // Retryable with exponential backoff: Server errors
  if (errorMessage.includes('5') && errorMessage.match(/5\d{2}/)) {
    return {
      retryable: true,
      strategy: 'exponential',
      userMessage: 'Server error, retrying...'
    };
  }

  // Default: Retry with exponential backoff
  return {
    retryable: true,
    strategy: 'exponential',
    userMessage: 'Generation failed, retrying...'
  };
}
```

### Pattern 3: Exponential Backoff with Full Jitter
**What:** Calculate retry delay that increases exponentially but adds randomization to prevent thundering herd
**When to use:** All retry scenarios - jitter is essential for distributed systems
**Example:**
```typescript
// Source: AWS Architecture Blog - Exponential Backoff and Jitter
function calculateBackoff(
  attemptNumber: number,
  strategy: 'exponential' | 'fixed' | 'immediate'
): number {
  if (strategy === 'immediate') return 0;
  if (strategy === 'fixed') return 3000; // 3 seconds

  // Exponential backoff with full jitter
  const baseDelay = 1000; // 1 second
  const maxDelay = 60000; // 60 seconds cap
  const factor = 2;

  // Calculate exponential delay: baseDelay * factor^(attempt-1)
  const exponentialDelay = Math.min(
    baseDelay * Math.pow(factor, attemptNumber - 1),
    maxDelay
  );

  // Apply full jitter: random value between 0 and exponentialDelay
  const jitteredDelay = Math.random() * exponentialDelay;

  return Math.floor(jitteredDelay);
}
```

### Pattern 4: Timestamp-Based Orphaned Job Detection
**What:** Periodic scan for jobs stuck in 'processing' state beyond a timeout threshold
**When to use:** Essential for catching jobs that never completed due to process crashes or network issues
**Example:**
```typescript
// Source: Industry best practice for stuck job detection
interface RecoveryConfig {
  timeoutMinutes: number;  // How long before job is considered orphaned
  checkIntervalMs: number; // How often to run detection
}

class RecoveryManager {
  private config: RecoveryConfig = {
    timeoutMinutes: 15, // 15 minutes is reasonable for image gen
    checkIntervalMs: 60000, // Check every 60 seconds
  };

  async detectOrphanedJobs(): Promise<string[]> {
    const timeoutThreshold = new Date(
      Date.now() - this.config.timeoutMinutes * 60 * 1000
    );

    // Query for jobs stuck in processing beyond threshold
    const { data: orphanedGenerations } = await this.supabase
      .from('generations')
      .select('id, job_id, started_at, operation')
      .eq('state', 'processing')
      .lt('started_at', timeoutThreshold.toISOString());

    if (!orphanedGenerations || orphanedGenerations.length === 0) {
      return [];
    }

    console.log(`[Recovery] Found ${orphanedGenerations.length} orphaned jobs`);

    return orphanedGenerations.map(g => g.id);
  }

  async recoverOrphanedJob(generationId: string): Promise<void> {
    // Reset to pending state so it can be retried
    const { error } = await this.supabase
      .from('generations')
      .update({
        state: 'pending',
        started_at: null,
        error_message: 'Recovered from orphaned state',
      })
      .eq('id', generationId);

    if (error) {
      console.error(`[Recovery] Failed to recover ${generationId}:`, error);
    } else {
      console.log(`[Recovery] Reset ${generationId} to pending for retry`);
    }
  }

  // Run detection on a schedule
  startRecoveryLoop(): void {
    setInterval(async () => {
      const orphanedIds = await this.detectOrphanedJobs();

      for (const id of orphanedIds) {
        await this.recoverOrphanedJob(id);
      }
    }, this.config.checkIntervalMs);
  }
}
```

### Pattern 5: Retry-After Header Handling for 429 Errors
**What:** Respect the Retry-After header when receiving rate limit errors
**When to use:** Whenever an API returns 429 status with retry guidance
**Example:**
```typescript
// Source: MDN Web Docs and Postman blog on 429 handling
async function createKieAITaskWithRetryAfter(payload: KieAIPayload): Promise<string> {
  return pRetry(
    async () => {
      const response = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      // Handle 429 with Retry-After header
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');

        if (retryAfter) {
          // Retry-After can be seconds (number) or HTTP date (string)
          const retryAfterMs = isNaN(Number(retryAfter))
            ? new Date(retryAfter).getTime() - Date.now()
            : Number(retryAfter) * 1000;

          // Throw custom error with delay hint
          const error = new Error(`Rate limited. Retry after ${retryAfterMs}ms`);
          (error as any).retryAfterMs = retryAfterMs;
          throw error;
        }

        // No Retry-After header - use exponential backoff
        throw new Error('Rate limited (no Retry-After header)');
      }

      // ... rest of error handling
    },
    {
      retries: 5,
      onFailedAttempt: (error) => {
        // Use custom retry delay if available
        if ((error as any).retryAfterMs) {
          // p-retry doesn't directly support dynamic delays,
          // but we can log and the next attempt will use exponential
          console.log(`[Retry] Respecting Retry-After: ${(error as any).retryAfterMs}ms`);
        }
      },
    }
  );
}
```

### Anti-Patterns to Avoid
- **Infinite retries without backoff:** Creates retry storms that make failures worse. Always use exponential backoff with jitter.
- **Retrying non-retryable errors:** Wastes resources and delays failure feedback. Classify errors and abort immediately for 401/402/422.
- **Missing orphaned job detection:** Jobs can get stuck forever if process crashes. Always have timeout-based recovery.
- **Synchronous retry logic:** Using `while(true)` loops in API routes blocks event loop. Use async/await with p-retry.
- **No retry count limits for permanent failures:** Even with "retry forever" requirement, non-retryable errors should fail immediately.
- **Ignoring Retry-After headers:** API explicitly tells you when to retry - ignoring it causes more rate limiting.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Exponential backoff calculation | Custom delay logic with Math.pow | p-retry with factor/randomize | Handles jitter, max timeout, retry counting, abort logic - extensively tested |
| Queue concurrency management | Array of promises with manual limiting | p-queue | Handles queue feeding, events, pause/resume, size tracking |
| Error classification | Long if/else chains | Error classification function with lookup table | More maintainable, testable, and extensible |
| Job timeout detection | setInterval checking each job | Timestamp-based SQL query for stuck jobs | More efficient, doesn't keep state in memory, survives restarts |
| Circuit breaker | Manual failure counting and state machine | opossum library (if needed) | Handles half-open state, metric collection, event emission |
| Idempotency keys | Custom UUID generation and storage | Use job/generation UUIDs as natural idempotency keys | kie.ai tasks are naturally idempotent by taskId |

**Key insight:** Retry logic has many edge cases (jitter calculations, abort conditions, timeout caps, retry budgets). Libraries like p-retry have been battle-tested in production by thousands of projects. The "simple" retry logic you write will inevitably miss edge cases that cause production issues.

## Common Pitfalls

### Pitfall 1: Thundering Herd on Retry
**What goes wrong:** Multiple jobs hit rate limit simultaneously, all retry at exactly the same time, causing another burst of 429 errors
**Why it happens:** Using exponential backoff without jitter means all failures at the same time retry at the same intervals
**How to avoid:** Always set `randomize: true` in p-retry config. This adds jitter to prevent synchronized retries.
**Warning signs:** Seeing waves of 429 errors in logs at predictable intervals (1s, 2s, 4s, 8s)

### Pitfall 2: Retry Amplification Under Load
**What goes wrong:** System is already overloaded, retries add more load, making the problem worse
**Why it happens:** Every failed request triggers retries, which can multiply the load on a struggling service
**How to avoid:** Implement maximum retry counts, use circuit breaker for sustained failures, check system health before retrying
**Warning signs:** Increasing error rate leads to increasing request rate, cascading failures

### Pitfall 3: Orphaned Job False Positives
**What goes wrong:** Long-running jobs get marked as orphaned and reset while still processing, causing duplicate work
**Why it happens:** Timeout threshold too short for actual processing time, or no differentiation between "stuck" and "slow"
**How to avoid:** Set timeout threshold based on P99 completion time + buffer (e.g., 15 minutes for typical 2-5 minute generations)
**Warning signs:** Same job appears multiple times in results, logs show jobs being reset while still active

### Pitfall 4: Error State Inconsistency
**What goes wrong:** Database shows 'failed' but job is actually retrying, or vice versa
**Why it happens:** Race conditions between retry logic and database updates, or failed database writes
**How to avoid:** Always update database state within try/catch blocks, use transactions where needed, treat database as source of truth
**Warning signs:** User sees "failed" status but job eventually completes, or retry_count doesn't match actual attempts

### Pitfall 5: Retry Budget Exhaustion
**What goes wrong:** Job retries forever on a permanent failure, consuming resources and preventing progress
**Why it happens:** "Never skip" requirement interpreted as "retry everything forever" even for non-retryable errors
**How to avoid:** Classify errors - only retry transient failures (429, 5xx, timeouts). Permanent failures (401, 402, 422) should fail immediately.
**Warning signs:** Jobs stuck retrying for hours with 401/402 errors, logs full of repeated auth failures

### Pitfall 6: Missing Retry Visibility
**What goes wrong:** User thinks job is stuck or broken, doesn't know it's retrying
**Why it happens:** No UI indication of retry state, retry_count not shown, error messages not surfaced
**How to avoid:** Show retry_count in status polling response, display user-friendly error messages, indicate "retrying..." state
**Warning signs:** User reports of "jobs not working" when they're actually retrying, support tickets for jobs that eventually succeed

### Pitfall 7: Hardcoded Timeout Values
**What goes wrong:** Timeout too short causes false orphan detection, too long delays recovery
**Why it happens:** Using magic numbers instead of configuration based on actual metrics
**How to avoid:** Calculate timeout from historical data (P99 + buffer), make configurable, log processing times to tune
**Warning signs:** Frequent orphan detection during normal operation, or no orphan detection when jobs genuinely stuck

## Code Examples

Verified patterns from official sources:

### Retry Configuration in p-retry
```typescript
// Source: p-retry GitHub documentation
import pRetry, { AbortError } from 'p-retry';

const result = await pRetry(
  async () => {
    const response = await fetch(url);

    // Abort immediately for unrecoverable errors
    if (response.status === 403) {
      throw new AbortError('Forbidden - no retry needed');
    }

    // Throw to trigger retry for transient errors
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }

    return response.json();
  },
  {
    retries: 5,              // Maximum attempts (6 total including initial)
    factor: 2,               // Exponential factor (1s, 2s, 4s, 8s, 16s)
    minTimeout: 1000,        // Initial delay (1 second)
    maxTimeout: 30000,       // Cap delays at 30 seconds
    maxRetryTime: 300000,    // Total time budget: 5 minutes
    randomize: true,         // Add jitter to prevent thundering herd
    onFailedAttempt: (error) => {
      console.log(
        `Attempt ${error.attemptNumber} failed. ${error.retriesLeft} retries left.`
      );
    }
  }
);
```

### p-queue Event Handling
```typescript
// Source: p-queue GitHub documentation
import PQueue from 'p-queue';

const queue = new PQueue({ concurrency: 20 });

// Monitor queue activity
queue.on('active', () => {
  console.log(`Working on item. ${queue.size} remaining, ${queue.pending} running`);
});

queue.on('idle', () => {
  console.log('Queue is idle - all items processed');
});

queue.on('error', (error) => {
  console.error('Queue error:', error);
});

// Add items with error handling
queue.add(async () => {
  // Task logic
}).catch((error) => {
  // Handle task failure
  console.error('Task failed:', error);
});
```

### Orphaned Job Detection Query
```typescript
// Source: Industry best practice for timestamp-based detection
async function findOrphanedGenerations(
  timeoutMinutes: number
): Promise<OrphanedGeneration[]> {
  const supabase = createServerSupabaseClient();
  const threshold = new Date(Date.now() - timeoutMinutes * 60 * 1000);

  const { data, error } = await supabase
    .from('generations')
    .select('id, job_id, started_at, operation, retry_count')
    .eq('state', 'processing')
    .lt('started_at', threshold.toISOString())
    .order('started_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to query orphaned jobs: ${error.message}`);
  }

  return data || [];
}
```

### Job-Level Retry Wrapper
```typescript
// Source: Combining p-retry patterns with database state management
async function executeGenerationWithRetry(
  job: GenerationJob
): Promise<GenerationResult> {
  const MAX_RETRIES = 20; // Reasonable limit before manual intervention

  return pRetry(
    async () => {
      // Attempt generation
      const result = await generateImage(job);

      // Success case
      if (result.state === 'completed') {
        return result;
      }

      // Classify the error
      const errorType = classifyError(result.errorMessage);

      // Permanent failure - abort immediately
      if (!errorType.retryable) {
        throw new AbortError(errorType.userMessage);
      }

      // Transient failure - retry
      throw new Error(errorType.userMessage);
    },
    {
      retries: MAX_RETRIES,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 60000,
      randomize: true,
      onFailedAttempt: async (error) => {
        // Update retry count in database
        await supabase
          .from('generations')
          .update({
            retry_count: error.attemptNumber,
            error_message: error.message
          })
          .eq('id', job.id);

        console.log(
          `[Retry] Job ${job.id} attempt ${error.attemptNumber} failed. ` +
          `${error.retriesLeft} retries left.`
        );
      }
    }
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Fixed delay retries | Exponential backoff with jitter | ~2015 (AWS blog post) | Prevents thundering herd, reduces retry storms |
| Retry everything equally | Error classification (retryable vs. non-retryable) | Ongoing best practice | Fails fast on permanent errors, saves resources |
| Heartbeat-based detection | Timestamp-based orphan detection | Modern distributed systems | Simpler, more reliable, survives restarts |
| Custom retry logic | p-retry library | Library matured ~2018 | More reliable, handles edge cases, well-tested |
| Ignore Retry-After | Respect Retry-After header | HTTP/1.1 spec (widely adopted 2020+) | Better API citizenship, faster recovery |

**Deprecated/outdated:**
- **Synchronous retry loops:** Blocking retry loops in API routes (use async with p-retry instead)
- **Linear backoff:** Using fixed delays between retries (use exponential with jitter)
- **Global retry limits:** Applying same retry count to all error types (classify and handle differently)
- **In-memory job tracking:** Using application memory to track job state (use database as source of truth)

## Open Questions

Things that couldn't be fully resolved:

1. **kie.ai rate limit specifics**
   - What we know: They have a 20-request concurrent limit (per prior decisions)
   - What's unclear: Exact rate limit behavior (requests per second, burst allowance, Retry-After header support)
   - Recommendation: Start with current p-retry config (5 retries, exponential backoff), monitor 429 responses, tune based on actual behavior

2. **Optimal orphaned job timeout**
   - What we know: Image generation typically takes 2-5 minutes
   - What's unclear: P99 completion time in production, what timeout minimizes false positives
   - Recommendation: Start with 15-minute timeout (3x typical max time), log all processing times, adjust based on data

3. **Maximum retry attempts before manual intervention**
   - What we know: PROC-04 requires "never skip" - retry until success
   - What's unclear: Practical limit before escalating to manual review (what if API key is permanently invalid?)
   - Recommendation: Set high but finite limit (20-50 attempts over ~24 hours), alert on persistent failures, allow manual override

4. **Circuit breaker necessity**
   - What we know: Current implementation handles rate limits and retries
   - What's unclear: Whether we need circuit breaker to protect against cascading failures
   - Recommendation: Monitor in production first - add circuit breaker (opossum) only if seeing sustained failure cascades

5. **Idempotency key requirements**
   - What we know: kie.ai uses taskId as natural idempotency - same input creates same taskId
   - What's unclear: Whether we need explicit idempotency keys for retries
   - Recommendation: Use existing generation UUIDs as idempotency context, rely on kie.ai's natural idempotency

## Sources

### Primary (HIGH confidence)
- [p-retry GitHub documentation](https://github.com/sindresorhus/p-retry) - Core retry library API and patterns
- [AWS Architecture Blog - Exponential Backoff and Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/) - Authoritative guide on backoff strategies
- [AWS Builders Library - Timeouts, Retries and Backoff with Jitter](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/) - Comprehensive resilience patterns
- [p-queue GitHub documentation](https://github.com/sindresorhus/p-queue) - Queue management and error handling

### Secondary (MEDIUM confidence)
- [MDN Web Docs - HTTP 429 Status](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/429) - Retry-After header specification
- [Postman Blog - HTTP Error 429](https://blog.postman.com/http-error-429/) - Rate limit handling best practices
- [DEV Community - Circuit Breaker Pattern in Node.js/TypeScript](https://dev.to/wallacefreitas/circuit-breaker-pattern-in-nodejs-and-typescript-enhancing-resilience-and-stability-bfi) - Circuit breaker implementation
- [Better Stack - Mastering Exponential Backoff](https://betterstack.com/community/guides/monitoring/exponential-backoff/) - Modern backoff strategies
- [Stripe API - Idempotent Requests](https://docs.stripe.com/api/idempotent_requests) - Industry standard for idempotency keys
- [BullMQ Documentation - Retrying Failing Jobs](https://docs.bullmq.io/guide/retrying-failing-jobs) - Alternative queue patterns

### Tertiary (LOW confidence)
- [GitHub Issue - Combining p-queue with p-retry](https://github.com/sindresorhus/p-queue/issues/25) - Community discussion on integration
- [Stack Overflow discussions on orphaned job detection](https://github.com/humanmade/Cavalcade/issues/31) - Practical patterns from community

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - p-retry and p-queue are industry standard, already in use, well-documented
- Architecture: HIGH - Multi-layer retry, error classification, orphaned detection are proven patterns from AWS and other large-scale systems
- Pitfalls: HIGH - Based on documented issues from production systems and library maintainers
- Implementation details: MEDIUM - Specific values (timeouts, retry counts) need production tuning

**Research date:** 2026-01-26
**Valid until:** 2026-03-26 (60 days - retry patterns are stable, but library versions evolve)
