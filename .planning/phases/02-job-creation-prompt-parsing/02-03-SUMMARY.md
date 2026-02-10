---
phase: 02-job-creation-prompt-parsing
plan: 03
subsystem: api
tags: [anthropic, claude, zod, structured-output, json-schema, tool-use]

# Dependency graph
requires:
  - phase: 02-01
    provides: Anthropic client singleton
  - phase: 02-02
    provides: ParsedJobSchema and ConversationMessage types
provides:
  - System prompt builder with dynamic folder context
  - AI parsing API endpoint for natural language to structured job
  - Tool-use pattern for Claude structured output
affects: [02-04, 02-05, job-preview, job-editing]

# Tech tracking
tech-stack:
  added: [zod-to-json-schema]
  patterns: [zod-to-json-schema conversion, tool-use structured output, system prompt builder]

key-files:
  created:
    - lib/ai/prompts/job-parser.ts
    - app/api/ai/parse/route.ts
  modified: []

key-decisions:
  - "Tool-use pattern for structured output - Claude returns JSON via tool call"
  - "Dynamic system prompt with folder structure - file counts for context"
  - "Photo mode inference rules in prompt - reference vs analysis distinction"

patterns-established:
  - "System prompt builder: function builds prompt with dynamic context"
  - "Tool-use for structured output: Zod schema -> JSON Schema -> Claude tool -> validate response"

# Metrics
duration: 3min
completed: 2026-01-25
---

# Phase 02 Plan 03: Prompt Parsing API Summary

**AI parsing endpoint using Claude tool-use with Zod schema validation for natural language to structured job conversion**

## Performance

- **Duration:** 3 min
- **Started:** 2026-01-25T05:30:18Z
- **Completed:** 2026-01-25T05:32:46Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- System prompt builder that dynamically injects uploaded folder structure
- Photo mode inference rules (reference vs analysis) documented in prompt
- API endpoint that converts natural language to ParsedJob via Claude tool-use
- Zod-to-JSON-Schema conversion for Claude structured output validation

## Task Commits

Each task was committed atomically:

1. **Task 1: Create system prompt builder** - `f560abf` (feat)
2. **Task 2: Create AI parsing API endpoint** - `fd11d24` (feat)

## Files Created/Modified
- `lib/ai/prompts/job-parser.ts` - System prompt builder with folder context and photo mode rules
- `app/api/ai/parse/route.ts` - POST handler for AI parsing with structured output
- `package.json` - Added zod-to-json-schema dependency
- `package-lock.json` - Updated lockfile

## Decisions Made
- **Tool-use pattern for structured output:** Claude returns JSON via tool call rather than raw text, ensuring schema compliance
- **zod-to-json-schema for type safety:** Converts Zod schema to JSON Schema that Claude tools expect, maintaining single source of truth
- **Dynamic system prompt:** Folder structure injected at runtime so Claude knows available folders and file counts
- **Photo mode inference in prompt:** Detailed rules for when to use reference vs analysis mode based on operation language

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript errors in route.ts**
- **Found during:** Task 2 (API endpoint creation)
- **Issue:** Type mismatch between zod-to-json-schema output and Anthropic SDK InputSchema type; ZodError uses `.issues` not `.errors`
- **Fix:** Added proper type casting for JSON schema, imported Tool type, fixed error property access
- **Files modified:** app/api/ai/parse/route.ts
- **Verification:** `npx tsc --noEmit` passes
- **Committed in:** fd11d24 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Type safety fix necessary for compilation. No scope creep.

## Issues Encountered
None beyond the auto-fixed TypeScript errors.

## User Setup Required
None - no external service configuration required. API key setup was completed in 02-01.

## Next Phase Readiness
- AI parsing foundation complete
- Ready for 02-04: Job Preview UI to display parsed results
- Ready for 02-05: Job editing interface for user modifications
- Multi-turn conversation flow can now iterate with clarifying questions

---
*Phase: 02-job-creation-prompt-parsing*
*Completed: 2026-01-25*
