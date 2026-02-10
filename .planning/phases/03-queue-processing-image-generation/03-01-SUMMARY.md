---
phase: 03
plan: 01
subsystem: queue-processing
tags: [typescript, postgresql, supabase, migrations, types, state-machine]
requires: [02-02, 02-03]
provides:
  - Generation state machine types
  - Database schema for jobs and generations
  - Environment configuration for kie.ai API
affects: [03-02, 03-03, 03-04]
tech-stack:
  added: []
  patterns: [state-machine, database-migrations, foreign-keys]
key-files:
  created:
    - lib/types/generation.ts
    - supabase/migrations/001_jobs_and_generations.sql
  modified:
    - .env.example
decisions:
  - id: generation-state-enum
    title: "GenerationState as string enum for DB compatibility"
    chosen: "String literal enum values (PENDING = 'pending')"
    rationale: "PostgreSQL CHECK constraints work with string values, TypeScript enum provides type safety"
  - id: jobs-generations-separation
    title: "Separate jobs and generations tables"
    chosen: "Two-table design with FK relationship"
    rationale: "Jobs track overall progress, generations track individual image tasks. Enables parallel processing and granular state tracking"
  - id: jsonb-for-complex-data
    title: "JSONB for parsed_job and reference_image_urls"
    chosen: "Store complex objects as JSONB in PostgreSQL"
    rationale: "Preserves full ParsedJob structure, enables JSON queries, avoids normalization complexity"
duration: 2 minutes
completed: 2026-01-25
---

# Phase 03 Plan 01: Queue Processing Foundation Summary

**One-liner:** Created TypeScript types and PostgreSQL schema for generation job state tracking with string enum state machine and JSONB data storage.

## What Was Built

### 1. Generation Types (lib/types/generation.ts)

Created TypeScript type system for queue processing:

- **GenerationState enum**: String literal enum with PENDING, PROCESSING, COMPLETED, FAILED states for database compatibility
- **GenerationJob interface**: Queue input structure with jobId, folderPath, operation, resolution, aspectRatio, photoMode, referenceImageUrls
- **GenerationRecord interface**: Database row structure matching PostgreSQL schema with snake_case fields
- **JobRecord interface**: Parent job tracking with session_id, parsed_job JSONB, generation counters, state machine

Imports `ParsedJob` and `AspectRatio` from existing Phase 2 types for consistency.

### 2. Database Migration (supabase/migrations/001_jobs_and_generations.sql)

Created two-table schema for queue processing:

**jobs table:**
- Tracks parent job records linked to upload sessions
- Stores parsed_job as JSONB for full structure preservation
- Counters for total_generations, completed_generations, failed_generations
- State machine: pending → processing → completed/failed/cancelled
- Indexes on session_id and state for query performance

**generations table:**
- Individual image generation records with job_id FK (CASCADE delete)
- Links to kie.ai via task_id and result_url
- Stores operation (prompt), source_file_name, reference_image_urls (JSONB array)
- State machine: pending → processing → completed/failed
- error_message and retry_count for failure handling
- Indexes on job_id, state, task_id for queue management queries

### 3. Environment Configuration

Added `KIE_API_KEY` to .env.example for kie.ai API authentication in next plan.

## Deviations from Plan

None - plan executed exactly as written.

## Decisions Made

**Generation State Enum Design:**
- Used string literal enum (`PENDING = 'pending'`) instead of numeric enum
- Enables direct storage in PostgreSQL with CHECK constraints
- TypeScript provides compile-time type safety, database provides runtime validation

**Two-Table Architecture:**
- jobs table: Parent records for progress tracking and cost estimation
- generations table: Individual tasks for queue processing
- Foreign key with CASCADE delete ensures data integrity
- Enables queries like "show all pending generations" without joining

**JSONB for Complex Data:**
- parsed_job stored as JSONB preserves full ParsedJob structure from Phase 2
- reference_image_urls as JSONB array (max 8 URLs per generation)
- Avoids normalization complexity while maintaining queryability

## Technical Implementation

**Type System:**
- GenerationState enum with 4 states matching database CHECK constraint
- Interfaces follow database naming (snake_case for DB, camelCase for TypeScript)
- All timestamp fields as strings (ISO 8601 from PostgreSQL)
- No `any` types - full type safety maintained

**Database Schema:**
- UUIDs for primary keys (gen_random_uuid())
- TIMESTAMPTZ for timezone-aware timestamps (default NOW())
- CHECK constraints enforce valid state transitions
- Indexes optimize common queries (find by state, find by job, find by task)
- DECIMAL(10,2) for estimated_cost (max $99,999.99)

**Relationships:**
- generations.job_id → jobs.id with ON DELETE CASCADE
- jobs.session_id links to upload sessions (Phase 1)
- Reference integrity enforced at database level

## Files Changed

**Created:**
- `lib/types/generation.ts` (59 lines) - TypeScript types for queue system
- `supabase/migrations/001_jobs_and_generations.sql` (48 lines) - Database schema

**Modified:**
- `.env.example` - Added KIE_API_KEY configuration

## Verification Results

All verification checks passed:

1. ✓ TypeScript compilation with `npx tsc --noEmit --skipLibCheck`
2. ✓ Migration file exists at supabase/migrations/001_jobs_and_generations.sql
3. ✓ KIE_API_KEY present in .env.example
4. ✓ All types importable from lib/types/generation.ts

## Next Phase Readiness

**Enables:**
- 03-02: kie.ai API client can use these types
- 03-03: Queue manager can track generation state
- 03-04: Job submission API can create job records

**Provides:**
- State machine types for generation lifecycle
- Database persistence for queue state
- Foreign key relationships for data integrity

**Blockers:**
None - foundation is complete and ready for queue implementation.

## Performance Notes

**Execution Time:** 2 minutes
**Commit Count:** 3 (one per task)

**Database Performance Considerations:**
- Indexes on state columns enable fast "get pending jobs" queries
- job_id index enables fast "get generations for job" queries
- task_id index enables fast kie.ai task lookup
- JSONB fields balance flexibility with query performance

## Lessons Learned

**String Enum Pattern:**
Using string literal enums (`PENDING = 'pending'`) provides the best of both worlds - TypeScript type safety and PostgreSQL readability/CHECK constraint compatibility.

**Migration Organization:**
Grouping related tables in single migration file (001_jobs_and_generations.sql) is clearer than splitting them, especially when they have FK relationships.

**JSONB vs Normalization:**
For complex nested structures like parsed_job, JSONB is superior to deep normalization. Avoids join complexity and preserves exact structure from TypeScript.
