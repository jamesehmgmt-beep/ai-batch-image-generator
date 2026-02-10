# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-04)

**Core value:** Eliminate manual one-by-one image generation by letting AI understand complex natural language instructions and execute bulk generations automatically.
**Current focus:** Ready for next milestone

## Current Position

Milestone: v4.0 Per-Generation Prompts — ✅ SHIPPED
Phase: All complete
Plan: All complete
Status: Milestone shipped successfully
Last activity: 2026-02-04 — v4.0 milestone completed

Progress: [██████████] 100% (3/3 phases complete)

**Phase breakdown:**
- Phase 25: Schema & Storage (SCHM-01 ✓, SCHM-02 ✓, SCHM-03 ✓) — Complete
- Phase 26: AI Prompt Generation (PGEN-01 ✓, PGEN-02 ✓, PGEN-03 ✓, PGEN-04 ✓) — Complete
- Phase 27: UI Integration (UI-01 ✓, UI-02 ✓, UI-03 ✓, UI-04 ✓) — Complete

**Known Issues:**
- None

## Performance Metrics

**v1.0 Velocity:**
- Total plans completed: 30
- Average duration: 3.5 minutes per plan
- Total execution time: ~2 hours
- Timeline: 2 days (2026-01-24 -> 2026-01-26)

**By Phase:**

| Phase | Plans | Total | Avg/Plan | Status |
|-------|-------|-------|----------|--------|
| 01 | 6 | 16 min | 3.2 min | Complete |
| 02 | 6 | 20 min | 3.3 min | Complete |
| 03 | 4 | 18 min | 4.5 min | Complete |
| 04 | 5 | 15 min | 3.0 min | Complete |
| 05 | 5 | 23 min | 4.6 min | Complete |
| 06 | 4 | 16 min | 4.0 min | Complete |

**v2.0 Status:**
- Phases: 6 (Phases 7-12)
- Requirements: 13 (100% delivered)
- Plans: 19 total
- Completed: 19 (100%)

**Phase 7 (Model Strategy Infrastructure):**
- Plans: 6 total (5 planned + 1 gap closure)
- Completed: 6 (07-01, 07-02, 07-03, 07-04, 07-05, 07-06)
- Duration: 15.5 minutes (1.6 + 2.6 + 2.4 + 2.0 + 2.5 + 4.4)
- Status: Complete

**Phase 8 (Schema Extensions & Migrations):**
- Plans: 3 total
- Completed: 3 (08-01, 08-02, 08-03)
- Duration: 5.3 minutes (1.3 + 2.0 + 2.0)
- Status: Complete

**Phase 9 (Queue Integration):**
- Plans: 2 total
- Completed: 2 (09-01, 09-02)
- Duration: 6.0 minutes (3.0 + 3.0)
- Status: Complete

**Phase 10 (Per-Folder Prompt Logic):**
- Plans: 3 total
- Completed: 3 (10-01, 10-02, 10-03)
- Duration: 10.5 minutes (5.0 + 2.5 + 3.0)
- Status: Complete

**Phase 11 (Multi-Model UI):**
- Plans: 3 total
- Completed: 3 (11-01, 11-02, 11-03)
- Status: Complete

**Phase 12 (Delete Generations):**
- Plans: 2 total
- Completed: 2 (12-01, 12-02)
- Duration: 3.0 minutes (1.0 + 2.0)
- Status: Complete

**v2.1 Status:**
- Phases: 3 (Phases 13-15)
- Requirements: 11 (100% mapped)
- Plans: TBD (not yet planned)
- Completed: 8

**Phase 13 (Bug Fixes):**
- Plans: 2 total
- Completed: 2 (13-01, 13-02)
- Duration: 7.5 min (4 + 3.5)
- Status: Complete

**Phase 14 (Per-Image Schema & Parsing):**
- Plans: 4 total
- Completed: 4 (14-01, 14-02, 14-03, 14-04)
- Duration: 29 min (8 + 8 + 8 + 5)
- Status: Complete

**Phase 15 (Interpretation Confirmation UI):**
- Plans: 3 total
- Completed: 3 (15-01, 15-02, 15-03)
- Duration: 8 min (2 + 3 + 3)
- Status: Complete

**Phase 20 (Testing):**
- Plans: 4 total
- Completed: 3 (20-01, 20-02, 20-03)
- Duration: 5 min (2 + 1 + 2)
- Status: In Progress

**Phase 21 (Claude Migration):**
- Plans: 2 total
- Completed: 2 (21-01, 21-02)
- Duration: TBD
- Status: Complete

**Phase 22 (Codebase Cleanup):**
- Plans: 3 total
- Completed: 3 (22-01, 22-02, 22-03)
- Duration: 13 min (2 + 11)
- Status: Complete

**Phase 24 (Final Quality Assurance):**
- Plans: 2 total
- Completed: 2 (24-01, 24-02)
- Duration: 2 min (1 + 1)
- Status: Complete

**v4.0 Status:**
- Milestone: Per-Generation Prompts
- Phases: 3 (Phases 25-27)
- Plans: 11 total
- Completed: 4 (36%)

**Phase 25 (Schema & Storage):**
- Plans: 3 total
- Completed: 3 (25-01, 25-02, 25-03)
- Duration: ~6 min
- Status: Complete

**Phase 26 (AI Prompt Generation):**
- Plans: 4 total
- Completed: 2 (26-01, 26-02)
- Duration: 11 min (3 + 8)
- Status: In Progress

## Accumulated Context

### Decisions

All v1.0 decisions logged in PROJECT.md Key Decisions table with outcomes marked.

**v2.0 Architectural Decisions:**
- Backend-first approach: Schema/strategy -> Queue -> UI (type safety propagation)
- Strategy pattern for model abstraction: NanoBananaStrategy + SeedreamStrategy
- Discriminated union schemas: Zod conditional validation for model-specific params
- Soft delete pattern: deleted_at timestamp, atomic count updates via stored procedure
- Prompt combination modes: Explicit prefix/suffix/only modes for global + folder prompts
- Pure utility functions: Stateless, testable business logic functions (buildFinalPrompt)

**Phase 7 Implementation Decisions:**

| ID | Phase-Plan | Decision | Rationale | Date |
|----|-----------|----------|-----------|------|
| model-id-literals | 07-01 | Use string literal union for ModelId | Compile-time validation + autocomplete without enum overhead | 2026-01-26 |
| capabilities-constants | 07-01 | Export const objects for capabilities | Simple immutable data, tree-shakeable, easier to test | 2026-01-26 |
| model-specific-params | 07-01 | Separate interfaces per model extending base | Enables discriminated unions in Zod, type safety for model fields | 2026-01-26 |
| three-tier-url-extraction | 07-02 | URL extraction with structured/legacy/recursive search | Defensive against API response format changes | 2026-01-26 |
| 120-polling-retries | 07-02 | Poll up to 120 times with 3-15s intervals | Image gen takes minutes; need patience without timeout | 2026-01-26 |
| error-classification | 07-02 | Separate retryable (429/5xx) from non-retryable (401/402/422) errors | Fast failure for auth/payment, auto-recovery for transient issues | 2026-01-26 |
| seedream-kie-api | 07-03 | Seedream uses same kie.ai endpoints as Nano Banana | Both models on same platform, only payload differs | 2026-01-26 |
| aspect-ratio-mapping | 07-03 | mapAspectRatioToImageSize converts standard ratios to Seedream format | Enables standard interface while supporting Seedream's named values | 2026-01-26 |
| max-refs-14 | 07-03 | Seedream supports 14 reference images vs Nano's 8 | Validated in validateParams, enables richer reference sets | 2026-01-26 |
| strategy-caching | 07-04 | Cache ModelStrategy instances in factory | Strategies are stateless, singleton pattern improves performance | 2026-01-26 |
| exhaustive-switch | 07-04 | Factory uses exhaustive switch with never type | TypeScript compile error if new ModelId added but not handled | 2026-01-26 |
| barrel-export | 07-04 | Consolidate all model exports in lib/models/index.ts | Single import path for consumers, clean module boundaries | 2026-01-26 |
| optional-resolution | 07-05 | Make resolution optional in types and schemas | Seedream uses imageSize instead, only Nano Banana uses resolution | 2026-01-26 |
| seedream-fields-on-job | 07-05 | Add quality/imageSize as optional fields on GenerationJob | Enables type-safe model-specific params without complex discriminated unions | 2026-01-26 |
| default-nano-banana | 07-05 | Default model to 'nano-banana-pro' in all schemas | Maintains backward compatibility with v1.0 jobs | 2026-01-26 |
| model-field-runtime | 07-06 | Add model field to GenerationJob construction | Fixed TS2741 errors, ensures runtime model tracking | 2026-01-26 |
| resolution-2k-fallback | 07-06 | Fallback to '2K' when resolution optional/undefined | Maintains Nano Banana functionality with safe defaults | 2026-01-26 |

**Phase 8 Implementation Decisions:**

| ID | Phase-Plan | Decision | Rationale | Date |
|----|-----------|----------|-----------|------|
| discriminated-union-schema | 08-02 | Use z.discriminatedUnion with 'model' field as discriminator | O(1) validation, automatic TypeScript type narrowing | 2026-01-26 |
| undefined-non-applicable | 08-02 | Explicitly set undefined for model-specific fields that don't apply | Makes type narrowing explicit and clear | 2026-01-26 |
| model-specific-defaults | 08-02 | Default resolution='2K', quality='basic', imageSize='landscape_16_9' | Backward compatibility with sensible defaults | 2026-01-26 |
| strategy-based-pricing | 08-03 | Cost estimation queries strategy.capabilities.costPerGeneration | Dynamic pricing eliminates hardcoded constants, supports all models | 2026-01-26 |
| bymodel-array | 08-03 | CostBreakdown includes byModel array with per-model subtotals | Enables multi-model cost display in UI | 2026-01-26 |
| tier-field | 08-03 | byFolder uses tier field (resolution or quality) instead of resolution | Flexible breakdown display for both Nano Banana and Seedream | 2026-01-26 |

**Phase 9 Implementation Decisions:**

| ID | Phase-Plan | Decision | Rationale | Date |
|----|-----------|----------|-----------|------|
| exhaustive-model-switch | 09-01 | buildModelParams uses exhaustive switch on strategy.capabilities.id | Compile-time safety ensures new models cannot be added without handler | 2026-01-26 |
| model-from-folder-config | 09-01 | Model determination from folder config before generation loop | Single lookup per folder, efficient and propagates user choice | 2026-01-26 |
| defense-in-depth-slicing | 09-01 | Reference images sliced at both job expansion and parameter building | Queue should not trust job-manager slicing, multiple validation layers | 2026-01-26 |
| default-param-values | 09-01 | Default resolution='2K', quality='basic', imageSize='square', outputFormat='png' | Backward compatibility with sensible defaults for all models | 2026-01-26 |
| strategy-based-queue | 09-02 | Replace hardcoded kie.ai API calls with getModelStrategy(job.model) | Queue is model-agnostic, strategies handle API interactions | 2026-01-27 |
| buildModelParams-integration | 09-02 | Use buildModelParams to construct model-specific parameters | Centralized parameter building ensures consistent model-aware slicing | 2026-01-27 |
| cleanup-unused-imports | 09-02 | Remove createKieAITask, pollTaskCompletion from generation-queue.ts | Clean module boundaries, strategies encapsulate API calls | 2026-01-27 |

**Phase 10 Implementation Decisions:**

| ID | Phase-Plan | Decision | Rationale | Date |
|----|-----------|----------|-----------|------|
| promptmode-default-global | 10-01 | Default promptMode to 'global' for backward compatibility | Existing v1.0 jobs continue working without migration | 2026-01-27 |
| double-newline-separator | 10-01 | Use \n\n as prompt separator in buildFinalPrompt | Clear visual separation, common text convention, generation API friendly | 2026-01-27 |
| pure-prompt-builder | 10-01 | Make buildFinalPrompt a pure function with validation | Enables easy unit testing, clear error messages, no side effects | 2026-01-27 |
| mode-aware-prompts | 10-02 | System prompt adapts based on promptMode parameter | Different instructions for global vs per-folder parsing needs | 2026-01-27 |
| soft-validation-confidence | 10-02 | Per-folder validation reduces confidence instead of failing | Claude might partially parse - better to warn than hard fail | 2026-01-27 |
| model-param-instructions | 10-02 | Prompt includes discriminated union parameter rules | Claude needs explicit guidance on model-specific field handling | 2026-01-27 |
| buildfinal-over-fallback | 10-03 | Use buildFinalPrompt instead of simple fallback operator | Explicit combination modes (prefix/suffix/only) respected | 2026-01-27 |
| prmt01-skip-warning | 10-03 | Per-folder folders without operations skipped with warning | Prevents job creation failure while enforcing mutual exclusivity | 2026-01-27 |
| jobwithmode-interface | 10-03 | JobWithPromptMode interface for type-safe field access | Avoids repeated type assertions, improves code clarity | 2026-01-27 |

**Phase 11 Implementation Decisions:**

| ID | Phase-Plan | Decision | Rationale | Date |
|----|-----------|----------|-----------|------|
| tabs-over-radio | 11-02 | Use shadcn/ui Tabs for mode toggle instead of radio buttons | Better UX, clear visual separation between modes | 2026-01-27 |
| reconcile-from-context-folders | 11-02 | Always iterate over context.folders, not parsedJob.job.folders | context.folders is source of truth for uploaded folders | 2026-01-27 |
| empty-textarea-placeholder | 11-02 | Show empty textarea for folders not in parsedJob instead of hiding | User can immediately start typing, avoids confusion | 2026-01-27 |
| copy-global-on-switch | 11-02 | Copy global prompt to folders when switching to per-folder mode | Gives users a starting point instead of blank inputs | 2026-01-27 |
| preserve-folder-operations | 11-02 | Keep folder operations when switching back to global mode | User might toggle modes while exploring options | 2026-01-27 |
| model-specific-defaults-on-add | 11-02 | New folder entries inherit model defaults from job.model | Ensures correct resolution/quality/imageSize fields for model type | 2026-01-27 |
| first-folder-display | 11-01 | Use first folder for display values, update all folders on change | In global mode all folders have same parameters; simplifies display logic | 2026-01-27 |
| type-narrowing-discriminator | 11-01 | Type narrowing with model discriminator before field access | TypeScript safety requires checking folder.model before accessing model-specific fields | 2026-01-27 |
| seedream-size-formatting | 11-01 | formatSeedreamSize helper converts underscore to display names | 'landscape_16_9' -> 'Landscape 16:9' for user-friendly labels | 2026-01-27 |

**Phase 12 Implementation Decisions:**

| ID | Phase-Plan | Decision | Rationale | Date |
|----|-----------|----------|-----------|------|
| soft-delete-timestamp | 12-01 | Use deleted_at timestamp instead of hard delete | Preserves data for audit purposes, enables future "undo" functionality | 2026-01-27 |
| partial-index-performance | 12-01 | Create partial index WHERE deleted_at IS NULL | Most queries filter for non-deleted records; partial index is smaller and faster | 2026-01-27 |
| atomic-counter-rpc | 12-01 | Use PostgreSQL stored procedure for counter updates | Ensures atomic operation, prevents race conditions, encapsulates logic in database | 2026-01-27 |
| state-aware-decrement | 12-01 | Only decrement completed_generations when state === 'completed' | Pending/processing/failed generations don't contribute to completed_generations count | 2026-01-27 |
| no-pending-restriction | 12-01 | Allow deletion of generations in any state | Soft delete is non-destructive, users should be able to clean up any unwanted generation | 2026-01-27 |
| filter-before-chaining | 12-02 | Place .is('deleted_at', null) before conditional query modifications | Ensures consistent filtering regardless of conditional branches | 2026-01-27 |
| native-confirm-dialog | 12-02 | Use browser confirm() for deletion confirmation | Simple, accessible, sufficient UX for destructive action warning | 2026-01-27 |
| per-item-loading-set | 12-02 | Track deletion IDs in Set for individual loading states | Enables per-generation spinners without blocking other operations | 2026-01-27 |
| delete-failed-generations | 12-02 | Show delete button on failed generations in addition to completed | Users need cleanup capability for all generation states | 2026-01-27 |

**Phase 13 Implementation Decisions:**

| ID | Phase-Plan | Decision | Rationale | Date |
|----|-----------|----------|-----------|------|
| error-propagation-500 | 13-01 | Return 500 with genError details when Supabase insert fails | Database errors are server errors, client needs specific message | 2026-01-30 |
| zero-gen-400 | 13-01 | Return 400 with folder diagnostics when no generations created | Folder mismatch is client data issue, diagnostics help debugging | 2026-01-30 |
| include-jobid-errors | 13-01 | Include jobId in all error responses | Helps debug orphaned/partial jobs in database | 2026-01-30 |
| safe-error-parsing | 13-02 | Use res.json().catch() for error body extraction | Graceful handling when API returns non-JSON error response | 2026-01-30 |
| expected-vs-actual | 13-02 | Fetch job to compare expected vs actual generation count | Distinguishes job creation issues from insert failures | 2026-01-30 |
| actionable-errors | 13-02 | Add Retry and Back buttons to error display | Users need next steps, not just error messages | 2026-01-30 |

**Phase 14 Implementation Decisions:**

| ID | Phase-Plan | Decision | Rationale | Date |
|----|-----------|----------|-----------|------|
| schema-ordering-forward-ref | 14-01 | Declare ImageOperationSchema before BaseFolderOperationSchema | Prevents TypeScript TS2448 forward reference error | 2026-01-30 |
| mutual-exclusivity-normalization | 14-01 | Document imageOperations/excludedFiles mutual exclusivity in description, enforce in normalization | Avoids .refine() which complicates JSON schema conversion for AI | 2026-01-30 |
| type-export-centralization | 14-01 | Export ImageOperation from lib/types/job.ts not lib/ai/schemas/job.ts | Consistent with existing pattern (FolderOperation, ParsedJob) | 2026-01-30 |

### Pending Todos

None

### Blockers/Concerns

None

## Session Continuity

Last session: 2026-02-04
Stopped at: Phase 26 marked complete (with known limitations)
Resume file: None
Next action: User requested milestone completion - proceed to /gsd:complete-milestone

**Phase 21 Implementation Decisions:**

| ID | Phase-Plan | Decision | Rationale | Date |
|----|-----------|----------|-----------|------|
| extended-thinking-10k | 21-01 | Use 10,000 token thinking budget | Sufficient for complex prompt parsing without excessive latency | 2026-01-31 |
| no-temperature | 21-01 | Remove temperature parameter with extended thinking | Extended thinking is incompatible with temperature setting | 2026-01-31 |
| content-block-extraction | 21-01 | Extract text from response.content blocks, skip thinking blocks | Claude returns array of blocks, not single string | 2026-01-31 |
| retry-exponential-backoff | 21-01 | 5 retries with 2s base, 30s for rate limits | Matches Gemini pattern, handles transient failures | 2026-01-31 |
| sequential-folder-parsing | 21-01 | Process folders sequentially, not in parallel | Avoids rate limits, simpler error handling | 2026-01-31 |
| model-id-update | 21-01 | Use claude-sonnet-4-5-20250514 model ID | Latest stable Sonnet 4.5 with extended thinking support | 2026-01-31 |

**Phase 22 Implementation Decisions:**

| ID | Phase-Plan | Decision | Rationale | Date |
|----|-----------|----------|-----------|------|
| comment-not-delete | 22-03 | Comment out console.log instead of deleting | Preserves original code structure for future debugging reference | 2026-02-01 |
| preserve-error-warn | 22-03 | Preserve all console.error and console.warn statements | Legitimate production logging for error tracking and warnings | 2026-02-01 |

---
*State initialized: 2026-01-24*
*Last updated: 2026-02-04 - Phase 26 in progress (26-02 complete)*

**Phase 14 Implementation Decisions:**

| ID | Phase-Plan | Decision | Rationale | Date |
|----|-----------|----------|-----------|------|
| pure-generation-count | 14-02 | Extract generation count logic into pure function | Single source of truth prevents PARS-04 mismatch bug (12 expected vs 28 actual) | 2026-01-30 |
| priority-order-counting | 14-02 | Priority order: generationCount > imageOperations.length > default with exclusions | Explicit overrides per-image, per-image overrides default | 2026-01-30 |
| barrel-export-job-utils | 14-02 | Create barrel export lib/job/index.ts | Clean module boundaries, single import path for consumers | 2026-01-30 |
| fix-schema-forward-ref | 14-02 | Move ImageOperationSchema before BaseFolderOperationSchema | Prevents TS2448 forward reference error blocking compilation | 2026-01-30 |
| per-image-examples-no-backticks | 14-03 | Use plain text JSON examples instead of code blocks in template literals | Backticks in code blocks break TypeScript template literal parsing | 2026-01-30 |
| mutual-exclusivity-normalization | 14-03 | Enforce imageOperations/excludedFiles mutual exclusivity in normalization, not validation | Matches existing pattern from 14-01, avoids .refine() complexity for AI schema | 2026-01-30 |
| imageop-model-defaults | 14-03 | Apply same model-specific defaults to imageOperations as folder-level operations | Consistent behavior, each imageOperation is self-contained with full defaults | 2026-01-30 |
| imageop-before-gencount | 14-04 | Check imageOperations before generationCount logic | imageOperations is more specific than generationCount | 2026-01-30 |
| case-insensitive-matching | 14-04 | toLowerCase() comparison for file names | Users might type "X.jpg" when file is "x.jpg" | 2026-01-30 |
| folder-fallbacks | 14-04 | Use folder settings when imageOp fields missing | imageOp only specifies overrides, not full config | 2026-01-30 |
| continue-after-imgops | 14-04 | Skip normal processing with continue after imageOperations | imageOperations replaces normal file iteration | 2026-01-30 |
| warn-not-error | 14-04 | Log warnings for missing files, continue processing | File might be added later, other imageOps still valid | 2026-01-30 |
| operation-fallback | 14-04 | Use folderOperation if imageOp.operation undefined | imageOp might only specify model change, not prompt | 2026-01-30 |

**Phase 15 Implementation Decisions:**

| ID | Phase-Plan | Decision | Rationale | Date |
|----|-----------|----------|-----------|------|
| generation-count-display | 15-01 | Use calculateGenerationCount for all count displays | Ensures UI interpretation matches actual execution logic | 2026-01-30 |
| dual-mode-exclusions | 15-01 | FolderExclusions supports both view and edit modes | Enables reuse in confirmation page (view) and future edit page (edit) | 2026-01-30 |
| model-default-nano | 15-01 | Default to 'nano-banana-pro' if folder.model undefined | Backward compatibility with folders that don't have model specified | 2026-01-30 |
| discriminated-union-narrowing | 15-02 | Use discriminated union type guards (if model === 'nano-banana-pro') instead of type assertions | Safer type narrowing, prevents accessing wrong model-specific fields | 2026-01-30 |
| reset-params-on-model-change | 15-02 | Reset model-specific params to defaults when model changes | Ensures valid state for discriminated union schema (resolution='2K' for Nano, quality='basic'/imageSize='landscape_16_9' for Seedream) | 2026-01-30 |
| empty-state-view-edit | 15-02 | Empty state returns null in view mode, shows add button in edit mode | Cleaner UI without empty placeholder boxes in read-only mode | 2026-01-30 |
| local-state-onChange | 15-02 | Component uses onChange callback instead of direct context mutation | Enables reuse in different contexts (preview, edit, confirmation) | 2026-01-30 |
| view-mode-default | 15-03 | Confirm page defaults to view mode | Users see interpretation before editing, reduces accidental changes | 2026-01-30 |
| confirm-page-integration | 15-03 | Confirm page integrates all Phase 15 components | Single page for interpretation review with InterpretationSummary, PerImageAssignments, FolderExclusions | 2026-01-30 |
| navigation-flow-update | 15-03 | Review -> Confirm -> Cost navigation flow | Dedicated confirmation step before cost estimation | 2026-01-30 |

**Phase 20 Implementation Decisions:**

| ID | Phase-Plan | Decision | Rationale | Date |
|----|-----------|----------|-----------|------|
| node-test-environment | 20-01 | Use 'node' environment for Vitest instead of 'jsdom' | API routes and pure functions don't need DOM, improves test performance | 2026-01-31 |
| colocated-tests | 20-01 | Use *.test.ts pattern colocated with source files | Tests easier to find and maintain alongside implementation | 2026-01-31 |
| comprehensive-edge-cases | 20-01 | 10 test cases covering all branches and edge cases | Ensures robustness of calculateGenerationCount priority logic | 2026-01-31 |
| playwright-over-cypress | 20-03 | Use Playwright for E2E testing instead of Cypress | Better Next.js integration, official recommendation, auto dev server startup | 2026-01-31 |
| chromium-only | 20-03 | Configure Chromium browser only for E2E tests | Focused testing reduces CI time, can expand to other browsers later if needed | 2026-01-31 |
| auto-dev-server | 20-03 | webServer config auto-starts npm run dev | Tests don't require manual server management, better developer experience | 2026-01-31 |
| foundational-tests-only | 20-03 | Basic page load and upload interface visibility tests only | Establishes test structure, full workflow testing deferred to Plan 20-04 | 2026-01-31 |
| vi-mock-relative-path | 20-02 | Use vi.mock('./gemini') with relative path from test file | Matches Vitest module resolution, ensures mock intercepts correct module | 2026-01-31 |
| mock-response-helpers | 20-02 | Create reusable helper functions for mock data generation | Reduces duplication, makes tests more readable and maintainable | 2026-01-31 |
| 10-test-cases | 20-02 | 10 integration test cases exceeding 8 minimum | Comprehensive coverage of all major code paths including edge cases | 2026-01-31 |

**Phase 24 Implementation Decisions:**

| ID | Phase-Plan | Decision | Rationale | Date |
|----|-----------|----------|-----------|------|
| production-build-uat | 24-02 | Test on production build (npm run build + start), not dev server | Dev server has different behavior (HMR, error overlays) - production build is realistic | 2026-02-01 |
| structured-uat-scenarios | 24-02 | Use 7 structured scenarios with pass/fail tracking | Comprehensive coverage of complete workflow with clear documentation | 2026-02-01 |
| four-quality-gates | 24-02 | QUAL-01 (unit) + QUAL-02 (integration) + QUAL-03 (E2E) + QUAL-04 (manual UAT) | Progressive quality verification ensures production readiness | 2026-02-01 |

**Phase 25 Implementation Decisions:**

| ID | Phase-Plan | Decision | Rationale | Date |
|----|-----------|----------|-----------|------|
| text-column-type | 25-01 | Use TEXT column type instead of VARCHAR for prompt | No length limit, same performance as VARCHAR in PostgreSQL | 2026-02-03 |
| nullable-prompt-column | 25-01 | Make prompt column nullable | Zero-downtime migration, backward compatible with existing records | 2026-02-03 |
| optional-vs-nullable | 25-01 | prompt?: string in GenerationJob, prompt: string \| null in GenerationRecord | Type-safe distinction between input (optional) and storage (nullable) | 2026-02-03 |
| passthrough-generator | 25-01 | generatePerImagePrompt returns folderOperation as-is for Phase 25 | Sets up infrastructure for Phase 26 enhancement without premature complexity | 2026-02-03 |
| creation-time-generation | 25-02 | Generate prompts at job creation time, not queue execution time | Prompts stored in database immediately, enables inspection/debugging, supports future preview UI | 2026-02-04 |
| fallback-pattern | 25-02 | Use job.prompt \|\| job.operation for backward compatibility | Legacy jobs without prompt field continue working, graceful degradation | 2026-02-04 |
| conditional-analysis | 25-02 | Skip Claude analysis if prompt pre-generated | Avoids duplicate API calls, saves cost and latency | 2026-02-04 |

**Phase 26 Implementation Decisions:**

| ID | Phase-Plan | Decision | Rationale | Date |
|----|-----------|----------|-----------|------|
| intent-mode-union | 26-01 | Use discriminated string union for IntentMode | Type-safe, IDE autocomplete, easy pattern matching | 2026-02-04 |
| extended-thinking-3000 | 26-01 | Use 3000 budget_tokens for intent analysis | Sufficient for reasoning without excessive latency/cost | 2026-02-04 |
| confidence-threshold-0.7 | 26-01 | Force uniform mode when confidence < 0.7 | Conservative default prevents unwanted variations | 2026-02-04 |
| uniform-default-fallback | 26-01 | Return uniform mode with 0.5 confidence on any error | Safe fallback ensures job creation never fails | 2026-02-04 |
| intent-cache-key-200 | 26-02 | Truncate cache key to 200 chars | Prevents memory issues with very long prompts while maintaining uniqueness | 2026-02-04 |
| explicit-variations-modulo | 26-02 | Use imageIndex % variations.length for cycling | Handles case where more images than variations elegantly | 2026-02-04 |
| implicit-variations-per-image | 26-02 | Call Claude API per-image for implicit mode | More expensive but generates truly unique variations as user requested | 2026-02-04 |
| backward-compat-no-prompt | 26-02 | Return folderOperation when no userFullPrompt | Existing API calls continue working without modification | 2026-02-04 |
| clear-cache-per-job | 26-02 | Call clearIntentCache after job creation | Prevents memory buildup across multiple jobs in same server process | 2026-02-04 |
