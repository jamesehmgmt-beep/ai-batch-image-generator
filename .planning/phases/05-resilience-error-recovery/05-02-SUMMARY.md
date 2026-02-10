---
phase: 05-resilience-error-recovery
plan: 02
subsystem: queue
tags: [orphaned-jobs, recovery, supabase, timestamp-detection, singleton]

# Dependency graph
requires:
  - phase: 03-queue-processing-image-generation
    provides: generations table schema with state/started_at fields
provides:
  - Database queries for orphaned job detection (findOrphanedGenerations)
  - Generation reset utility (resetGenerationToPending)
  - Stuck jobs monitoring summary (getStuckJobsSummary)
  - RecoveryManager class with periodic check lifecycle
  - Singleton pattern for recovery manager instance
affects: [05-03 job-level retry, 05-04 integration]

# Tech tracking
tech-stack:
  added: []
  patterns: [timestamp-based orphan detection, periodic background checks, singleton manager]

key-files:
  created:
    - lib/db/job-queries.ts
    - lib/queue/recovery-manager.ts
    - lib/db/__tests__/job-queries.test.ts
  modified: []

key-decisions:
  - "15-minute timeout threshold for orphaned job detection"
  - "60-second check interval for periodic recovery"
  - "Recovery returns empty/safe defaults on error to not block recovery loop"
  - "Singleton pattern for RecoveryManager to prevent multiple concurrent recovery loops"
  - "Increment retry_count when resetting orphaned job to track recovery attempts"

patterns-established:
  - "Timestamp-based orphan detection: query for state='processing' AND started_at < threshold"
  - "Background manager lifecycle: start() runs initial check then schedules interval, stop() clears interval"
  - "Database error handling: return safe defaults (empty array, false) rather than throwing"

# Metrics
duration: 5min
completed: 2026-01-26
---

# Phase 5 Plan 2: Orphaned Job Recovery Summary

**Timestamp-based orphan detection with periodic recovery manager using 15-minute timeout threshold**

## Performance

- **Duration:** 5 min
- **Started:** 2026-01-26T06:07:11Z
- **Completed:** 2026-01-26T06:12:11Z
- **Tasks:** 3
- **Files created:** 3

## Accomplishments
- Database queries to find generations stuck in 'processing' for 15+ minutes
- Reset utility to return orphaned generations to 'pending' state for retry
- RecoveryManager class with start/stop lifecycle for periodic checks
- Comprehensive test suite with 17 passing tests
- Monitoring utility for stuck jobs summary (count + oldest age)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create database query utilities** - `3245832` (feat)
2. **Task 2: Create recovery manager** - `e2c345d` (feat)
3. **Task 3: Add unit tests** - `29a057a` (test)

## Files Created/Modified

- `lib/db/job-queries.ts` - Database queries for orphaned job detection with findOrphanedGenerations, resetGenerationToPending, getStuckJobsSummary exports
- `lib/queue/recovery-manager.ts` - RecoveryManager class with start/stop lifecycle and getRecoveryManager singleton
- `lib/db/__tests__/job-queries.test.ts` - 17 tests covering orphan detection, reset, stuck summary, and recovery manager lifecycle

## Decisions Made

1. **15-minute timeout threshold** - Conservative value based on research (3x typical 5-minute generation time). Can be tuned via RecoveryConfig.

2. **60-second check interval** - Balance between responsiveness and overhead. Configurable via RecoveryConfig.checkIntervalMs.

3. **Safe error handling** - Queries return empty arrays / false on errors rather than throwing to prevent recovery loop from crashing.

4. **Singleton pattern** - getRecoveryManager() returns single instance to prevent multiple concurrent recovery processes competing.

5. **Increment retry_count on reset** - Tracks how many times a generation has been recovered, useful for monitoring and potential max-retry limits.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

1. **Vitest mock typing** - Initial test file had TypeScript errors due to strict mock type inference. Resolved by using `any` type for mocks with eslint-disable comments, which is a common pattern for test files.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Database queries ready for integration with job execution API
- RecoveryManager can be started in server initialization or API routes
- Ready for Plan 04 which integrates recovery with job execution flow
- Consider adding monitoring dashboard to display getStuckJobsSummary results

---
*Phase: 05-resilience-error-recovery*
*Completed: 2026-01-26*
