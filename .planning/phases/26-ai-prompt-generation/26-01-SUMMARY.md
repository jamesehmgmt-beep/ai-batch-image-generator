# Phase 26 Plan 01: Intent Analysis Foundation Summary

**One-liner:** Intent analysis system with Claude Sonnet 4.5 extended thinking that detects uniform/explicit-variations/implicit-variations modes and defaults to uniform when ambiguous.

## Frontmatter

```yaml
phase: 26-ai-prompt-generation
plan: 01
subsystem: ai-prompt-generation
tags: [claude, extended-thinking, intent-analysis, prompts]

dependency-graph:
  requires: [phase-25-schema-storage]
  provides: [intent-analysis-types, intent-analysis-function]
  affects: [phase-26-plan-02, phase-26-plan-03]

tech-stack:
  added: []
  patterns: [extended-thinking-analysis, xml-structured-prompts, fallback-chain]

key-files:
  created:
    - lib/ai/prompts/intent-analysis.ts
  modified:
    - lib/ai/prompt-generator.ts

decisions:
  - id: intent-mode-union
    choice: Use discriminated string union for IntentMode
    rationale: Type-safe, IDE autocomplete, easy pattern matching
  - id: extended-thinking-3000
    choice: Use 3000 budget_tokens for intent analysis
    rationale: Sufficient for reasoning without excessive latency/cost
  - id: confidence-threshold-0.7
    choice: Force uniform mode when confidence < 0.7
    rationale: Conservative default prevents unwanted variations
  - id: uniform-default-fallback
    choice: Return uniform mode with 0.5 confidence on any error
    rationale: Safe fallback ensures job creation never fails

metrics:
  duration: 3 minutes
  completed: 2026-02-04
```

## What Was Built

### 1. Intent Analysis Types (`lib/ai/prompts/intent-analysis.ts`)

Created the foundation types for intent classification:

```typescript
export type IntentMode = 'uniform' | 'explicit-variations' | 'implicit-variations';

export interface IntentAnalysis {
  mode: IntentMode;
  confidence: number;  // 0.0 to 1.0
  basePrompt: string;  // Core operation without embellishments
  variations?: string[];  // Only for explicit-variations
  reasoning?: string;  // From extended thinking for debugging
}
```

### 2. Intent Analysis System Prompt (`buildIntentAnalysisPrompt`)

Structured system prompt using XML tags following Claude 4.5 best practices:
- Clear examples for all three modes (uniform, explicit-variations, implicit-variations)
- Critical rules emphasizing uniform default when ambiguous
- Confidence guidance explaining thresholds
- Output format specification for JSON parsing

Key instructions included:
- "DEFAULT TO 'uniform' IF AMBIGUOUS - most users want same operation on all images"
- "Do NOT add details not present in user's prompt (no hallucinated lighting, poses, clothing, etc.)"
- "If confidence < 0.7, the caller will force mode to 'uniform'"

### 3. Intent Analysis Function (`analyzeUserIntent`)

Added to `lib/ai/prompt-generator.ts`:

```typescript
export async function analyzeUserIntent(
  folderOperation: string,
  userFullPrompt: string,
  imageCount: number
): Promise<IntentAnalysis>
```

Implementation features:
- Uses Claude Sonnet 4.5 with `budget_tokens: 3000` for extended thinking
- Extracts thinking block for debugging (logs first 200 chars)
- JSON response parsing with markdown code block cleanup
- Forces uniform mode when confidence < 0.7 with warning log
- Error fallback returns safe uniform intent with 0.5 confidence

### 4. JSON Parsing Helpers

Added helper functions for robust response parsing:
- `cleanJsonResponse(text)`: Strips markdown code block markers
- `parseJsonResponse<T>(text)`: Parses with clear error messages

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Intent modes | 3 discriminated modes (uniform/explicit-variations/implicit-variations) | Covers all observed user intent patterns |
| Thinking budget | 3000 tokens | Sufficient for complex reasoning per RESEARCH.md guidance |
| Confidence threshold | 0.7 | Conservative - ambiguous cases default to safer uniform mode |
| Error handling | Return uniform with 0.5 confidence | Never fail job creation due to intent analysis |
| Re-exports | Export IntentAnalysis/IntentMode from prompt-generator.ts | Clean API for consumers |

## Verification Results

All verification criteria passed:

- [x] TypeScript compiles: `npx tsc --noEmit` - no errors
- [x] New file exists: `lib/ai/prompts/intent-analysis.ts`
- [x] Exports available: IntentMode, IntentAnalysis, buildIntentAnalysisPrompt, analyzeUserIntent
- [x] System prompt includes all three modes with examples
- [x] Low confidence handling defaults to uniform mode
- [x] Existing generatePerImagePrompt function unchanged

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Hash | Message |
|------|---------|
| 24de141 | feat(26-01): add intent analysis types and system prompt |
| 85a63bd | feat(26-01): add analyzeUserIntent function with extended thinking |

## Files Changed

```
lib/ai/prompts/intent-analysis.ts (created)
  - IntentMode type
  - IntentAnalysis interface
  - buildIntentAnalysisPrompt function

lib/ai/prompt-generator.ts (modified)
  - Added imports from anthropic.ts and intent-analysis.ts
  - Added cleanJsonResponse helper
  - Added parseJsonResponse helper
  - Added analyzeUserIntent function
  - Re-exported IntentAnalysis and IntentMode types
  - Kept generatePerImagePrompt unchanged
```

## Next Phase Readiness

Ready for Phase 26 Plan 02 (Prompt Generation Enhancement):
- IntentAnalysis types available for consumption
- analyzeUserIntent function ready to call per-folder
- generatePerImagePrompt ready for enhancement based on intent mode
- All infrastructure in place for intelligent prompt generation
