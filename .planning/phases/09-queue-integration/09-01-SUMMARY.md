---
phase: 09-queue-integration
plan: 01
subsystem: queue
tags: [model-strategy, queue, parameter-building, reference-images, multi-model]

# Dependency graph
requires:
  - phase: 07-model-strategy-infrastructure
    provides: ModelStrategy interface, getModelStrategy factory, model capabilities
  - phase: 08-schema-extensions
    provides: Model field in GenerationJob, discriminated union schemas
provides:
  - buildModelParams helper for constructing model-specific parameters
  - Model-aware reference image slicing in job expansion
  - Dynamic reference image limits based on model capabilities (8 for Nano, 14 for Seedream)
affects: [10-queue-worker, queue-processing, generation-execution]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Model-aware parameter building via strategy pattern"
    - "Defense-in-depth reference image slicing at multiple layers"
    - "Exhaustive switch for model ID handling"

key-files:
  created:
    - lib/queue/model-params.ts
  modified:
    - lib/job/job-manager.ts

key-decisions:
  - "buildModelParams uses exhaustive switch for compile-time safety"
  - "Model field read from folder config, falls back to DEFAULT_MODEL"
  - "Reference images sliced at job expansion time based on model capabilities"
  - "Default parameter values: resolution='2K', quality='basic', imageSize='square', outputFormat='png'"

patterns-established:
  - "Queue parameter builders take (job, strategy, finalPrompt) and return model-specific params"
  - "Model determination happens once per folder, before generation loop"
  - "maxReferenceImages extracted from strategy capabilities for consistent slicing"

# Metrics
duration: 3min
completed: 2026-01-26
---

# Phase 9 Plan 01: Model-Aware Parameter Building Summary

**buildModelParams helper with exhaustive switch creates model-specific parameters, job-manager reads model from folder config and slices reference images to model-specific limits (8 for Nano Banana, 14 for Seedream)**

## Performance

- **Duration:** 3 min
- **Started:** 2026-01-26T19:38:00Z
- **Completed:** 2026-01-26T19:41:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created buildModelParams helper that constructs NanoBananaParams or SeedreamParams based on strategy ID
- Eliminated hardcoded reference image limit of 8, now uses strategy.capabilities.maxReferenceImages
- Model field propagates from folder config to GenerationJob construction (not hardcoded DEFAULT_MODEL)
- Exhaustive switch ensures compile error if new model added without handler

## Task Commits

Each task was committed atomically:

1. **Task 1: Create buildModelParams helper** - `33cabed` (feat)
2. **Task 2: Update expandJobToGenerations with model-aware slicing** - `229013c` (feat)

## Files Created/Modified
- `lib/queue/model-params.ts` - Helper function to build model-specific generation parameters from GenerationJob
- `lib/job/job-manager.ts` - Updated to read model from folder config and slice references based on model capabilities

## Decisions Made
- buildModelParams uses exhaustive switch on strategy.capabilities.id for type safety - ensures compile error if new model added without handler
- Model determination happens once per folder (before generation loop) for efficiency
- Reference images sliced to maxReferenceImages as defense-in-depth (queue should not trust job-manager slicing)
- Default parameter values maintain backward compatibility: resolution='2K' (Nano), quality='basic' (Seedream), imageSize='square' (Seedream), outputFormat='png'

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - TypeScript compilation passed on first attempt, all verifications succeeded.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for Phase 9 Plan 02 (Queue Worker Implementation):**
- buildModelParams ready to construct model-specific parameters
- GenerationJob includes correct model field from folder config
- Reference images properly sliced to model-specific limits
- Exhaustive switch pattern established for model handling

**Blockers/Concerns:**
None

---
*Phase: 09-queue-integration*
*Completed: 2026-01-26*
