---
phase: 20-testing
plan: 02
subsystem: testing
tags: [vitest, integration-tests, gemini, mocking, api-testing]

# Dependency graph
requires:
  - phase: 20-01
    provides: Vitest testing infrastructure
provides:
  - Integration tests for Gemini AI parser with mocked SDK
  - Mock pattern for external API testing
affects: [20-04-full-workflow-testing, future-ai-parsing-changes]

# Tech tracking
tech-stack:
  added: []
  patterns: [vi.mock-relative-path, mock-response-helpers, api-call-verification]

key-files:
  created:
    - lib/ai/gemini-parser.test.ts
  modified: []

key-decisions:
  - "vi.mock with relative path from test file location"
  - "Mock response helpers for consistent test data"
  - "10 test cases covering all major code paths"

patterns-established:
  - "Mock external SDK modules with relative paths"
  - "Use helper functions for mock response generation"
  - "Verify API call counts to ensure efficiency"
  - "Test both success and error paths"

# Metrics
duration: 1min
completed: 2026-01-31
---

# Phase 20 Plan 02: Integration Tests for Gemini Parser Summary

**10 integration tests for parseJobWithGemini with mocked Gemini SDK, covering single/multi-folder parsing, confidence aggregation, model extraction, error handling, and null normalization**

## Performance

- **Duration:** 1 min
- **Started:** 2026-01-31T21:52:06Z
- **Completed:** 2026-01-31T21:53:20Z
- **Tasks:** 1
- **Files created:** 1

## Accomplishments
- Created lib/ai/gemini-parser.test.ts with 10 integration tests
- Properly mocked Gemini SDK using vi.mock('./gemini') with relative path
- Tests cover all major parseJobWithGemini behavior paths
- Tests complete in under 1 second (16ms actual test time)
- No real Gemini API calls made during testing

## Test Cases

| # | Test Case | Coverage |
|---|-----------|----------|
| 1 | should parse single folder successfully | Basic success path |
| 2 | should parse multiple folders | Multi-folder aggregation |
| 3 | should aggregate confidence across folders | Confidence averaging |
| 4 | should handle folder not mentioned in prompt | understood=false path |
| 5 | should extract correct model from folder operations | Seedream model handling |
| 6 | should handle JSON parse failure gracefully | Error recovery |
| 7 | should normalize null generationCount to undefined | Null normalization |
| 8 | should call API once per folder | Efficiency verification |
| 9 | should use withRetry for API calls | Retry wrapper usage |
| 10 | should handle mixed model selections across folders | Multi-model jobs |

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Integration Tests for parseJobWithGemini** - `5dec465` (test)

## Files Created
- `lib/ai/gemini-parser.test.ts` - 291 lines, 10 integration tests

## Key Implementation Details

### Mock Strategy
```typescript
vi.mock('./gemini', () => ({
  getGeminiModel: vi.fn(),
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
  GEMINI_MODEL: 'gemini-3-flash',
}));
```

### Mock Response Helper
Created `createMockGeminiResponse()` helper function that:
- Generates valid Gemini API response structure
- Supports both Nano Banana and Seedream model configurations
- Handles understood=true/false scenarios
- Supports custom confidence values
- Handles null generationCount for normalization testing

### Mock Model Helper
Created `createMockModel()` that:
- Returns sequential responses for multi-folder tests
- Tracks call count via mock implementation
- Simulates generateContent API behavior

## Decisions Made

**vi.mock relative path:** Used `vi.mock('./gemini')` with relative path from test file location rather than absolute import path. This matches Vitest's module resolution and ensures the mock intercepts the correct module.

**Helper function pattern:** Created reusable helper functions for mock data generation instead of inline mock definitions. This reduces duplication and makes tests more readable.

**10 test cases:** Exceeded the minimum 8 test cases to provide comprehensive coverage of all major code paths including edge cases like mixed models and JSON parse failures.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - tests passed on first run, all mocks worked correctly.

## User Setup Required

None - no external configuration needed.

## Next Phase Readiness

Ready for additional testing:
- Integration test pattern established
- Mock strategy proven for external SDKs
- Pattern can be reused for other AI service tests
- 58 total tests now passing (10 generation-count + 17 job-queries + 10 gemini-parser + 21 retry-strategies)

**Blockers:** None

**Concerns:** None - clean implementation with fast test execution

---
*Phase: 20-testing*
*Completed: 2026-01-31*
