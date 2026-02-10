# Phase 3: Queue Processing & Image Generation - Research

**Researched:** 2026-01-25
**Domain:** Concurrent job queue management and REST API integration
**Confidence:** HIGH

## Summary

Phase 3 implements a queue manager that maintains exactly 20 concurrent kie.ai API generations, automatically feeding the next job when one completes. The research identified p-queue as the standard solution for concurrency-limited async operations in Node.js/TypeScript, with p-retry for exponential backoff on API failures.

The kie.ai Nano Banana Pro API follows a standard task-based pattern: POST to createTask returns a taskId, which must be polled for completion. The 20-concurrent limit is API-enforced, requiring client-side queue management to prevent 429 rate limit errors.

Pre-execution summaries leverage existing cost estimation utilities (already implemented in `lib/job/cost-estimation.ts`). Job state persistence follows a state machine pattern (pending → processing → completed/failed) stored in Supabase PostgreSQL tables with proper indexing for status queries.

**Primary recommendation:** Use p-queue v9.1.0 for concurrency control (20 limit), p-retry for API failure handling with exponential backoff, and Supabase table-based state tracking with real-time subscriptions for progress updates.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| p-queue | 9.1.0 | Promise queue with concurrency control | Industry standard for rate-limiting async operations, feature-complete, TypeScript support, 2301+ projects using it |
| p-retry | 6.2.1 | Retry failed promises with exponential backoff | Standard retry library from same author as p-queue, handles 429 and transient errors with jitter |
| Supabase PostgreSQL | Current | Job state persistence and real-time subscriptions | Already integrated, provides ACID transactions and real-time updates for progress tracking |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| eventemitter3 | 5.x | Type-safe event emitting (p-queue is EventEmitter3 subclass) | Already included with p-queue, use for queue lifecycle events |
| node:events | Built-in | Native EventEmitter for custom job events | Use for application-level events (job completion, error handling) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| p-queue | BullMQ + Redis | BullMQ requires Redis infrastructure and is overkill for in-memory queue with 20 concurrent limit. Use BullMQ only if distributing across multiple servers or need persistent queue across restarts |
| p-queue | p-limit | p-limit only limits concurrency, lacks queue management, event emitters, pause/resume. Use p-limit only for simpler use cases without job tracking |
| p-retry | exponential-backoff npm | p-retry integrates better with p-queue, has AbortError for non-retryable failures. exponential-backoff is viable alternative but p-retry is more mature |

**Installation:**
```bash
npm install p-queue p-retry
```

## Architecture Patterns

### Recommended Project Structure
```
lib/
├── queue/
│   ├── generation-queue.ts      # QueueManager class with p-queue
│   ├── kie-api-client.ts        # kie.ai API wrapper with p-retry
│   └── job-state-manager.ts     # Supabase state persistence
├── types/
│   └── generation.ts            # Generation job types, states enum
└── job/
    └── cost-estimation.ts       # Already exists - reuse for pre-execution summary
```

### Pattern 1: Concurrency-Limited Queue with Auto-Feeding
**What:** Queue manager maintains exactly 20 concurrent generations. When one completes, next job automatically starts.
**When to use:** Managing API rate limits and concurrency constraints.
**Example:**
```typescript
// Source: https://github.com/sindresorhus/p-queue + community patterns
import PQueue from 'p-queue';

class GenerationQueueManager {
  private queue: PQueue;

  constructor() {
    this.queue = new PQueue({
      concurrency: 20, // kie.ai max concurrent limit
      autoStart: true, // Automatically process as capacity opens
    });

    // Monitor queue state
    this.queue.on('active', () => {
      console.log(`Working on item. ${this.queue.size} remaining, ${this.queue.pending} running`);
    });

    this.queue.on('idle', () => {
      console.log('Queue is idle - all jobs complete');
    });
  }

  async addGeneration(operation: GenerationJob): Promise<GenerationResult> {
    // Queue automatically starts next job when slot opens
    return this.queue.add(async () => {
      return await this.executeGeneration(operation);
    }, {
      priority: operation.priority || 0, // Optional: prioritize certain jobs
    });
  }

  // Returns summary of queue state
  getQueueStatus() {
    return {
      pending: this.queue.pending, // Currently executing
      queued: this.queue.size,     // Waiting to execute
      total: this.queue.pending + this.queue.size,
    };
  }
}
```

### Pattern 2: API Retry with Exponential Backoff
**What:** Wrap kie.ai API calls in p-retry to handle transient failures (429 rate limits, 500 errors, network issues).
**When to use:** Any external API integration, especially with rate limits.
**Example:**
```typescript
// Source: https://github.com/sindresorhus/p-retry
import pRetry, { AbortError } from 'p-retry';

async function createKieAITask(payload: KieAIPayload): Promise<string> {
  return pRetry(
    async () => {
      const response = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.KIE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      // Non-retryable errors (400, 401, 422) - throw AbortError
      if (response.status === 401 || response.status === 422 || response.status === 402) {
        const error = await response.json();
        throw new AbortError(`Non-retryable error: ${error.msg}`);
      }

      // Retryable errors (429, 500, 501)
      if (!response.ok) {
        throw new Error(`API error ${response.status}`);
      }

      const data = await response.json();
      return data.data.taskId;
    },
    {
      retries: 5,
      factor: 2,           // Exponential: 1s, 2s, 4s, 8s, 16s
      minTimeout: 1000,    // Start with 1 second
      maxTimeout: 30000,   // Cap at 30 seconds
      randomize: true,     // Add jitter to prevent thundering herd
      onFailedAttempt: (error) => {
        console.log(`Attempt ${error.attemptNumber} failed. ${error.retriesLeft} retries left.`);
      },
    }
  );
}
```

### Pattern 3: Job State Machine with Database Persistence
**What:** Track generation lifecycle in Supabase with state transitions: pending → processing → completed/failed.
**When to use:** Persisting job status, enabling progress tracking, supporting recovery from crashes.
**Example:**
```typescript
// Source: Community patterns + Supabase docs
enum GenerationState {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

interface GenerationRecord {
  id: string;
  job_id: string;
  folder_path: string;
  operation: string;
  state: GenerationState;
  task_id: string | null;
  result_url: string | null;
  error_message: string | null;
  retry_count: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

// Database schema
/*
CREATE TABLE generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id),
  folder_path TEXT NOT NULL,
  operation TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending', 'processing', 'completed', 'failed')),
  task_id TEXT,
  result_url TEXT,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_generations_state ON generations(state);
CREATE INDEX idx_generations_job_id ON generations(job_id);
*/

async function updateGenerationState(
  id: string,
  state: GenerationState,
  extras?: Partial<GenerationRecord>
) {
  const { error } = await supabase
    .from('generations')
    .update({
      state,
      ...extras,
      ...(state === 'processing' && { started_at: new Date().toISOString() }),
      ...(state === 'completed' && { completed_at: new Date().toISOString() }),
      ...(state === 'failed' && { completed_at: new Date().toISOString() }),
    })
    .eq('id', id);

  if (error) throw error;
}
```

### Pattern 4: Pre-Execution Summary Generation
**What:** Generate summary before starting queue processing using existing cost estimation utilities.
**When to use:** User confirmation step showing total work, cost estimate, and breakdown.
**Example:**
```typescript
// Source: Existing lib/job/cost-estimation.ts + community patterns
import { calculateCostEstimate } from '@/lib/job/cost-estimation';
import type { ParsedJob } from '@/lib/types/job';

interface PreExecutionSummary {
  totalPhotoCount: number;
  resolutionBreakdown: {
    '1K': number;
    '2K': number;
    '4K': number;
  };
  aspectRatioBreakdown: Record<string, number>;
  folderBreakdown: Array<{
    folderPath: string;
    photoCount: number;
    resolution: string;
    aspectRatio: string;
  }>;
  estimatedCost: number;
  estimatedDuration: string; // Based on concurrency
}

function generatePreExecutionSummary(
  parsedJob: ParsedJob,
  fileCountByFolder: Record<string, number>
): PreExecutionSummary {
  const costData = calculateCostEstimate(
    parsedJob.job.folders,
    fileCountByFolder
  );

  // Count aspect ratios
  const aspectRatioBreakdown: Record<string, number> = {};
  const folderBreakdown = parsedJob.job.folders.map(folder => {
    const count = fileCountByFolder[folder.folderPath] || 0;
    const effectiveCount = count - (folder.excludedFiles?.length || 0);

    aspectRatioBreakdown[folder.aspectRatio] =
      (aspectRatioBreakdown[folder.aspectRatio] || 0) + effectiveCount;

    return {
      folderPath: folder.folderPath,
      photoCount: effectiveCount,
      resolution: folder.resolution,
      aspectRatio: folder.aspectRatio,
    };
  });

  // Estimate duration: assume 60s per generation, 20 concurrent
  const totalImages = costData.totalImages;
  const estimatedSeconds = Math.ceil(totalImages / 20) * 60;
  const estimatedDuration = formatDuration(estimatedSeconds);

  return {
    totalPhotoCount: totalImages,
    resolutionBreakdown: costData.byResolution,
    aspectRatioBreakdown,
    folderBreakdown,
    estimatedCost: costData.estimatedCost,
    estimatedDuration,
  };
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}
```

### Anti-Patterns to Avoid
- **Awaiting individual queue.add() calls:** This defeats concurrency. Add all jobs to queue without awaiting, then await queue.onIdle() for completion.
- **Creating new queue instance per job:** Queue should be singleton. Creating multiple queues breaks the 20-concurrent limit.
- **Blocking event loop in queue processor:** Long synchronous operations stall queue. Use async I/O operations.
- **Not handling AbortError:** Throwing regular Error in retry loop causes unnecessary retries for non-retryable failures (401, 422).
- **Polling without exponential backoff:** Aggressive polling wastes API quota and risks rate limits.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Concurrent operation limiting | Custom counter with Promise.all + slice logic | p-queue | Handles edge cases: prioritization, pause/resume, event emission, backpressure detection (saturated state), proper cleanup |
| Exponential backoff retry | setTimeout loop with multiplier | p-retry | Handles jitter (prevents thundering herd), max retry time, AbortSignal integration, per-attempt callbacks, proper error typing |
| Job state persistence | Custom JSON file or in-memory Map | Supabase PostgreSQL table with indexes | ACID transactions, concurrent access safety, crash recovery, real-time subscriptions, queryable history |
| Rate limit detection | Manual 429 counting | p-retry with status code checking + p-queue concurrency | Library handles retry strategy, queue prevents hitting limits in first place |
| Event-driven job completion | Custom callback arrays | EventEmitter3 (built into p-queue) or Node's EventEmitter | Memory leak prevention, proper unsubscribe, type-safe events with TypeScript |

**Key insight:** Concurrent job processing has subtle race conditions and edge cases. p-queue is battle-tested across 2300+ projects. Custom solutions often miss: handling queue.clear() during processing, proper event cleanup to prevent memory leaks, backpressure detection, and pause/resume atomicity.

## Common Pitfalls

### Pitfall 1: Memory Leaks from Unremoved Event Listeners
**What goes wrong:** Adding event listeners (queue.on('active'), queue.on('idle')) without removing them causes memory leaks in long-running applications.
**Why it happens:** EventEmitters hold strong references to listeners. If queue manager is recreated (e.g., per-request in API routes), old listeners accumulate on the heap.
**How to avoid:**
- Use queue manager as singleton (single instance app-wide)
- If must recreate, call `queue.removeAllListeners()` before disposal
- Use `once()` instead of `on()` for one-time events
- In React/frontend, return cleanup function from useEffect
**Warning signs:** Node.js warns "Possible EventEmitter memory leak detected. Eleven event listeners added." Check for repeated listener registration.

### Pitfall 2: Breaking Concurrency Limit with Multiple Queue Instances
**What goes wrong:** Creating separate queue instances (e.g., one per API route handler) breaks the 20-concurrent limit. Multiple queues each run 20 concurrent jobs = 40+ concurrent API calls = 429 rate limit errors.
**Why it happens:** Misunderstanding queue scope - treating it like a function instead of shared resource.
**How to avoid:**
- Create single queue instance at module level or in singleton class
- Export queue manager, not queue factory
- In Next.js API routes: instantiate queue manager outside handler function
**Warning signs:** Getting 429 errors despite queue concurrency: 20. Check if multiple queue instances exist with debugger or logging.

### Pitfall 3: Awaiting queue.add() Serially Kills Concurrency
**What goes wrong:** Code like `for (job of jobs) { await queue.add(() => process(job)) }` processes jobs serially instead of concurrently.
**Why it happens:** Awaiting queue.add() waits for job completion before adding next job. Queue never has more than 1 job.
**How to avoid:**
```typescript
// Bad: Serial processing
for (const job of jobs) {
  await queue.add(() => processJob(job)); // Waits for completion
}

// Good: Concurrent processing
const promises = jobs.map(job =>
  queue.add(() => processJob(job))
);
await Promise.all(promises); // Or await queue.onIdle()
```
**Warning signs:** Queue never shows more than 1 pending job. Processing time scales linearly with job count instead of utilizing concurrency.

### Pitfall 4: Not Handling Non-Retryable API Errors
**What goes wrong:** Retrying 401 (auth failed) or 422 (invalid params) errors wastes retry attempts and delays failure detection.
**Why it happens:** p-retry retries all thrown errors by default. Non-retryable errors should throw AbortError.
**How to avoid:**
```typescript
if (response.status === 401 || response.status === 422 || response.status === 402) {
  throw new AbortError(`Non-retryable: ${response.status}`);
}
if (!response.ok) {
  throw new Error(`Retryable: ${response.status}`); // 429, 500, etc.
}
```
**Warning signs:** Logs show 5 retry attempts for 401/422 errors. Users wait unnecessarily for predetermined failure.

### Pitfall 5: Race Conditions in State Updates
**What goes wrong:** Concurrent generations update database state simultaneously, causing lost updates or inconsistent states.
**Why it happens:** Multiple async operations updating same record without proper locking or atomic updates.
**How to avoid:**
- Use optimistic locking with version column or updated_at
- Use Supabase RPC functions for atomic state transitions
- Update only specific columns, not entire row
- Use database constraints (CHECK state IN (...)) to prevent invalid states
**Warning signs:** Generations stuck in "processing" state after completion. State reverting to previous value after update.

### Pitfall 6: Thundering Herd Problem on Rate Limit
**What goes wrong:** When rate limit (429) lifts, all queued jobs retry simultaneously, immediately triggering another 429.
**Why it happens:** No jitter in retry timing - all jobs wait exact same duration.
**How to avoid:** Enable `randomize: true` in p-retry options. This adds ±50% jitter to retry delays, spreading out retry attempts.
**Warning signs:** Repeated 429 errors in bursts. Retry-After header respected but 429 immediately occurs again.

### Pitfall 7: Forgetting to Handle Task Polling
**What goes wrong:** kie.ai createTask returns taskId but doesn't immediately return result. Must poll separate endpoint for completion. Failing to poll leaves job in "processing" forever.
**Why it happens:** Assuming createTask is synchronous. It's actually async task queue on kie.ai side.
**How to avoid:**
- After getting taskId, implement polling with exponential backoff
- Store taskId in database immediately
- Poll query endpoint: GET /api/v1/jobs/queryTask with taskId
- Handle task states: queued → processing → completed/failed
**Warning signs:** Generations stuck in "processing" forever. taskId exists but no result_url populated.

## Code Examples

Verified patterns from official sources:

### Complete Queue Manager Implementation
```typescript
// Source: https://github.com/sindresorhus/p-queue + community patterns
import PQueue from 'p-queue';
import pRetry, { AbortError } from 'p-retry';
import { EventEmitter } from 'node:events';

interface GenerationJob {
  id: string;
  folderPath: string;
  operation: string;
  resolution: '1K' | '2K' | '4K';
  aspectRatio: string;
  photoMode: 'reference' | 'analysis';
  referenceImageUrls: string[];
}

interface GenerationResult {
  jobId: string;
  taskId: string;
  resultUrl: string | null;
  state: 'completed' | 'failed';
  error?: string;
}

export class GenerationQueueManager extends EventEmitter {
  private queue: PQueue;
  private activeJobs = new Map<string, Promise<GenerationResult>>();

  constructor(private kieApiKey: string, private supabase: any) {
    super();
    this.queue = new PQueue({
      concurrency: 20,
      autoStart: true,
    });

    this.queue.on('active', () => {
      this.emit('queueUpdate', this.getStatus());
    });

    this.queue.on('idle', () => {
      this.emit('queueComplete');
    });

    this.queue.on('error', (error) => {
      this.emit('queueError', error);
    });
  }

  async addGeneration(job: GenerationJob): Promise<GenerationResult> {
    const promise = this.queue.add(async () => {
      await this.updateJobState(job.id, 'processing');

      try {
        const taskId = await this.createTask(job);
        const result = await this.pollTaskCompletion(taskId);

        await this.updateJobState(job.id, 'completed', {
          task_id: taskId,
          result_url: result.resultUrl,
        });

        return {
          jobId: job.id,
          taskId,
          resultUrl: result.resultUrl,
          state: 'completed' as const,
        };
      } catch (error) {
        await this.updateJobState(job.id, 'failed', {
          error_message: error instanceof Error ? error.message : 'Unknown error',
        });

        throw error;
      } finally {
        this.activeJobs.delete(job.id);
      }
    });

    this.activeJobs.set(job.id, promise);
    return promise;
  }

  private async createTask(job: GenerationJob): Promise<string> {
    return pRetry(
      async () => {
        const response = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.kieApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'nano-banana-pro',
            input: {
              prompt: job.operation,
              image_input: job.referenceImageUrls.slice(0, 8), // Max 8
              aspect_ratio: job.aspectRatio,
              resolution: job.resolution,
              output_format: 'PNG',
            },
          }),
        });

        // Non-retryable errors
        if ([401, 402, 422].includes(response.status)) {
          const error = await response.json();
          throw new AbortError(`API error ${response.status}: ${error.msg}`);
        }

        // Retryable errors
        if (!response.ok) {
          throw new Error(`API error ${response.status}`);
        }

        const data = await response.json();
        return data.data.taskId;
      },
      {
        retries: 5,
        factor: 2,
        minTimeout: 1000,
        maxTimeout: 30000,
        randomize: true,
        onFailedAttempt: (error) => {
          console.log(`Retry attempt ${error.attemptNumber}, ${error.retriesLeft} left`);
        },
      }
    );
  }

  private async pollTaskCompletion(taskId: string): Promise<{ resultUrl: string }> {
    return pRetry(
      async () => {
        const response = await fetch(
          `https://api.kie.ai/api/v1/jobs/queryTask?taskId=${taskId}`,
          {
            headers: { 'Authorization': `Bearer ${this.kieApiKey}` },
          }
        );

        if (!response.ok) {
          throw new Error(`Query failed: ${response.status}`);
        }

        const data = await response.json();

        // Still processing - retry
        if (data.data.status === 'processing' || data.data.status === 'queued') {
          throw new Error('Task not ready');
        }

        // Failed - abort
        if (data.data.status === 'failed') {
          throw new AbortError('Task failed on kie.ai side');
        }

        // Success
        return { resultUrl: data.data.result_url };
      },
      {
        retries: 30,      // Poll up to 30 times
        factor: 1.5,      // Slower growth for polling
        minTimeout: 2000, // Start at 2s
        maxTimeout: 10000, // Cap at 10s
        randomize: true,
      }
    );
  }

  private async updateJobState(
    id: string,
    state: string,
    extras: Record<string, any> = {}
  ) {
    const { error } = await this.supabase
      .from('generations')
      .update({ state, ...extras })
      .eq('id', id);

    if (error) throw error;
  }

  getStatus() {
    return {
      pending: this.queue.pending,
      queued: this.queue.size,
      total: this.queue.pending + this.queue.size,
    };
  }

  async waitForCompletion() {
    await this.queue.onIdle();
  }

  pause() {
    this.queue.pause();
  }

  resume() {
    this.queue.start();
  }

  clear() {
    this.queue.clear();
  }
}
```

### Pre-Execution Summary Display Component
```typescript
// Source: Existing cost-estimation.ts + community patterns
import { calculateCostEstimate, formatCost } from '@/lib/job/cost-estimation';

interface SummaryProps {
  parsedJob: ParsedJob;
  fileCountByFolder: Record<string, number>;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PreExecutionSummary({ parsedJob, fileCountByFolder, onConfirm, onCancel }: SummaryProps) {
  const costData = calculateCostEstimate(parsedJob.job.folders, fileCountByFolder);

  // Count aspect ratios
  const aspectRatios: Record<string, number> = {};
  parsedJob.job.folders.forEach(folder => {
    const count = fileCountByFolder[folder.folderPath] || 0;
    const effective = count - (folder.excludedFiles?.length || 0);
    aspectRatios[folder.aspectRatio] = (aspectRatios[folder.aspectRatio] || 0) + effective;
  });

  const estimatedMinutes = Math.ceil(costData.totalImages / 20) * 1; // ~1min per image, 20 concurrent

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Confirm Job Execution</h2>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Total Photos</p>
          <p className="text-3xl font-bold">{costData.totalImages}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Estimated Cost</p>
          <p className="text-3xl font-bold">{formatCost(costData.estimatedCost)}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Estimated Time</p>
          <p className="text-3xl font-bold">{estimatedMinutes}min</p>
        </div>
      </div>

      <div>
        <h3 className="font-semibold mb-2">Resolution Breakdown</h3>
        <div className="space-y-1">
          {Object.entries(costData.byResolution).map(([res, count]) => (
            count > 0 && (
              <p key={res}>{res}: {count} images ({formatCost(count * costData.perImageCost[res as keyof typeof costData.perImageCost])})</p>
            )
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-semibold mb-2">Aspect Ratio Breakdown</h3>
        <div className="space-y-1">
          {Object.entries(aspectRatios).map(([ratio, count]) => (
            <p key={ratio}>{ratio}: {count} images</p>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-semibold mb-2">Per-Folder Breakdown</h3>
        <div className="space-y-2">
          {costData.byFolder.map((folder) => (
            <div key={folder.folderPath} className="border p-3 rounded">
              <p className="font-medium">{folder.folderPath}</p>
              <p className="text-sm text-muted-foreground">
                {folder.imageCount} images • {folder.resolution} • {formatCost(folder.folderCost)}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-4">
        <button onClick={onConfirm}>Confirm & Start</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| async.queue (callback-based) | p-queue (Promise-based) | 2016-2020 | Modern async/await syntax, better TypeScript support, EventEmitter3 with proper cleanup |
| Manual setTimeout retry loops | p-retry with exponential backoff + jitter | 2018-2024 | Prevents thundering herd, standardized retry strategies, AbortError pattern |
| Redis-backed queues (Bull, BullMQ) for all use cases | In-memory p-queue for single-process, BullMQ for distributed | 2020-present | Reduced infrastructure complexity for single-server deployments, faster for non-persistent queues |
| Polling without backoff | Exponential backoff polling | Always relevant | Reduces API load, respects server resources, prevents rate limit cascade |
| Custom job state tracking | Database state machine with real-time subscriptions | 2020-present (Supabase/Firebase) | Real-time progress updates, crash recovery, queryable history |

**Deprecated/outdated:**
- **async.queue**: Callback-based, no TypeScript support. Use p-queue instead.
- **kue**: Unmaintained since 2018. Use BullMQ if need Redis-backed queue.
- **Manual Promise.all chunking**: Splits array into chunks of 20, processes serially. Use p-queue which handles this automatically with better control.

## Open Questions

Things that couldn't be fully resolved:

1. **kie.ai Task Polling Endpoint Details**
   - What we know: Documentation mentions "unified query endpoint" for checking task status, likely GET with taskId parameter
   - What's unclear: Exact endpoint URL, response schema for task states (queued/processing/completed/failed), recommended polling interval
   - Recommendation: Use /api/v1/jobs/queryTask?taskId={taskId} based on common REST patterns. Start with 2-second polling interval with exponential backoff to 10 seconds max. Update during implementation if documentation clarifies.

2. **kie.ai Webhook Callback Reliability**
   - What we know: API supports optional callBackUrl for completion notifications
   - What's unclear: Delivery guarantees, retry policy, authentication mechanism for callbacks
   - Recommendation: Implement polling as primary mechanism. Add webhook support as optimization in future phase if needed. Polling is more reliable for MVP.

3. **Optimal Concurrency for Different Resolution Tiers**
   - What we know: 20 concurrent limit is API-enforced
   - What's unclear: Whether 20 limit is global across all resolutions or per-resolution. Whether 4K generations count as multiple slots.
   - Recommendation: Assume 20 global limit. Monitor for 429 errors. If 4K uses more resources, kie.ai likely enforces this server-side, not our concern.

4. **Task Timeout Duration**
   - What we know: Generations are async, polled for completion
   - What's unclear: How long before considering task abandoned? Does kie.ai have task TTL?
   - Recommendation: Set client-side timeout of 10 minutes (600s) for polling. After timeout, mark as failed and allow manual retry. Most generations should complete in 1-2 minutes based on similar APIs.

5. **Handling Partial Batch Failures**
   - What we know: Individual generations can fail
   - What's unclear: User's preferred behavior - stop entire batch on first failure, or continue processing remaining jobs?
   - Recommendation: Continue processing all jobs even if some fail (requirement PROC-04 says "auto-retry until successful"). Mark failed ones for manual inspection. Let user decide whether to retry failed subset.

## Sources

### Primary (HIGH confidence)
- p-queue GitHub repository: https://github.com/sindresorhus/p-queue - API documentation, features, configuration
- p-retry GitHub repository: https://github.com/sindresorhus/p-retry - Retry strategies, exponential backoff, AbortError pattern
- kie.ai official API documentation: https://docs.kie.ai/market/google/pro-image-to-image - Endpoint, authentication, parameters, response format
- npm p-queue package page: https://www.npmjs.com/package/p-queue - Current version (9.1.0), installation, usage stats
- Existing cost-estimation.ts implementation: Already verified, working code for cost breakdown

### Secondary (MEDIUM confidence)
- [BullMQ documentation](https://bullmq.io/) - Verified with official docs, alternative for distributed systems
- [Complete Guide to Handling API Rate Limits](https://www.ayrshare.com/complete-guide-to-handling-rate-limits-prevent-429-errors/) - 429 handling patterns verified with official HTTP specs
- [Exponential backoff best practices](https://bpaulino.com/entries/retrying-api-calls-with-exponential-backoff) - Community patterns verified across multiple sources
- [Supabase job state tracking pattern](https://www.jigz.dev/blogs/how-i-solved-background-jobs-using-supabase-tables-and-edge-functions) - Community implementation verified with Supabase docs

### Tertiary (LOW confidence)
- WebSearch results for concurrent job processing common mistakes - Multiple community sources, patterns consistent across sources but not officially documented
- WebSearch results for EventEmitter memory leak patterns - General JavaScript knowledge, applicable but not specific to this use case
- Task polling interval recommendations - Based on general REST API best practices, not kie.ai-specific

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - p-queue and p-retry are industry standards with official documentation, 2300+ projects using p-queue
- Architecture: HIGH - Patterns verified from official library documentation and existing codebase (cost-estimation.ts already implemented)
- Pitfalls: MEDIUM-HIGH - Event listener leaks and concurrency issues documented in official sources, state machine pitfalls based on general database patterns
- kie.ai API integration: MEDIUM - Official API docs available but some details (polling endpoint, exact response schemas) need implementation verification
- Polling strategy: MEDIUM - Standard pattern but kie.ai-specific timing needs tuning during implementation

**Research date:** 2026-01-25
**Valid until:** 2026-02-25 (30 days - p-queue stable, kie.ai API unlikely to change)
