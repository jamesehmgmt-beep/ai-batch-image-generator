---
phase: 10-per-folder-prompt-logic
plan: 02
subsystem: ai
tags: [claude, anthropic, prompt-engineering, parser, validation]

# Dependency graph
requires:
  - phase: 10-01
    provides: Prompt combination modes and buildFinalPrompt utility
provides:
  - Mode-aware AI parser system prompts (global vs per-folder)
  - Parse API route accepting promptMode parameter
  - Per-folder validation with confidence adjustment
  - Model-specific parameter instructions in prompts
affects: [10-03-folder-mode-ui, 11-ui-components]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Mode-aware system prompt generation
    - Validation with confidence adjustment (soft failure)

key-files:
  created: []
  modified:
    - lib/ai/prompts/job-parser.ts
    - app/api/ai/parse/route.ts

key-decisions:
  - "Mode-aware prompts: Different system prompts for global vs per-folder mode"
  - "Soft validation: Per-folder validation reduces confidence instead of failing"
  - "Model-specific instructions: Prompt includes discriminated union parameter rules"

patterns-established:
  - "Validation with confidence adjustment: Warn and reduce confidence rather than hard fail"
  - "Mode-conditional prompt generation: System prompts adapt to user's selected mode"

# Metrics
duration: 2.5min
completed: 2026-01-27
---

# Phase 10 Plan 02: AI Parser Mode Awareness Summary

**Claude parser adapts system prompts based on promptMode, validates per-folder operations, and guides model-specific parameter extraction**

## Performance

- **Duration:** 2.5 minutes
- **Started:** 2026-01-27T00:54:44Z
- **Completed:** 2026-01-27T00:57:14Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments
- Parser system prompt adapts based on promptMode parameter (global/per-folder)
- Per-folder mode includes detailed instructions with model-specific parameter rules
- API route accepts promptMode parameter throughout parse flow
- Fallback schema supports model-discriminated folder properties
- Per-folder validation checks operation coverage and adjusts confidence

## Task Commits

Each task was committed atomically:

1. **Task 1: Update Job Parser System Prompt for Mode Awareness** - `b21331e` (feat)
2. **Task 2: Update Parse API Route for promptMode** - `dd2b39b` (feat)
3. **Task 3: Add Per-Folder Mode Validation to Parse Response** - `13104b2` (feat)

## Files Created/Modified
- `lib/ai/prompts/job-parser.ts` - Added promptMode parameter, mode-specific guidance constants, conditional prompt generation
- `app/api/ai/parse/route.ts` - Added promptMode to ParseRequest, validation function, confidence adjustment logic

## Decisions Made

**1. Mode-aware prompts with conditional guidance**
- **Decision:** Generate different system prompts for global vs per-folder mode
- **Rationale:** Per-folder mode requires detailed instructions for folder-specific parsing and model parameter extraction. Global mode just needs promptMode field note.
- **Implementation:** Added perFolderGuidance and globalModeNote constants, conditionally inject based on promptMode parameter

**2. Soft validation with confidence adjustment**
- **Decision:** Per-folder validation warns and reduces confidence instead of failing
- **Rationale:** Claude might partially parse folders - better to reduce confidence and let user refine than hard fail
- **Implementation:** validatePerFolderMode returns warnings array and confidence reduction (0.1 per issue, max 0.3 total)

**3. Model-specific parameter rules in prompt**
- **Decision:** Explicitly instruct Claude about discriminated union validation
- **Rationale:** Claude needs to know to set undefined for non-applicable model fields (resolution for Seedream, quality/imageSize for Nano Banana)
- **Implementation:** Added "Model-Specific Parameter Rules" section with clear examples in perFolderGuidance

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

**TypeScript type error on job.promptMode property**
- **Issue:** Type annotation missing promptMode field, causing TS2339 errors
- **Resolution:** Updated type assertion to include `promptMode?: string` field
- **Impact:** Minor - caught immediately by tsc, fixed before commit

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for 10-03 (Folder Mode UI):**
- Parse API route accepts promptMode parameter
- System prompt adapts to mode selection
- Validation logic ready for UI integration

**Validation behavior:**
- Per-folder validation logs warnings to console
- Confidence reduced when folders missing operations
- UI can display confidence scores to user

**Future considerations:**
- May want to expose validation warnings to UI (currently console-only)
- Consider adding mode-specific example parsing tests

---
*Phase: 10-per-folder-prompt-logic*
*Completed: 2026-01-27*
