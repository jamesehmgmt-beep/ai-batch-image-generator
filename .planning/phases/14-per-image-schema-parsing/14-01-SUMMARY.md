---
phase: 14-per-image-schema-parsing
plan: 01
subsystem: api
tags: [zod, typescript, schema, discriminated-union, type-safety]

# Dependency graph
requires:
  - phase: 08-schema-extensions-migrations
    provides: Discriminated union pattern for FolderOperationSchema
provides:
  - ImageOperationSchema with discriminated union on 'model' field
  - imageOperations array field on FolderOperation type
  - ImageOperation type export from centralized lib/types/job.ts
affects: [14-02-per-image-ai-parsing, 14-03-per-image-job-expansion, 14-04-per-image-cost-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-image discriminated union mirrors folder-level pattern"
    - "Forward reference prevention via schema ordering"

key-files:
  created: []
  modified:
    - lib/ai/schemas/job.ts
    - lib/types/job.ts

key-decisions:
  - "Per-image schemas declared before BaseFolderOperationSchema to avoid forward reference"
  - "imageOperations field description notes mutual exclusivity with excludedFiles (normalization in 14-02)"
  - "Type export centralized in lib/types/job.ts for consistent imports"

patterns-established:
  - "BaseImageOperationSchema + model-specific extensions (NanoBananaImageSchema, SeedreamImageSchema)"
  - "Discriminated union on 'model' field for O(1) validation and type narrowing"

# Metrics
duration: 8min
completed: 2026-01-30
---

# Phase 14 Plan 01: Per-Image Schema & Parsing Summary

**Zod schema extended with ImageOperationSchema discriminated union enabling per-image model selection within folders**

## Performance

- **Duration:** 8 min
- **Started:** 2026-01-30T05:06:05Z
- **Completed:** 2026-01-30T05:14:29Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments
- ImageOperationSchema discriminated union created with Nano Banana and Seedream variants
- FolderOperationSchema extended with optional imageOperations array field
- ImageOperation type exported from lib/types/job.ts for centralized import
- Schema compilation verified with TypeScript and runtime validation test

## Task Commits

Each task was committed atomically:

1. **Task 1: Create ImageOperationSchema discriminated union** - `bc7210e` (feat) - *Pre-existing*
2. **Task 2: Extend FolderOperationSchema with imageOperations** - `bc7210e` (feat) - *Pre-existing*
3. **Task 3: Update types/job.ts with ImageOperation export** - `2777b18` (feat)

**Plan metadata:** `[pending]` (docs: complete plan)

_Note: Tasks 1 and 2 were completed in a prior commit (bc7210e) which fixed a TypeScript forward reference error during plan 14-02 execution._

## Files Created/Modified
- `lib/ai/schemas/job.ts` - Added BaseImageOperationSchema, NanoBananaImageSchema, SeedreamImageSchema, ImageOperationSchema discriminated union, and imageOperations field on BaseFolderOperationSchema
- `lib/types/job.ts` - Added ImageOperation type export for centralized import

## Decisions Made

**Schema ordering for forward reference prevention:**
- Per-image operation schemas (BaseImageOperationSchema, NanoBananaImageSchema, SeedreamImageSchema, ImageOperationSchema) declared BEFORE BaseFolderOperationSchema
- Prevents TypeScript TS2448 "Block-scoped variable used before declaration" error
- Mirrors folder-level schema organization pattern

**Mutual exclusivity documentation (not enforcement):**
- imageOperations field description notes: "Mutually exclusive with excludedFiles - if imageOperations exists, only those files are processed"
- Enforcement via normalization logic deferred to plan 14-02 (app/api/ai/parse/route.ts)
- Avoids .refine() which complicates JSON schema conversion for AI parsing

**Type export centralization:**
- ImageOperation type exported from lib/types/job.ts (not directly from lib/ai/schemas/job.ts)
- Consistent with existing pattern (FolderOperation, ParsedJob, etc.)
- Single import path for consumers throughout codebase

## Deviations from Plan

### Pre-existing Implementation

**Tasks 1 & 2 completed in prior execution**
- **Found during:** Task execution startup
- **Context:** Commit bc7210e (plan 14-02) included ImageOperationSchema creation and imageOperations field addition
- **Reason:** Fixed blocking TypeScript forward reference error (TS2448) encountered during 14-02 execution
- **Action taken:** Verified existing implementation matches plan specification, proceeded with Task 3 only
- **Impact:** No deviation from intended outcome - schema structure exactly as planned

---

**Total deviations:** 0 (Tasks 1-2 pre-completed but match plan exactly)
**Impact on plan:** None - all requirements delivered as specified

## Issues Encountered

None - schema structure already present from prior commit, Task 3 completed successfully

## User Setup Required

None - no external service configuration required

## Next Phase Readiness

**Ready for 14-02 (AI Parsing for Per-Image Operations):**
- ImageOperationSchema available for inclusion in system prompt
- Type inference working for discriminated union
- Schema validated via TypeScript compilation and runtime test

**Blockers/Concerns:** None

**Test verification passed:**
```javascript
// Schema accepts mixed model types in imageOperations
{
  folderPath: "5",
  model: "nano-banana-pro",
  operation: "test",
  photoMode: "reference",
  aspectRatio: "1:1",
  imageOperations: [
    {
      fileName: "x.jpg",
      model: "seedream-4.5-edit",
      quality: "high",
      imageSize: "square_1_1"
    }
  ]
}
// ✓ Schema validation passed
// ✓ Type inference working
```

---
*Phase: 14-per-image-schema-parsing*
*Completed: 2026-01-30*
