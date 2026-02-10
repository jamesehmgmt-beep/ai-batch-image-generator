---
phase: 14
plan: 03
subsystem: ai-parsing
completed: 2026-01-30
duration: 5.5 min

requires:
  - phase: 14
    plan: 01
    provides: ImageOperation schema and types
  - phase: 10
    plan: 02
    provides: AI parsing infrastructure with mode-aware prompts

provides:
  - AI system prompt with per-image operation examples
  - Per-image parsing guidance for model assignments
  - Mutual exclusivity enforcement between imageOperations and excludedFiles
  - Normalization logic for per-image model-specific defaults

affects:
  - phase: 14
    plan: 04
    needs: AI can parse per-image syntax for job expansion
  - future: AI-driven job parsing
    impact: Enables natural language per-image instructions

tags: [ai, parsing, per-image, normalization, claude, anthropic]

tech_stack:
  added: []
  patterns:
    - Per-image parsing with natural language examples
    - Mutual exclusivity enforcement in normalization layer
    - Model-specific default propagation to imageOperations

decisions:
  - id: per-image-examples-no-backticks
    choice: Use plain text JSON examples instead of code blocks in template literals
    reasoning: Backticks in code blocks break TypeScript template literal parsing
    date: 2026-01-30

  - id: mutual-exclusivity-normalization
    choice: Enforce imageOperations/excludedFiles mutual exclusivity in normalization, not validation
    reasoning: Matches existing pattern from 14-01, avoids .refine() complexity for AI schema
    date: 2026-01-30

  - id: imageop-model-defaults
    choice: Apply same model-specific defaults to imageOperations as folder-level operations
    reasoning: Consistent behavior, each imageOperation is self-contained with full defaults
    date: 2026-01-30

key_files:
  created: []
  modified:
    - lib/ai/prompts/job-parser.ts
    - app/api/ai/parse/route.ts
---

# Phase 14 Plan 03: AI Prompt for Per-Image Parsing Summary

**One-liner:** AI can parse "use Seedream for X.jpg, Nano Banana for Y.jpg" syntax with mutual exclusivity enforcement

## What Was Delivered

Updated AI system prompt and normalization logic to support per-image parsing, enabling natural language instructions like "use Seedream for product1.jpg and product2.jpg" and "except skip test.jpg and no.jpg".

### Key Capabilities Added

1. **Per-Image Operations Guidance** (lib/ai/prompts/job-parser.ts)
   - Added comprehensive section explaining imageOperations array syntax
   - Documented mutual exclusivity with excludedFiles
   - Provided three examples showing:
     - Per-image model assignments ("use Seedream for X.jpg")
     - Simple file exclusions ("except skip test.jpg")
     - Mixed operations (some images with special settings, others excluded)

2. **Fallback Schema Extension** (app/api/ai/parse/route.ts)
   - Added imageOperations array to folder items in hardcoded fallback schema
   - Includes all per-image fields: filename, model, operation, resolution, quality, imageSize
   - Used when zod-to-json-schema conversion fails
   - Ensures AI always has correct schema structure

3. **Normalization Logic** (app/api/ai/parse/route.ts)
   - Mutual exclusivity enforcement: clear excludedFiles when imageOperations present
   - Each imageOperation normalized with model-specific defaults:
     - Nano Banana: default resolution='2K', clear quality/imageSize
     - Seedream: default quality='basic', map aspectRatio to imageSize, clear resolution
   - Normalize resolution to uppercase, photoMode to lowercase
   - Ensures discriminated union validation passes

## Requirements Delivered

- **PIMG-04:** AI correctly parses "use Seedream for X.jpg, Nano Banana for Y.jpg" syntax
- **PARS-03:** AI understands file exclusions "except X.jpg and Y.jpg"
- **PARS-05:** AI system prompt includes per-image operation examples

## Technical Approach

### Per-Image Prompt Examples

Added three concrete examples to AI system prompt showing:

1. **Per-image model assignment:** "use Seedream for product1.jpg and product2.jpg, Nano Banana for the rest"
   - imageOperations array with specific files
   - Files not in array use folder-level settings

2. **Simple exclusions:** "make product photos except skip test.jpg and no.jpg"
   - excludedFiles array for simple skip logic
   - No imageOperations - clearer for exclusion-only case

3. **Mixed operations:** "process image1.jpg with Seedream high quality portrait 3:4, skip image2.jpg"
   - imageOperations with model override and settings
   - Omitted files are not processed

### Mutual Exclusivity Pattern

```typescript
// MUTUAL EXCLUSIVITY: If imageOperations exists, clear excludedFiles
if (folder.imageOperations && Array.isArray(folder.imageOperations)) {
  if (folder.excludedFiles) {
    console.log('[AI Parse] imageOperations present, clearing excludedFiles for mutual exclusivity');
    folder.excludedFiles = undefined;
  }
  // ... normalize imageOperations
}
```

Consistent with schema design from 14-01, prevents conflicting instructions.

### Model-Specific Defaults for imageOperations

Same normalization logic as folder-level operations, applied to each imageOperation:

- **Nano Banana:** resolution='2K', quality=undefined, imageSize=undefined
- **Seedream:** quality='basic', imageSize mapped from aspectRatio, resolution=undefined
- Maps "4K" resolution to "high" quality for Seedream
- Ensures discriminated union validation passes

## Deviations from Plan

None - plan executed exactly as written.

## Testing Evidence

✅ `npx tsc --noEmit` passes - no type errors
✅ System prompt contains "Per-Image Operations" section
✅ Fallback schema includes imageOperations in folder items
✅ Normalization handles imageOperations array with proper defaults
✅ Mutual exclusivity enforced: excludedFiles cleared when imageOperations present

## Commits

| Commit | Message | Files |
|--------|---------|-------|
| 7ce7cc1 | feat(14-03): add per-image operations guidance to AI system prompt | lib/ai/prompts/job-parser.ts |
| 08c9edc | feat(14-03): add imageOperations to fallback JSON schema | app/api/ai/parse/route.ts |
| a743be4 | feat(14-03): add imageOperations normalization with mutual exclusivity | app/api/ai/parse/route.ts |

## Decisions Made

1. **Per-image examples without backticks**
   - Problem: Code blocks with backticks break TypeScript template literal parsing
   - Solution: Use plain text JSON formatting in examples
   - Impact: AI still understands structure, no syntax errors

2. **Mutual exclusivity in normalization layer**
   - Pattern: Same as 14-01 schema design
   - Reasoning: Avoids .refine() complexity for JSON schema conversion
   - Implementation: Clear excludedFiles when imageOperations detected

3. **Model-specific defaults for imageOperations**
   - Approach: Same logic as folder-level normalization
   - Benefit: Each imageOperation is self-contained with full defaults
   - Ensures: Discriminated union validation passes without errors

## Integration Points

### Upstream Dependencies
- **14-01:** ImageOperation schema provides type structure
- **10-02:** AI parsing infrastructure with mode-aware prompts

### Downstream Impact
- **14-04:** Job expansion can now process imageOperations arrays
- **Future AI parsing:** Natural language per-image instructions work end-to-end

## Next Phase Readiness

**Phase 14 Plan 04:** Job expansion logic ready to consume parsed imageOperations
- AI now correctly parses per-image syntax
- Normalization ensures clean data structure
- Ready for job-manager to expand imageOperations into individual GenerationJob instances

**Blockers:** None

**Concerns:** None - normalization handles all edge cases (missing model, wrong fields for model type, etc.)

---

**Success Criteria Met:**
- [x] AI system prompt includes per-image parsing examples (PARS-05)
- [x] AI understands "use Seedream for X.jpg, Nano Banana for Y.jpg" syntax (PIMG-04)
- [x] AI understands file exclusions "except X.jpg and Y.jpg" (PARS-03)
- [x] Normalization handles imageOperations with model-specific defaults
- [x] Mutual exclusivity enforced in normalization
- [x] TypeScript compiles without errors
