---
phase: 08-schema-extensions-migrations
plan: 02
subsystem: api
tags: [zod, typescript, discriminated-union, schema-validation]

# Dependency graph
requires:
  - phase: 07-model-strategy-infrastructure
    provides: ModelId type and model-specific parameter interfaces
provides:
  - Discriminated union schema enabling O(1) model-specific validation
  - TypeScript type narrowing based on model field
  - Compile-time guarantees for model-specific parameters
affects: [09-ai-prompts-cost-ui, 10-queue-processor-updates]

# Tech tracking
tech-stack:
  added: []
  patterns: [discriminated-union, zod-conditional-validation]

key-files:
  created: []
  modified: [lib/ai/schemas/job.ts]

key-decisions:
  - "Use z.discriminatedUnion with 'model' field as discriminator for O(1) schema selection"
  - "Explicitly set undefined for model-specific fields that don't apply (resolution for Seedream, quality/imageSize for Nano Banana)"
  - "Default resolution to '2K' for Nano Banana, quality to 'basic' and imageSize to 'landscape_16_9' for Seedream"

patterns-established:
  - "Discriminated union pattern: Base schema + model-specific extensions + discriminatedUnion"
  - "Type inference from discriminated union enables automatic TypeScript narrowing"

# Metrics
duration: 2min
completed: 2026-01-26
---

# Phase 08 Plan 02: Discriminated Union Schema Summary

**Zod discriminated union enables O(1) validation and automatic TypeScript type narrowing for model-specific parameters**

## Performance

- **Duration:** 2 minutes
- **Started:** 2026-01-26T19:17:44Z
- **Completed:** 2026-01-26T19:19:39Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Implemented discriminated union pattern for FolderOperationSchema using 'model' as discriminator
- Nano Banana variant validates resolution (1K/2K/4K) with '2K' default
- Seedream variant validates quality (basic/high) and imageSize with defaults
- TypeScript automatically narrows FolderOperation type based on model field value

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement discriminated union for FolderOperationSchema** - `40dcff5` (refactor)
2. **Task 2: Verify discriminated union validation behavior** - No commit (verification only)

## Files Created/Modified
- `lib/ai/schemas/job.ts` - Refactored FolderOperationSchema from flat object to discriminated union with BaseFolderOperationSchema, NanoBananaFolderSchema, and SeedreamFolderSchema

## Decisions Made

**1. Use z.discriminatedUnion with 'model' as discriminator**
- Rationale: Enables O(1) schema lookup instead of O(n) union validation, improves performance and error messages

**2. Explicitly define undefined for non-applicable fields**
- Rationale: Makes type narrowing explicit - when model is 'nano-banana-pro', TypeScript knows quality/imageSize are undefined

**3. Set defaults for model-specific parameters**
- Rationale: Maintains backward compatibility and provides sensible defaults (2K resolution for Nano Banana, basic quality and landscape_16_9 for Seedream)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## Next Phase Readiness

- Discriminated union schema is ready for AI prompt updates (Phase 9)
- Type narrowing works correctly for model-specific parameter access
- All TypeScript compilation passes without errors
- Ready for AI parser to leverage discriminated union in structured output

---
*Phase: 08-schema-extensions-migrations*
*Completed: 2026-01-26*
