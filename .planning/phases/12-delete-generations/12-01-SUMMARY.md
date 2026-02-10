---
phase: 12-delete-generations
plan: 01
subsystem: database
tags: [supabase, soft-delete, postgresql, rpc, atomic-operations]

# Dependency graph
requires:
  - phase: 08-schema-extensions-migrations
    provides: Supabase migrations infrastructure
provides:
  - Soft delete infrastructure with deleted_at column
  - Partial index for efficient non-deleted queries
  - Atomic counter decrement RPC function
  - Enhanced DELETE endpoint with soft delete support
affects: [12-02-delete-ui, audit-trail, data-retention]

# Tech tracking
tech-stack:
  added: []
  patterns: [soft-delete, partial-indexes, stored-procedures, atomic-counter-updates]

key-files:
  created: [supabase/migrations/003_soft_delete.sql]
  modified: [app/api/generation/[id]/route.ts]

key-decisions:
  - "Soft delete with deleted_at timestamp instead of hard delete for audit trail"
  - "Partial index on deleted_at IS NULL for query performance"
  - "Atomic counter decrement via stored procedure prevents race conditions"
  - "Only decrement completed_generations for completed state (not pending/processing/failed)"

patterns-established:
  - "Soft delete pattern: deleted_at TIMESTAMPTZ NULL column with partial indexes"
  - "Atomic counter updates: Use stored procedures for transactional consistency"
  - "State-aware counter updates: Only update counters when state changes affect statistics"

# Metrics
duration: 1min
completed: 2026-01-27
---

# Phase 12 Plan 01: Soft Delete Infrastructure Summary

**Soft delete with deleted_at timestamps, partial indexes, and atomic counter updates via stored procedure for audit-safe generation deletion**

## Performance

- **Duration:** 1 min
- **Started:** 2026-01-27T16:08:26Z
- **Completed:** 2026-01-27T16:09:54Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created database migration with deleted_at column and partial index for efficient filtering
- Implemented atomic counter decrement stored procedure to prevent race conditions
- Enhanced DELETE endpoint to use soft delete pattern
- Removed pending-only restriction, allowing deletion of generations in any state
- Conditional counter decrement only for completed generations

## Task Commits

Each task was committed atomically:

1. **Task 1: Create soft delete database migration** - `58127a3` (feat)
2. **Task 2: Enhance DELETE endpoint with soft delete and atomic counter** - `a3be25d` (feat)

## Files Created/Modified
- `supabase/migrations/003_soft_delete.sql` - Adds deleted_at column, partial index idx_generations_not_deleted, and decrement_job_generation_count RPC function
- `app/api/generation/[id]/route.ts` - Enhanced DELETE handler with soft delete, already-deleted check, and state-aware counter decrement

## Decisions Made

**1. Soft delete pattern for audit trail**
- **Decision:** Use deleted_at timestamp instead of hard delete
- **Rationale:** Preserves data for audit purposes, enables "undo" functionality in future
- **Implementation:** ALTER TABLE ADD COLUMN deleted_at TIMESTAMPTZ NULL

**2. Partial index for performance**
- **Decision:** Create partial index WHERE deleted_at IS NULL
- **Rationale:** Most queries filter for non-deleted records; partial index is smaller and faster
- **Implementation:** CREATE INDEX idx_generations_not_deleted ON generations(job_id) WHERE deleted_at IS NULL

**3. Atomic counter decrement via stored procedure**
- **Decision:** Use PostgreSQL stored procedure for counter updates
- **Rationale:** Ensures atomic operation, prevents race conditions, encapsulates logic in database
- **Implementation:** CREATE OR REPLACE FUNCTION decrement_job_generation_count(p_job_id UUID)

**4. State-aware counter decrement**
- **Decision:** Only decrement completed_generations when state === 'completed'
- **Rationale:** Pending/processing/failed generations don't contribute to completed_generations count
- **Implementation:** if (existing.state === 'completed') { supabase.rpc('decrement_job_generation_count') }

**5. Remove pending-only restriction**
- **Decision:** Allow deletion of generations in any state
- **Rationale:** Soft delete is non-destructive, users should be able to clean up any unwanted generation
- **Implementation:** Removed if (existing.state !== 'pending') check

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - straightforward implementation of soft delete infrastructure.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for Phase 12-02 (Delete UI):**
- Soft delete infrastructure in place
- DELETE endpoint accepts deletions for all states
- Atomic counter updates working correctly
- Can now build UI to trigger soft delete operations

**Considerations for future phases:**
- UI should filter deleted generations by default (WHERE deleted_at IS NULL)
- Consider adding "recently deleted" view showing deleted_at IS NOT NULL with restore capability
- May want to add hard delete policy (e.g., permanent deletion after 30 days)
- Audit logging could leverage deleted_at timestamps for compliance

---
*Phase: 12-delete-generations*
*Completed: 2026-01-27*
