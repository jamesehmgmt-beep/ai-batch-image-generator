---
phase: 03-queue-processing
plan: 02
subsystem: queue
tags: [p-queue, p-retry, kie.ai, api-client, concurrency, exponential-backoff]

# Dependency graph
requires:
  - phase: 03-01
    provides: GenerationJob and GenerationState types, database schema
provides:
  - kie.ai API client with exponential backoff retry logic
  - Queue manager with 20-concurrent generation limit
  - Automatic queue feeding via PQueue
  - Database state tracking through generation lifecycle
affects: [03-03-job-execution, 03-04-api-endpoint, queue-monitoring]

# Tech tracking
tech-stack:
  added: [p-queue@9.1.0, p-retry@7.1.1]
  patterns: [singleton queue manager, exponential backoff with jitter, explicit WHERE clauses for updates]

key-files:
  created:
    - lib/queue/kie-api-client.ts
    - lib/queue/generation-queue.ts
  modified:
    - package.json

key-decisions:
  - "p-queue concurrency: 20 matches kie.ai API limit"
  - "p-retry with jitter prevents thundering herd on retries"
  - "Non-retryable errors (401, 402, 422) abort immediately"
  - "Poll with 60 retries and exponential backoff (2s → 10s)"
  - "All database updates use explicit .eq('id', job.id) for safety"
  - "Singleton pattern for queue manager prevents multiple queue instances"

patterns-established:
  - "API retry pattern: pRetry with onFailedAttempt logging"
  - "Queue lifecycle: pending → processing → completed/failed"
  - "Database updates: Always use .eq('id', record.id) for explicit targeting"
  - "Error handling: Catch all errors, update DB state, return result object"

# Metrics
duration: 3min
completed: 2026-01-25
---

# Phase 03 Plan 02: Queue Infrastructure Summary

**Queue manager with 20-concurrent limit and kie.ai API client with exponential backoff retry logic**

## Performance

- **Duration:** 3 min
- **Started:** 2026-01-25T16:48:53Z
- **Completed:** 2026-01-25T16:51:43Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Queue manager maintains exactly 20 concurrent generations via PQueue
- kie.ai API client handles task creation and polling with smart retry logic
- Exponential backoff with jitter prevents API overload during failures
- Database state updates track generation lifecycle with explicit record identification
- Singleton pattern ensures single queue instance across application

## Task Commits

Each task was committed atomically:

1. **Task 1: Install p-queue and p-retry dependencies** - `4054b5b` (chore)
2. **Task 2: Create kie.ai API client with retry logic** - `f00d9dd` (feat)
3. **Task 3: Create generation queue manager** - `91d7ddf` (feat)

## Files Created/Modified

- `package.json` - Added p-queue v9.1.0 and p-retry v7.1.1 dependencies
- `lib/queue/kie-api-client.ts` - kie.ai API wrapper with retry logic
  - createKieAITask: POST to kie.ai with 5 retries, exponential backoff (1s → 30s)
  - pollTaskCompletion: Poll task status with 60 retries (2s → 10s)
  - Aborts on non-retryable errors (401, 402, 422)
  - Retries on transient errors (429, 500, 502, 503, 504)
- `lib/queue/generation-queue.ts` - Queue manager with concurrency control
  - GenerationQueueManager class with PQueue (concurrency: 20)
  - addGeneration: Process single generation through full lifecycle
  - addBatch: Process multiple generations concurrently via Promise.all
  - Database state updates at each stage: pending → processing → completed/failed
  - Singleton pattern via getQueueManager() export

## Decisions Made

1. **p-queue concurrency: 20** - Matches kie.ai API limit for maximum throughput without rate limiting
2. **Exponential backoff with jitter** - Prevents thundering herd when multiple requests fail simultaneously
3. **Non-retryable errors abort immediately** - 401 (unauthorized), 402 (payment required), 422 (invalid request) don't benefit from retries
4. **Poll with adaptive timeout** - Starts at 2s, grows to 10s max, with 60 retries for ~5 minute completion window
5. **Explicit .eq('id', job.id) pattern** - All database updates use WHERE clause to ensure correct record is modified
6. **Singleton queue manager** - Prevents multiple queue instances competing for concurrency slots

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

**TypeScript error in onFailedAttempt callback** - Initial implementation tried to access `error.message` property which doesn't exist on RetryContext type. Fixed by removing the message reference, keeping only attempt and retries count. This is Rule 1 (auto-fix bug) - the error prevented compilation.

## User Setup Required

**External service requires manual configuration.**

Before using the queue system, configure:

1. **kie.ai API Key**
   - Get API key from https://kie.ai dashboard - API keys section
   - Add to `.env.local`:
     ```
     KIE_API_KEY=your_api_key_here
     ```
   - Verify with: Check that `process.env.KIE_API_KEY` is set in server context

The queue manager will validate the API key on initialization and throw a clear error if missing.

## Next Phase Readiness

**Ready for job execution endpoint (Plan 03-03):**
- Queue manager exports getQueueManager() singleton
- API client handles all kie.ai communication with retry logic
- Database state machine tracks generations through lifecycle
- Concurrency control enforces 20-worker limit automatically

**Ready for status/monitoring (Plan 03-04):**
- getStatus() provides queue metrics (pending, queued, total)
- Event listeners on queue for monitoring integration
- Database state allows querying generation progress

**Next plans should focus on:**
- Job submission endpoint that creates generations and feeds to queue
- Status/monitoring endpoints for progress tracking
- Result handling and storage in Supabase

---
*Phase: 03-queue-processing*
*Completed: 2026-01-25*
