# Project Research Summary

**Project:** BulkImageGen v2.0
**Domain:** Bulk AI Image Generation Enhancement
**Researched:** 2026-01-26
**Confidence:** HIGH

## Executive Summary

BulkImageGen v2.0 adds multi-model support (Nano Banana Pro + Seedream 4.5 Edit), per-folder prompt configuration, and individual generation deletion to an existing bulk image generation system. The research reveals this is a **schema evolution problem**, not a new product build. The existing Next.js + TypeScript + Zod + Supabase stack provides all necessary primitives — no new external dependencies needed. The recommended approach uses the Strategy pattern for model abstraction, discriminated union schemas for model-specific parameters, and a prompt builder utility for hierarchical prompt combination.

The key technical risk is **model parameter incompatibility breaking existing jobs**. Different models support different aspect ratios (11 vs 8), resolutions (3 levels vs 2 quality tiers), and reference image counts (8 vs 14). This requires three-tier validation (parse-time, save-time, execution-time), database migration with backfills, and model-aware cost estimation. The critical architectural decision is **prompt combination semantics**: when users provide both global and per-folder prompts, the system must clarify whether folder prompts replace or combine with global prompts through explicit `promptMode` configuration.

Implementation should follow backend-first ordering: database migrations and model abstraction infrastructure first, then schema extensions, then queue integration, then UI. This ensures type safety propagates cleanly and existing v1.0 Nano Banana Pro jobs continue working throughout the transition. Parallel work opportunities exist between schema evolution and per-folder prompt logic, and deletion features can be built independently.

## Key Findings

### Recommended Stack

The existing stack handles all v2.0 requirements without adding external dependencies. The Strategy pattern using native TypeScript interfaces provides sufficient abstraction for 2 models without over-engineering. Zod's discriminated unions offer runtime validation of model-specific parameters. React Hook Form's `watch()` enables conditional UI updates. Supabase JSONB columns provide flexible storage for varying model parameter shapes.

**Core technologies (no changes):**
- **TypeScript interfaces** — Strategy pattern for model abstraction (NanoBananaStrategy, SeedreamStrategy)
- **Zod discriminated unions** — Runtime validation of model-specific parameters with conditional refinement
- **React Hook Form watch()** — Conditional form field rendering based on selected model
- **Supabase JSONB** — Flexible storage for model_params (handles different shapes per model)
- **Postgres stored procedures** — Atomic count updates when deleting generations

**Anti-recommendation:** Do NOT add Vercel AI SDK, ModelFusion, or LangChain.js. These are built for LLM orchestration (streaming, tool calling, agents), not simple image generation HTTP APIs. Our use case (2 models with fixed parameters) is well-served by a 200-line abstraction layer.

### Expected Features

**Must have (table stakes):**
- Model selector visible on main screen — industry standard (Freepik, Renderforest show model toggle prominently)
- UI updates when model changes — different capabilities require dynamic form validation
- Per-folder prompt as alternative to global — batch tools (Stable Diffusion WebUI, ComfyUI) offer folder-level control
- Delete button on individual results — users expect per-item deletion like ChatGPT galleries
- Batch selection for deletion — users expect checkbox selection + bulk action
- Clear indicator which prompt mode active — visual toggle to avoid confusion

**Should have (competitive differentiators):**
- Cost comparison before execution — show estimated cost difference between models
- Smart model recommendation — AI suggests best model based on prompt content ("12 refs → use Seedream")
- Per-folder model selection — extend per-folder prompts to include model choice per folder
- Undo delete — soft delete with restoration period

**Defer (v2+):**
- Model comparison mode — generate same image with both models side-by-side (complex, requires dual execution)
- AI prompt adaptation per model — auto-adjust prompts to match model constraints (advanced AI feature)
- Per-image prompts — too granular for bulk tool, defeats automation purpose

**Anti-features (explicitly avoid):**
- Model auto-switching mid-job — creates unpredictable results, users lose control
- Global AND per-folder prompts simultaneously with unclear merge — force exclusive choice or explicit combination mode
- Delete without confirmation on large batches — accidental deletion too easy
- Permanent immediate deletion — no recovery from mistakes

### Architecture Approach

The architecture follows an **extension pattern** rather than rewrite. The Strategy pattern isolates model-specific API logic (createTask, pollCompletion, validateParams) behind a ModelStrategy interface, keeping the existing queue infrastructure intact. Schema extensions add `model` field to FolderOperation with conditional validation for model-specific parameters (resolution for Nano, quality for Seedream). A prompt builder utility centralizes global + folder prompt combination logic with three modes (prefix, suffix, only). Database migrations add `model` and `model_params` columns with backward-compatible defaults.

**Major components:**
1. **Model Strategy Layer** — NanoBananaStrategy and SeedreamStrategy implement ModelStrategy interface, factory function routes to correct implementation
2. **Schema Layer Extensions** — Zod discriminated unions validate model-specific params, refine() ensures required params present per model
3. **Prompt Builder Utility** — buildFinalPrompt() combines global and folder prompts with configurable mode (prefix/suffix/only)
4. **Database Schema Additions** — model column with default 'nano-banana-pro', quality column for Seedream, model_params JSONB for flexibility
5. **Generation Deletion** — DELETE endpoint with atomic count updates via Postgres stored procedure, soft delete pattern recommended

**Data flow:** User selects model in UI → Schema captures per-folder → Strategy factory routes to model-specific client → Queue executes with model-aware parameters → Database stores model + results → UI shows model badge and allows deletion.

### Critical Pitfalls

1. **Model Parameter Incompatibility Breaking Existing Jobs** — Different models support different aspect ratios and parameters. Solution: Three-tier validation (parse, save, execute) + model-specific validators + migration backfill of default model to existing records.

2. **Cascading Deletes Destroying Job History** — ON DELETE CASCADE from jobs → generations means user trying to delete one generation could accidentally delete entire job. Solution: Implement soft delete pattern with deleted_at timestamp + confirmation dialog + protect deletion of last generation in job.

3. **Per-Folder Prompt Overriding Global Prompt Ambiguity** — Current code uses fallback logic (folder OR global) but users expect combination (folder AND global). Solution: Add promptMode enum ('replace', 'append', 'prepend') + update AI parser to ask clarifying question + update execution to combine based on mode.

4. **Hardcoded Model Assumptions in Cost Estimation** — Cost calculation hardcoded for Nano Banana Pro pricing, can't handle Seedream or price changes. Solution: Create model_pricing database table with effective_date column + refactor calculateCostEstimate to query by model + add model field to cost breakdown.

5. **AI Parser Schema Drift Between Parse and Execution** — Fallback schema in parser might drift out of sync with Zod schema when adding model field. Solution: Remove fallback entirely (fail fast) + add test suite for zod-to-json-schema conversion + add schema_version tracking to jobs.

## Implications for Roadmap

Based on research, suggested 6-phase structure with backend-first approach:

### Phase 1: Model Strategy Infrastructure
**Rationale:** All multi-model features depend on this abstraction layer. Build foundation first to avoid refactoring later.

**Delivers:** ModelStrategy interface, NanoBananaStrategy (extracted from existing), SeedreamStrategy (new), factory function getModelStrategy()

**Addresses:** Multi-model switching core requirement

**Avoids:** Pitfall #1 (hardcoded model assumptions), sets up for clean parameter validation

**Research needed:** STANDARD PATTERNS — Strategy pattern is well-documented, no research needed

### Phase 2: Schema Extensions
**Rationale:** Schema changes flow through to all other components. Establish schema before building UI or queue integration.

**Delivers:** model field in FolderOperationSchema, quality field for Seedream, promptMode enum for combination logic, database migrations with backfills

**Addresses:** Multi-model parameters, per-folder prompt foundation

**Avoids:** Pitfall #1 (parameter incompatibility), Pitfall #5 (schema drift), Pitfall #9 (migration of existing jobs)

**Research needed:** NONE — Zod patterns established in v1.0, migration is straightforward

### Phase 3: Queue Integration
**Rationale:** Connects schema to strategy infrastructure, enables end-to-end multi-model execution.

**Delivers:** GenerationQueue using getModelStrategy(), model-aware reference image slicing, cost estimation updates

**Addresses:** Multi-model execution, cost estimation per model

**Avoids:** Pitfall #4 (hardcoded cost assumptions), Pitfall #6 (reference image count mismatch)

**Research needed:** NONE — Integration of existing patterns

### Phase 4: Per-Folder Prompt Logic
**Rationale:** Independent of model strategy, can be built in parallel with queue integration. Depends only on schema extensions.

**Delivers:** buildFinalPrompt() utility, updated job-manager to combine prompts, updated AI parser to understand global + folder

**Addresses:** Per-folder prompts with global combination

**Avoids:** Pitfall #3 (prompt overriding ambiguity), Pitfall #7 (prompt length validation)

**Research needed:** NONE — Prompt combination is pure logic, patterns clear from requirements

### Phase 5: UI - Model Selection & Prompts
**Rationale:** Depends on schema and queue integration. UI comes after backend to ensure type safety and working execution.

**Delivers:** ModelSelector component, conditional form fields per model, prompt hierarchy display, cost breakdown by model

**Addresses:** Model selector UI, per-folder prompt UI, cost comparison

**Avoids:** Pitfall #10 (model toggle state not persisted), Pitfall #11 (unfriendly model names)

**Research needed:** NONE — React Hook Form patterns established, conditional rendering straightforward

### Phase 6: Delete Individual Generations
**Rationale:** Independent feature, can be built anytime. Not blocking for multi-model or per-folder prompts.

**Delivers:** DELETE /api/generation/[id] endpoint, decrement_job_counts() stored procedure, delete button UI, confirmation dialog

**Addresses:** Delete individual results, batch deletion

**Avoids:** Pitfall #2 (cascading deletes), ensures atomic count updates

**Research needed:** NONE — Standard CRUD operation with database function

### Phase Ordering Rationale

- **Backend-first approach** ensures type safety propagates from schema → queue → UI. Prevents UI building on unstable foundations.
- **Phase 1 + Phase 2 can be parallel** — Model strategy and schema extensions have no dependencies on each other.
- **Phase 4 can be parallel with Phase 3** — Per-folder prompt logic is independent of queue integration after schema exists.
- **Phase 6 is fully independent** — Can be built anytime, even post-launch.
- **Critical path is 1 → 3 → 5** for multi-model. Phase 2 and 4 extend the system but don't block basic multi-model execution.

### Research Flags

**Phases with standard patterns (skip research-phase):**
- **Phase 1:** Strategy pattern is textbook GoF pattern, TypeScript implementation well-documented
- **Phase 2:** Zod schema extensions are straightforward, Postgres migrations have established patterns
- **Phase 3:** Integration layer combines existing patterns, no novel architecture
- **Phase 4:** Prompt combination is pure business logic, no external integration
- **Phase 5:** React Hook Form conditional rendering is documented pattern
- **Phase 6:** CRUD operations are standard, soft delete pattern widely used

**Phases potentially needing research during planning:**
- **NONE** — All phases use well-established patterns. v2.0 is an evolution of existing system, not greenfield.

**Research needed BEFORE starting implementation:**
- Seedream 4.5 Edit official pricing (currently estimated based on quality tiers)
- Seedream output format support (PNG vs JPG — needs API docs verification)
- Seedream rate limits (assumed 20 concurrent like Nano Banana, needs verification)
- Seedream error response codes (for retry classification logic)

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Existing stack confirmed sufficient through codebase analysis. No external dependencies needed. Strategy pattern well-established. |
| Features | MEDIUM | UI patterns verified via WebSearch (Freepik, ComfyUI, gallery tools). Table stakes clear, differentiators may need user validation. |
| Architecture | HIGH | Strategy pattern appropriate for 2-model use case. Codebase inspection confirms integration points. Database migration path clear. |
| Pitfalls | MEDIUM | Cascade delete and schema drift patterns verified via docs. Model incompatibility inferred from API specs. Cost estimation risk confirmed in code. |

**Overall confidence:** HIGH

The technical approach is sound and well-supported by existing patterns. The main uncertainties are around feature prioritization (what users actually value) and Seedream API specifics (pricing, formats, limits). The architecture is proven (Strategy pattern + Zod + schema evolution), and the existing codebase provides clear integration points.

### Gaps to Address

Research identified these gaps requiring validation during implementation:

- **Seedream 4.5 Edit pricing** — Currently estimated at $0.18/basic, $0.32/high based on comparison to Nano Banana. **Action:** Verify with kie.ai official docs or support before Phase 2 (cost estimation).

- **Seedream output format support** — Unknown if Seedream API accepts outputFormat parameter like Nano Banana. **Action:** Test API during Phase 1 (strategy implementation), may need to drop format selection for Seedream.

- **Seedream rate limits** — Assumed 20 concurrent like Nano Banana, not verified. **Action:** Confirm with kie.ai docs before Phase 3 (queue integration), may need separate concurrency configs per model.

- **Seedream error classification** — Need actual error response format to implement retry logic. **Action:** Capture error responses during Phase 1 testing, build classification map similar to Nano Banana.

- **User preference on prompt combination** — Research suggests explicit mode selection (prefix/suffix/only), but user testing needed to validate. **Action:** Consider A/B testing prompt combination UI in Phase 5, may need to iterate based on feedback.

- **Soft delete retention period** — Pattern suggests 30-day trash retention, but may be overkill for single-user app. **Action:** Decide in Phase 6 whether to implement full trash view or simple confirmation-only deletion.

## Sources

### Primary (HIGH confidence)

**Stack & Architecture:**
- [Strategy Pattern in TypeScript (refactoring.guru)](https://refactoring.guru/design-patterns/strategy/typescript/example) — Strategy pattern implementation
- [Zod Schema Refinements](https://zod.dev/?id=refine) — Conditional validation approach
- [React Hook Form Advanced Usage](https://react-hook-form.com/advanced-usage) — Dynamic field registration
- Codebase inspection of BulkImageGen v1.0 — Integration points verified

**Database Patterns:**
- [Cascade Deletes | Supabase Docs](https://supabase.com/docs/guides/database/postgres/cascade-deletes) — CASCADE behavior
- [Postgres ON DELETE CASCADE Guide](https://www.dbvis.com/thetable/postgres-on-delete-cascade-a-guide/) — Best practices
- [Rails Data Migration Best Practices 2026](https://www.railscarma.com/blog/rails-data-migration-best-practices-guide/) — Migration patterns

### Secondary (MEDIUM confidence)

**Feature Landscape:**
- [Best Open-Source Image Generation Models 2026](https://www.bentoml.com/blog/a-guide-to-open-source-image-generation-models) — Multi-model patterns
- [ComfyUI Batch Processing Guide 2025](https://apatero.com/blog/automate-images-videos-comfyui-workflow-guide-2025) — Per-folder prompt patterns
- [WordPress Media Gallery Bulk Actions](https://www.infophilic.com/delete-multiple-images-wordpress-media-gallery/) — Deletion UX patterns
- [UX Trends 2026: Adaptive Design](https://bitskingdom.com/blog/ux-trends-2026-ai-zero-ui-adaptive-design/) — Dynamic form validation

**Pitfalls:**
- [LLM Abstractions Guide - Two Sigma](https://www.twosigma.com/articles/a-guide-to-large-language-model-abstractions/) — Multi-model abstraction anti-patterns
- [Schema Migration Challenges | Metisdata](https://www.metisdata.io/blog/common-challenges-in-schema-migration-how-to-overcome-them) — Migration pitfalls
- [AI Image Generation Mistakes | God of Prompt](https://www.godofprompt.ai/blog/10-ai-image-generation-mistakes-99percent-of-people-make-and-how-to-fix-them) — Common errors

### Tertiary (LOW confidence - needs validation)

- **Seedream pricing estimates** — Inferred from comparison to Nano Banana quality tiers, not verified
- **Seedream output format support** — Assumed based on common API patterns, needs testing
- **Model comparison mode complexity** — Estimated as "complex" based on architecture analysis, may be simpler

---
*Research completed: 2026-01-26*
*Ready for roadmap: yes*
