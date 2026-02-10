---
phase: 10-per-folder-prompt-logic
plan: 01
subsystem: job-parsing
status: complete
tags: [schema, validation, prompts, zod]

requires:
  - phase: 03-queue-processing-image-generation
    reason: Extends job schema that's parsed by job-parser and validated in parse route

provides:
  - PromptModeSchema with 'global' and 'per-folder' enum values
  - PromptCombinationModeSchema with 'prefix', 'suffix', 'only' enum values
  - buildFinalPrompt utility function for prompt combination logic
  - Updated ParsedJobSchema and ConfirmedJobSchema with prompt mode fields

affects:
  - phase: 10-per-folder-prompt-logic
    plan: 02
    reason: API routes will use these schemas for validation and buildFinalPrompt for prompt combination

tech-stack:
  added: []
  patterns:
    - "Zod schema defaults for backward compatibility"
    - "Pure utility functions for testable business logic"

key-files:
  created:
    - path: lib/job/prompt-builder.ts
      purpose: Pure utility function for combining global and folder prompts based on combination mode
  modified:
    - path: lib/ai/schemas/job.ts
      changes: Added PromptModeSchema, PromptCombinationModeSchema, updated job objects with promptMode and globalPromptMode fields

decisions:
  - what: Default promptMode to 'global' for backward compatibility
    why: Existing v1.0 jobs continue working without migration
    alternatives: Require explicit mode in all jobs (breaking change)
    impact: Zero breaking changes, seamless upgrade path

  - what: Use double newline as prompt separator in buildFinalPrompt
    why: Clear visual separation between global and folder prompts in combined output
    alternatives: Single newline, custom delimiter, no separator
    impact: Generation APIs receive well-formatted combined prompts

  - what: Make buildFinalPrompt a pure function with validation
    why: Enables easy unit testing, clear error messages, no side effects
    alternatives: Class-based approach, inline logic in API routes
    impact: Highly testable, reusable across codebase

metrics:
  duration: ~5 minutes
  completed: 2026-01-27
---

# Phase 10 Plan 01: Prompt Mode Schemas & Builder Summary

**One-liner:** Added Zod schemas for prompt modes (global/per-folder) with combination logic (prefix/suffix/only) and pure prompt builder utility

## What Was Built

### 1. Prompt Mode Schemas (lib/ai/schemas/job.ts)

Added two new Zod enum schemas:

**PromptModeSchema:**
- Values: `'global'` | `'per-folder'`
- Default: `'global'`
- Purpose: Distinguishes between single global prompt vs per-folder prompts

**PromptCombinationModeSchema:**
- Values: `'prefix'` | `'suffix'` | `'only'`
- Default: `'prefix'`
- Purpose: Controls how to combine global + folder prompts when both exist
  - `prefix`: Global first, then folder prompt
  - `suffix`: Folder prompt first, then global
  - `only`: Use global only, ignore folder prompt

**Schema Integration:**
- Updated `ParsedJobSchema.job` with `promptMode` and `globalPromptMode` fields
- Updated `ConfirmedJobSchema.job` with same fields
- Backward compatible: `promptMode` defaults to `'global'` so v1.0 jobs continue working

### 2. Prompt Builder Utility (lib/job/prompt-builder.ts)

Created `buildFinalPrompt` pure function:

```typescript
buildFinalPrompt(
  globalPrompt?: string,
  folderOperation?: string,
  combinationMode: 'prefix' | 'suffix' | 'only' = 'prefix'
): string
```

**Behavior:**
- Validates at least one prompt exists (throws Error if both undefined)
- Returns folder prompt if no global
- Returns global prompt if no folder or `only` mode
- Combines with double newline separator for `prefix` and `suffix` modes
- Pure function: no side effects, easily testable

**Test Coverage:**
- ✓ Folder only scenario
- ✓ Global only scenario
- ✓ Prefix mode combination
- ✓ Suffix mode combination
- ✓ Only mode (ignores folder)
- ✓ Error case (both undefined)

## Implementation Details

### Task 1: Add Prompt Mode Schemas
- Added `PromptModeSchema` and `PromptCombinationModeSchema` to job.ts
- Updated both `ParsedJobSchema` and `ConfirmedJobSchema` job objects
- Preserved existing `FolderOperationSchema` discriminated union unchanged
- All fields properly exported

**Commit:** `4b2278e` - feat(10-01): add PromptMode and PromptCombinationMode schemas

### Task 2: Create Prompt Builder Utility
- Created new `lib/job/prompt-builder.ts` file
- Implemented `buildFinalPrompt` with validation and combination logic
- Manually tested all 6 scenarios (passed 6/6)
- TypeScript compilation verified

**Commit:** `7088ae9` - feat(10-01): create buildFinalPrompt utility

## Deviations from Plan

None - plan executed exactly as written.

## Technical Notes

### Backward Compatibility
The `promptMode` field defaults to `'global'`, ensuring existing v1.0 jobs (which only have global prompts) continue working without schema migration. The AI parser will now explicitly set this field, but legacy data remains valid.

### Prompt Separator Choice
Using `\n\n` (double newline) provides clear visual separation in combined prompts while remaining simple. This is a common Markdown/text convention that generation APIs handle well.

### Pure Function Design
`buildFinalPrompt` has no dependencies on job context, database, or external state. This makes it:
- Easy to unit test (no mocking required)
- Safe to use in any context (API routes, background workers, etc.)
- Predictable (same inputs always produce same output)

## Integration Points

### Upstream Dependencies
- Extends schemas from Phase 3 (ParsedJobSchema, ConfirmedJobSchema)
- Builds on existing `FolderOperationSchema` discriminated union

### Downstream Usage (Plan 10-02)
- Job parser prompt will instruct AI to set `promptMode` and `globalPromptMode`
- Parse route validation will enforce new schema fields
- Job expansion logic will use `buildFinalPrompt` to combine prompts before generation

## Next Phase Readiness

**Ready for Plan 10-02:** API Integration
- Schemas exported and validated
- Prompt builder utility tested and ready
- No blockers or concerns

**Future Considerations:**
- May want integration tests for full parse → expand → generate flow in later plans
- Consider adding `PromptCombinationMode` UI selector in future UX improvements

## Files Changed

**Created:**
- `lib/job/prompt-builder.ts` (52 lines)

**Modified:**
- `lib/ai/schemas/job.ts` (+14 lines)
  - Added 2 new schema exports
  - Updated 2 job object definitions

**TypeScript:** All files compile without errors
**Tests:** Manual verification passed (6/6 scenarios)

---

**Plan Status:** ✅ Complete
**Commits:** 2 atomic commits (4b2278e, 7088ae9)
**Duration:** ~5 minutes
**Success Criteria:** All met
