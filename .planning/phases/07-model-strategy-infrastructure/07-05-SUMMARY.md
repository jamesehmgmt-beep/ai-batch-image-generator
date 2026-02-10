---
phase: 07-model-strategy-infrastructure
plan: 05
subsystem: api
tags: [typescript, zod, types, schemas, model-strategy]

# Dependency graph
requires:
  - phase: 07-01
    provides: "ModelId type and model capability constants"
provides:
  - "Generation types with model field support"
  - "Zod schemas with model selection and validation"
  - "Backward-compatible defaults for v1.0 jobs"
affects: [07-06, 08-database-migrations, 09-cost-estimation-updates]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Model field with default for backward compatibility"]

key-files:
  created: []
  modified:
    - lib/types/generation.ts
    - lib/ai/schemas/job.ts

key-decisions:
  - "Make resolution optional since Seedream doesn't use it"
  - "Add Seedream-specific fields (quality, imageSize) as optional on GenerationJob"
  - "Default model to 'nano-banana-pro' for v1.0 backward compatibility"

patterns-established:
  - "Optional model-specific fields pattern: resolution for Nano Banana, quality/imageSize for Seedream"
  - "Zod schema defaults enable gradual migration from v1.0 to v2.0"

# Metrics
duration: 2.5min
completed: 2026-01-26
---

# Phase 7 Plan 5: Type & Schema Model Support Summary

**Generation types and Zod schemas updated with model field, optional resolution, and Seedream-specific parameters for multi-model support**

## Performance

- **Duration:** 2.5 min (152 seconds)
- **Started:** 2026-01-26T23:04:44Z
- **Completed:** 2026-01-26T23:07:16Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added ModelId import and model field to all generation-related types
- Updated Zod schemas with ModelSchema, SeedreamQualitySchema, SeedreamImageSizeSchema
- Made resolution optional for Seedream compatibility
- Maintained backward compatibility with 'nano-banana-pro' defaults

## Task Commits

Each task was committed atomically:

1. **Task 1: Update generation types with model field** - `e1967ed` (feat)
2. **Task 2: Update Zod schemas with model field** - `fbaa80b` (feat)

## Files Created/Modified

- `lib/types/generation.ts` - Added ModelId import, model field to GenerationJob/GenerationRecord/JobRecord/GenerationStatus, made resolution optional, added Seedream-specific fields
- `lib/ai/schemas/job.ts` - Added ModelSchema/SeedreamQualitySchema/SeedreamImageSizeSchema, updated FolderOperationSchema and job schemas with model field and defaults

## Decisions Made

**1. Resolution made optional**
- Rationale: Seedream uses imageSize instead of resolution, so resolution only applies to Nano Banana
- Implementation: Changed resolution from required to optional in GenerationJob and schemas

**2. Seedream fields added to GenerationJob interface**
- Decision: Add quality and imageSize as optional fields directly on GenerationJob
- Rationale: Enables type-safe access to model-specific params without complex discriminated unions at job level

**3. Default model to 'nano-banana-pro'**
- Decision: All schemas default to 'nano-banana-pro' when model not specified
- Rationale: Maintains backward compatibility with v1.0 jobs that don't include model field

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

**TypeScript compilation errors expected**

After Task 2, TypeScript compilation shows errors in consuming code (job-manager.ts, cost-estimation.ts, execute/route.ts, etc.) due to missing model field in object construction.

These are expected breaking changes that will be resolved in subsequent plans (07-06 and beyond) as the codebase is migrated to multi-model support. The type system is correctly enforcing the new requirements.

## Next Phase Readiness

**Ready for downstream updates:**
- Types provide clear contract for model field requirements
- Schemas enable validation of model-specific parameters
- Default values ensure graceful migration path

**Known downstream work:**
- Plan 07-06: Update job creation logic to include model field
- Plan 08-XX: Database migration to add model columns
- Plan 09-XX: Update cost estimation for model-specific pricing

**Blockers:** None - types are foundation for subsequent work

---
*Phase: 07-model-strategy-infrastructure*
*Completed: 2026-01-26*
