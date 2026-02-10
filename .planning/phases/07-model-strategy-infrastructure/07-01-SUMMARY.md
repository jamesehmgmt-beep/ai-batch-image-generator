---
phase: 07-model-strategy-infrastructure
plan: 01
subsystem: models
requires:
  - "Phase 6 (v1.0 completion)"
provides:
  - "ModelId type for compile-time model validation"
  - "ModelStrategy interface for consistent model API"
  - "Model capabilities constants for UI constraints"
affects:
  - "07-02 (strategy implementations will implement ModelStrategy)"
  - "07-03 (factory will instantiate strategies)"
  - "11-01 (UI will consume capabilities constants)"
tech-stack:
  added: []
  patterns:
    - "Strategy Pattern foundation (interface + types)"
    - "Type-safe model abstraction via literal unions"
key-files:
  created:
    - "lib/models/types.ts"
  modified: []
decisions:
  - id: "model-id-literals"
    decision: "Use string literal union type for ModelId"
    rationale: "Provides compile-time validation and IDE autocomplete without enum overhead"
    alternatives: "TypeScript enum (rejected - unnecessary runtime code)"
  - id: "capabilities-constants"
    decision: "Export const objects for model capabilities instead of class instances"
    rationale: "Simple immutable data structures, tree-shakeable, easier to test"
    alternatives: "Class-based capabilities (rejected - over-engineering for data objects)"
  - id: "model-specific-params"
    decision: "Separate interfaces (NanoBananaParams, SeedreamParams) extending base"
    rationale: "Type safety for model-specific fields, enables discriminated unions in Zod schemas"
    alternatives: "Single params interface with optional fields (rejected - loses type safety)"
metrics:
  duration: "1.6 minutes"
  completed: "2026-01-26"
tags:
  - typescript
  - types
  - strategy-pattern
  - models
---

# Phase 7 Plan 01: Model Strategy Types Summary

**One-liner:** Foundational TypeScript types for multi-model abstraction: ModelId literals, ModelStrategy interface, capabilities constants

## What Was Built

Created `lib/models/types.ts` with the complete type foundation for the Model Strategy Pattern:

**Core Types (6 exports):**
- `ModelId` - String literal union type ('nano-banana-pro' | 'seedream-4.5-edit')
- `ModelCapabilities` - Interface describing model constraints and costs
- `ModelGenerationParams` - Base interface for common generation parameters
- `NanoBananaParams` - Nano-specific params (resolution: 1K/2K/4K, outputFormat: png/jpg)
- `SeedreamParams` - Seedream-specific params (quality: basic/high, imageSize presets)
- `ModelStrategy` - Core interface with createTask, pollTask, validateParams methods

**Constants & Helpers (5 exports):**
- `NANO_BANANA_CAPABILITIES` - 8 ref images, 11 aspect ratios, costs per resolution
- `SEEDREAM_CAPABILITIES` - 14 ref images, 9 aspect ratios, flat cost structure
- `ALL_MODELS` - Array for validation and iteration
- `DEFAULT_MODEL` - 'nano-banana-pro' for backward compatibility
- `isValidModelId()` - Type guard function

**File Stats:**
- 155 lines of code
- Comprehensive JSDoc comments on all types
- Zero runtime dependencies (pure types)
- TypeScript compiles without errors

## Technical Implementation

**Type Safety Approach:**
- String literal unions instead of enums (no runtime overhead)
- Discriminated union support via model-specific param interfaces
- Type guard for runtime validation with compile-time narrowing

**Strategy Pattern Foundation:**
- `ModelStrategy` interface defines contract all implementations must follow
- `capabilities` readonly property enforces immutability
- `createTask` returns provider taskId (string)
- `pollTask` returns result URL when complete
- `validateParams` throws on invalid input (fail-fast)

**Capabilities Design:**
- Const objects with `as const` satisfaction of interface
- Nested `costPerGeneration` maps resolution/quality → credit cost
- `supportedAspectRatios` arrays enable UI validation

## Commits

| Hash | Message |
|------|---------|
| 8aeea6e | feat(07-01): create model strategy types and interfaces |
| 7d6ca79 | feat(07-01): add model capabilities constants and type guard |

## Decisions Made

**1. ModelId as string literal union (not enum)**
- Provides compile-time safety + autocomplete
- Zero runtime code generation
- Easily extensible (add model = add literal)
- Type guard function handles runtime validation

**2. Separate param interfaces per model**
- Enables Zod discriminated unions in Phase 8
- TypeScript can narrow types based on modelId field
- Model-specific validation logic can use correct param type

**3. Capabilities as exported constants**
- Simple, immutable, tree-shakeable
- Easy to test (no instantiation needed)
- UI can import specific capabilities or iterate ALL_MODELS

## Next Phase Readiness

**Phase 7 Plan 02 (Strategy Implementations) can now:**
- Import ModelStrategy interface and implement it
- Use NANO_BANANA_CAPABILITIES / SEEDREAM_CAPABILITIES
- Extend NanoBananaParams / SeedreamParams for type safety

**Phase 11 (Model Selection UI) will:**
- Import ALL_MODELS to populate dropdown
- Use capabilities.maxReferenceImages for validation
- Display capabilities.costPerGeneration for cost estimates
- Use isValidModelId for route param validation

**No blockers identified.** All required types exist and compile correctly.

## Deviations from Plan

None - plan executed exactly as written.

## Validation

**Success Criteria Met:**
- ✅ lib/models/types.ts exists with 155 lines (exceeds min 60)
- ✅ All 6 types exported and compile without errors
- ✅ All 5 constants/helpers exported
- ✅ TypeScript IntelliSense shows correct types
- ✅ isValidModelId type guard returns correct boolean values
- ✅ No runtime dependencies

**TypeScript Compilation:**
```
npx tsc --noEmit
# No errors
```

**Type Guard Test:**
```
isValidModelId('nano-banana-pro') → true
isValidModelId('invalid') → false
```
