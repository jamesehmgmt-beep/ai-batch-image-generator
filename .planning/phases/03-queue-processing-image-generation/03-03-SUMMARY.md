---
phase: 03-queue-processing
plan: 03
subsystem: api
tags: [job-management, api-endpoints, queue-integration, generation-expansion]

# Dependency graph
requires:
  - phase: 03-01
    provides: Type definitions for JobRecord, GenerationJob, GenerationRecord
  - phase: 03-02
    provides: Queue manager with addBatch for processing generations
  - phase: 02-02
    provides: ParsedJob type and cost estimation utilities

provides:
  - Job creation API endpoint (POST /api/job/create)
  - Job execution API endpoint (POST /api/job/execute)
  - Job management utilities (createJob, expandJobToGenerations, getJobSummary, getJobGenerations)
  - ParsedJob to generation record expansion logic
  - filesByFolder to referenceImageUrls mapping

affects: [03-04-status-polling, 03-05-result-handling, phase-04-ui-integration]

# Tech tracking
tech-stack:
  added: [uuid, @types/uuid]
  patterns: [non-blocking-queue-submission, job-expansion-pattern, url-validation]

key-files:
  created:
    - lib/job/job-manager.ts
    - app/api/job/create/route.ts
    - app/api/job/execute/route.ts
  modified:
    - package.json (added uuid dependency)

key-decisions:
  - "Job creation validates ParsedJob.understood=true before database insertion"
  - "Execution endpoint returns 202 Accepted immediately without awaiting queue completion"
  - "filesByFolder URLs validated as http/https before queueing"
  - "Single file per generation in referenceImageUrls array (max 8 supported)"
  - "Job state transition: pending → processing at execution start"

patterns-established:
  - "Non-blocking queue pattern: addBatch without await, client polls for status"
  - "Job expansion pattern: ParsedJob folders → individual GenerationJob records"
  - "URL validation pattern: Validate filesByFolder URLs before database insertion"
  - "Error handling pattern: 400 for validation errors, 404 for not found, 500 for server errors"

# Metrics
duration: 7min
completed: 2026-01-25
---

# Phase 03 Plan 03: Job Management APIs Summary

**Job creation and execution endpoints with ParsedJob expansion to generation records and non-blocking queue submission**

## Performance

- **Duration:** 7 min
- **Started:** 2026-01-25T07:29:37Z
- **Completed:** 2026-01-25T07:37:03Z
- **Tasks:** 3
- **Files created:** 3
- **Dependencies added:** 1 (uuid)

## Accomplishments

- Job creation endpoint validates ParsedJob and creates database record with cost estimation
- Job execution endpoint expands ParsedJob folders into individual generation records
- Queue integration with non-blocking addBatch pattern for background processing
- filesByFolder URLs validated and mapped to referenceImageUrls for kie.ai API
- Job manager utilities for creating, expanding, and querying jobs

## Task Commits

Each task was committed atomically:

1. **Task 1: Create job manager utilities** - `593ba48` (feat)
   - createJob, expandJobToGenerations, getJobSummary, getJobGenerations
   - buildStorageUrl helper for Supabase storage URLs
   - Added uuid dependency for generation IDs

2. **Task 2: Create job creation API endpoint** - `6bf1d60` (feat)
   - POST /api/job/create with ParsedJob validation
   - Returns 201 Created with job summary
   - Validates understood=true and folders exist

3. **Task 3: Create job execution API endpoint** - `0b74f16` (feat)
   - POST /api/job/execute with job state validation
   - Expands to generation records with filesByFolder mapping
   - Returns 202 Accepted without waiting for completion

## Files Created/Modified

**Created:**
- `lib/job/job-manager.ts` - Job creation, expansion, and query utilities
- `app/api/job/create/route.ts` - POST endpoint to create job from ParsedJob
- `app/api/job/execute/route.ts` - POST endpoint to start job execution

**Modified:**
- `package.json` - Added uuid and @types/uuid dependencies

## Decisions Made

1. **Non-blocking queue submission**: Execute endpoint returns 202 Accepted immediately after calling addBatch, without awaiting queue completion. Client will poll /api/job/status for updates.

2. **URL validation in execute endpoint**: Validate all filesByFolder URLs are http/https before database insertion to prevent invalid data in generation records.

3. **Single file per generation**: Each generation record has one file in referenceImageUrls array (supports up to 8 per kie.ai API spec).

4. **Job state validation**: Execution endpoint validates job is in 'pending' state before processing to prevent duplicate execution.

5. **Runtime validation in job-manager**: Added checks for parsedJob.understood and parsedJob.job existence to handle optional types safely.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed uuid package**
- **Found during:** Task 1 (job manager implementation)
- **Issue:** uuid package needed for generation ID creation but not in package.json
- **Fix:** Installed uuid and @types/uuid via npm
- **Files modified:** package.json, package-lock.json
- **Verification:** TypeScript compilation passed
- **Committed in:** 593ba48 (Task 1 commit)

**2. [Rule 2 - Missing Critical] Added runtime validation for optional ParsedJob.job**
- **Found during:** Task 1 (TypeScript compilation)
- **Issue:** parsedJob.job is optional in schema, causing TypeScript errors for possibly undefined access
- **Fix:** Added runtime checks throwing errors if parsedJob.understood=false or parsedJob.job is undefined
- **Files modified:** lib/job/job-manager.ts
- **Verification:** TypeScript compilation passed, validates preconditions
- **Committed in:** 593ba48 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking dependency, 1 missing critical validation)
**Impact on plan:** Both auto-fixes necessary for functionality and type safety. No scope creep.

## Issues Encountered

None - plan executed smoothly with expected dependency installation and type safety handling.

## User Setup Required

None - no external service configuration required for this plan.

## Next Phase Readiness

**Ready for:**
- 03-04: Status polling can query jobs and generation counts via getJobSummary
- 03-05: Result handling has generation records with task_id and result_url fields ready
- Phase 04: UI integration can call /api/job/create and /api/job/execute

**Key interfaces ready:**
- POST /api/job/create accepts ParsedJob and returns job id
- POST /api/job/execute accepts jobId + filesByFolder, returns immediately
- getJobSummary returns job with generation state counts
- getJobGenerations returns all generation records for progress tracking

**No blockers** - all endpoints functional, queue integration working, types properly connected.

---
*Phase: 03-queue-processing*
*Completed: 2026-01-25*
