---
phase: 08-schema-extensions-migrations
plan: 03
subsystem: cost-estimation
tags: [strategy-pattern, multi-model, pricing, nano-banana, seedream]

# Dependency graph
requires:
  - phase: 07-model-strategy-infrastructure
    provides: ModelStrategy interface, getModelStrategy factory, capabilities with costPerGeneration
provides:
  - Dynamic cost estimation using model strategy capabilities
  - Per-model cost breakdown (byModel array)
  - Support for Nano Banana (by resolution) and Seedream (by quality) pricing
affects: [09-ui-multi-model, cost-display, job-submission]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Strategy-based pricing lookup instead of hardcoded constants"
    - "Multi-model cost aggregation with per-model subtotals"

key-files:
  created: []
  modified:
    - lib/job/cost-estimation.ts
    - components/job/cost-estimate.tsx

key-decisions:
  - "Cost estimation queries strategy.capabilities.costPerGeneration dynamically"
  - "byModel array provides per-model cost subtotals"
  - "Maintain byResolution for backward compatibility with existing UI"
  - "tier field replaces resolution field to support both models"

patterns-established:
  - "Strategy pattern enables dynamic pricing without hardcoded constants"
  - "byFolder includes model and tier for flexible cost breakdown display"

# Metrics
duration: 2min
completed: 2026-01-26
---

# Phase 8 Plan 03: Dynamic Cost Estimation Summary

**Cost estimation queries model strategy capabilities for Nano Banana ($0.134/0.24) and Seedream ($0.032) pricing with per-model breakdowns**

## Performance

- **Duration:** 2 minutes
- **Started:** 2026-01-27T00:03:33Z
- **Completed:** 2026-01-27T00:05:21Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Removed hardcoded COST_PER_IMAGE constant, replaced with strategy lookup
- Dynamic pricing from strategy.capabilities.costPerGeneration for both models
- Per-model cost aggregation with byModel array (model, imageCount, costPerImage, totalCost)
- Support for Nano Banana resolution tiers (1K/2K/4K) and Seedream quality tiers (basic/high)

## Task Commits

Each task was committed atomically:

1. **Task 1: Update CostBreakdown interface for multi-model support** - `b07ba96` (feat)
2. **Task 2: Implement strategy-based cost calculation** - `7cb44b3` (feat)

## Files Created/Modified
- `lib/job/cost-estimation.ts` - Strategy-based cost calculation with multi-model support
- `components/job/cost-estimate.tsx` - UI fix to use tier instead of resolution

## Decisions Made
- **tier field:** Unified field for resolution (Nano Banana) or quality (Seedream) enables flexible breakdown display
- **byModel array:** Enables per-model cost subtotals in UI for mixed-model jobs
- **Backward compatibility:** Keep byResolution and perImageCost for existing UI components

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed UI type error for tier field**
- **Found during:** Task 2 (TypeScript compilation)
- **Issue:** components/job/cost-estimate.tsx referenced folder.resolution which no longer exists after schema change
- **Fix:** Changed folder.resolution to folder.tier in UI component
- **Files modified:** components/job/cost-estimate.tsx
- **Verification:** TypeScript compiles without errors
- **Committed in:** 7cb44b3 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Fix necessary to unblock TypeScript compilation. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Cost estimation fully multi-model aware
- Ready for Phase 9 UI components to display per-model cost breakdowns
- Strategy pattern integration validated across pricing layer

---
*Phase: 08-schema-extensions-migrations*
*Completed: 2026-01-26*
