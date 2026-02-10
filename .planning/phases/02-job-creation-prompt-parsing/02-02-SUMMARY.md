---
phase: 02-job-creation-prompt-parsing
plan: 02
subsystem: ai
tags: [zod, typescript, schemas, cost-estimation, structured-output]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: TypeScript project with Next.js and upload types
provides:
  - Zod schemas for Claude structured output (ParsedJobSchema, FolderOperationSchema)
  - TypeScript types inferred from schemas (ParsedJob, FolderOperation, ConversationState)
  - Cost estimation utility for kie.ai pricing (calculateCostEstimate, CostBreakdown)
affects: [02-03-prompt-parsing-api, 02-04-job-preview-ui, 03-execution-queue]

# Tech tracking
tech-stack:
  added: []
  patterns: [zod-to-typescript-inference, schema-driven-types]

key-files:
  created:
    - lib/ai/schemas/job.ts
    - lib/types/job.ts
    - lib/job/cost-estimation.ts
  modified: []

key-decisions:
  - "Zod schemas with .describe() for Claude context"
  - "Types inferred from schemas via z.infer for single source of truth"
  - "ConversationState as union type for state machine"
  - "kie.ai pricing: 1K/2K=$0.134, 4K=$0.24 per image"

patterns-established:
  - "Schema-driven types: Define Zod schema, infer TypeScript type"
  - "Conversation state machine pattern for multi-turn AI interaction"

# Metrics
duration: 3min
completed: 2026-01-25
---

# Phase 2 Plan 02: Job Schemas & Types Summary

**Zod schemas for Claude structured output with inferred TypeScript types and kie.ai cost estimation**

## Performance

- **Duration:** 3 min
- **Started:** 2026-01-25
- **Completed:** 2026-01-25
- **Tasks:** 3
- **Files created:** 3

## Accomplishments
- Comprehensive Zod schemas for AI structured output with `.describe()` annotations
- TypeScript types automatically inferred from schemas for type safety
- Conversation state machine types for multi-turn AI interaction flow
- Cost estimation utility with per-folder and per-resolution breakdown

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Zod schemas for parsed job structure** - `6803fb3` (feat)
2. **Task 2: Create TypeScript types and conversation types** - `51088ad` (feat)
3. **Task 3: Create cost estimation utility** - `d23ac4f` (feat)

## Files Created

- `lib/ai/schemas/job.ts` - Zod schemas for Claude structured output (ParsedJobSchema, FolderOperationSchema, etc.)
- `lib/types/job.ts` - TypeScript types inferred from schemas plus conversation state types
- `lib/job/cost-estimation.ts` - Cost calculation for kie.ai pricing with breakdown utilities

## Decisions Made

- **Schema descriptions for Claude:** All Zod schemas include `.describe()` to provide context for Claude's structured output generation
- **Single source of truth:** Types are inferred from Zod schemas via `z.infer<typeof Schema>` to prevent drift
- **State machine pattern:** ConversationState as a union type enables exhaustive pattern matching
- **Pricing defaults:** Used kie.ai Nano Banana Pro tier pricing ($0.134 for 1K/2K, $0.24 for 4K)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Schemas ready for Anthropic structured outputs API integration
- Types available for UI components and API routes
- Cost estimation ready for job preview display
- Next: Prompt parsing API (02-03) will use these schemas

---
*Phase: 02-job-creation-prompt-parsing*
*Completed: 2026-01-25*
