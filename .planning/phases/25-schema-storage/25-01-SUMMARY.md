---
phase: 25-schema-storage
plan: 01
subsystem: database
tags: [postgresql, typescript, migrations, schema, types]

# Dependency graph
requires:
  - phase: 21-claude-migration
    provides: Updated AI parsing infrastructure using Claude
provides:
  - Database prompt column in generations table
  - TypeScript types for per-generation prompts
  - Prompt generator utility function
affects: [26-ai-prompt-generation, 27-ui-integration]

# Tech tracking
tech-stack:
  added: []
  patterns: [nullable-column-migration, type-safe-schema-evolution]

key-files:
  created:
    - supabase/migrations/004_add_prompt_column.sql
    - lib/ai/prompt-generator.ts
  modified:
    - lib/types/generation.ts

key-decisions:
  - "TEXT column type (no length limit, same performance as VARCHAR)"
  - "Nullable column for zero-downtime migration"
  - "Pass-through prompt generator for Phase 25 (enhancement in Phase 26)"

patterns-established:
  - "Migration pattern: Add nullable columns with documentation comments"
  - "Type pattern: Optional in GenerationJob, nullable in GenerationRecord"
  - "Infrastructure-first: Set up database before implementing logic"

# Metrics
duration: 2min
completed: 2026-02-03
---

# Phase 25 Plan 01: Schema & Storage Summary

**Database prompt column, TypeScript types with optional/nullable fields, and pass-through prompt generator utility**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-04T01:12:21Z
- **Completed:** 2026-02-04T01:14:25Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Database migration adds prompt TEXT column to generations table (nullable for backward compatibility)
- TypeScript types updated with prompt field in GenerationJob (optional) and GenerationRecord (nullable)
- Prompt generator utility created with pass-through implementation for v4.0 infrastructure

## Task Commits

Each task was committed atomically:

1. **Task 1: Create database migration for prompt column** - `bd59c13` (feat)
2. **Task 2: Update TypeScript type definitions** - `f3b459d` (feat)
3. **Task 3: Create prompt generator utility** - `236f13e` (feat)

## Files Created/Modified
- `supabase/migrations/004_add_prompt_column.sql` - Adds nullable TEXT column for per-generation prompts with documentation comment
- `lib/types/generation.ts` - Updated GenerationJob (prompt?: string) and GenerationRecord (prompt: string | null) interfaces
- `lib/ai/prompt-generator.ts` - Prompt generation utility with PromptGenerationOptions interface and generatePerImagePrompt function

## Decisions Made

**TEXT vs VARCHAR for prompt column**
- Rationale: TEXT has no length limit with same performance as VARCHAR in PostgreSQL
- Benefit: Future-proof for long AI-generated prompts without arbitrary limits

**Nullable column strategy**
- Rationale: Existing records have no prompts, need NULL for legacy data
- Benefit: Zero-downtime migration, no backfill required, backward compatible

**Pass-through implementation**
- Rationale: Phase 25 focuses on schema/storage infrastructure, not AI logic
- Benefit: Sets up database column for Phase 26 enhancement without premature complexity

**Optional vs nullable type distinction**
- Rationale: GenerationJob is input (prompt may not be provided), GenerationRecord is database (prompt may be NULL)
- Benefit: Type-safe distinction between "not provided yet" and "stored as NULL"

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - straightforward schema and type additions.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for Phase 26 (AI Prompt Generation):**
- Database column exists and can store generated prompts
- TypeScript types support prompt field with proper optional/nullable semantics
- Prompt generator utility provides interface for Phase 26 enhancement
- Migration is backward compatible (nullable column, no data migration needed)

**No blockers or concerns.**

---
*Phase: 25-schema-storage*
*Completed: 2026-02-03*
