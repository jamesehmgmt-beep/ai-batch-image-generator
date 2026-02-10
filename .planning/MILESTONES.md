# Project Milestones: BulkImageGen

## v4.0 Per-Generation Prompts (Shipped: 2026-02-04)

**Delivered:** AI-generated unique prompts for each individual generation with intent analysis, three generation modes (uniform/explicit/implicit variations), and prompt editing in preview UI.

**Phases completed:** 25-27 (4+ plans)

**Key accomplishments:**

- Database schema with per-generation prompt storage (TEXT column, nullable for backward compatibility)
- Intent analysis using Claude Sonnet 4.5 with extended thinking (3000 token budget)
- Three prompt modes: uniform (same for all), explicit-variations (user-specified like "front, back, side"), implicit-variations (AI decides)
- Pre-generation prompt creation at job creation time for database inspection and debugging
- Queue execution uses generation-specific prompts with fallback to operation field
- Preview UI displays individual prompts with editing capability before execution

**Stats:**

- 4+ plans across 3 phases
- 11 requirements delivered (100%)
- 2 days execution (2026-02-03 → 2026-02-04)
- ~20,000 lines of TypeScript
- 21 files modified, +3,862 insertions

**Git range:** `feat(25-01)` → current

**Requirements delivered:**
- SCHM-01 to SCHM-03: Schema & storage
- PGEN-01 to PGEN-04: AI prompt generation
- UI-01 to UI-04: Preview UI integration

**What's next:** TBD

---

## v3.1 Stability & Claude Migration (Shipped: 2026-02-03)

**Delivered:** Claude Sonnet 4.5 migration replacing unstable Gemini, codebase cleanup removing dead code, and comprehensive E2E debugging ensuring production readiness.

**Phases completed:** 21-24 (7+ plans)

**Key accomplishments:**

- Claude Sonnet 4.5 integration with extended thinking for AI parsing
- Removed Gemini SDK and all unused Gemini files
- Cleaned up excessive console.log debug statements
- Full E2E workflow debugging and verification
- Production build UAT with structured test scenarios

**Stats:**

- 7+ plans across 4 phases
- 11 requirements delivered (100%)
- 3 days execution (2026-01-31 → 2026-02-03)
- ~78,000 lines of TypeScript

**Git range:** `feat(21-01)` → `chore: finalize v3.1 milestone`

**Requirements delivered:**
- CLDE-01 to CLDE-04: Claude migration
- CLEN-01 to CLEN-03: Codebase cleanup
- QUAL-01 to QUAL-04: Quality assurance

---

## v3.0 Gemini Migration & Bug Fixes (Shipped: 2026-01-31)

**Delivered:** Testing infrastructure (Vitest + Playwright), folder ordering fix, Gemini AI integration, and generation count bug fixes.

**Phases completed:** 16-20 (8 plans total)

**Key accomplishments:**

- Vitest testing infrastructure with 58 unit/integration tests
- Playwright E2E testing with 3 foundational tests
- Folder ordering preserved throughout upload flow
- Gemini 2.0 Flash integration for AI parsing
- Generation count accuracy fixed (excluded files properly filtered)
- Per-folder sequential API calls for parsing

**Stats:**

- 8 plans across 5 phases
- 12 requirements delivered (100%)
- 2 days execution (2026-01-30 → 2026-01-31)
- 45,106 lines of TypeScript

**Git range:** `feat(16-01)` → `docs(20-04)`

**Requirements delivered:**
- ORDR-01, ORDR-02: Folder ordering
- GEMI-01 to GEMI-05: Gemini integration
- BUGF-03, BUGF-04: Bug fixes
- TEST-01 to TEST-03: Testing

**Known issues (deferred to v3.1):**
- Gemini model instability - switching back to Claude
- Workflow debugging needed
- Codebase cleanup needed

---

## v2.1 AI Parsing & Bug Fixes (Shipped: 2026-01-30)

**Delivered:** Per-image model selection, AI interpretation confirmation UI, and bug fixes for preview page errors.

**Phases completed:** 13-15 (9 plans total)

**Key accomplishments:**

- Per-image model selection (different models for different images in same folder)
- ImageOperationSchema for image-specific operations in AI parsing
- calculateGenerationCount pure function for accurate generation counts
- Interpretation confirmation page with view/edit modes
- Preview page error handling with actual error messages
- Fixed "failed to fetch generations" bug

**Stats:**

- 9 plans across 3 phases
- 11 requirements delivered (100%)
- 2 days execution (2026-01-29 → 2026-01-30)

**Git range:** `feat(13-01)` → `feat(15-03)`

**Requirements delivered:**
- PIMG-01 to PIMG-04: Per-image model selection
- PARS-01 to PARS-05: AI parsing accuracy
- BUGF-01, BUGF-02: Bug fixes

---

## v2.0 Multi-Model (Shipped: 2026-01-27)

**Delivered:** Multi-model support with Nano Banana Pro and Seedream 4.5 Edit, per-folder prompt configuration, and generation deletion for quality control.

**Phases completed:** 7-12 (19 plans total)

**Key accomplishments:**

- Model strategy pattern enabling transparent switching between image generation models
- Seedream 4.5 Edit support with up to 14 reference images and quality/aspect ratio options
- Per-folder prompts allowing different instructions per source folder
- Discriminated union Zod schemas for model-specific parameter validation
- Strategy-based cost estimation with dynamic model pricing
- Soft delete for generations with atomic counter updates via PostgreSQL RPC
- Model-aware UI with dynamic form fields based on selected model

**Stats:**

- 19 plans across 6 phases
- 13 requirements delivered (100%)
- 1 day execution (2026-01-26 → 2026-01-27)

**Git range:** `feat(07-01)` → `feat(12-02)`

**Requirements delivered:**
- MODL-01 to MODL-05: Multi-model support
- PRMT-01 to PRMT-04: Per-folder prompts
- DELT-01 to DELT-04: Delete generations

---

## v1.0 MVP (Shipped: 2026-01-26)

**Delivered:** Complete bulk image generation app with AI-powered prompt parsing, queue management, real-time progress tracking, resilient error recovery, and organized result downloads.

**Phases completed:** 1-6 (30 plans total)

**Key accomplishments:**

- Folder drag-drop with structure preservation supporting 500+ images
- AI-powered natural language prompt parsing with clarifying questions
- 20-concurrent queue management with automatic job feeding
- Real-time progress tracking with Supabase Realtime subscriptions
- Resilient error recovery with exponential backoff (never skips images)
- Streaming ZIP downloads organized by source folder structure

**Stats:**

- 121 commits
- 10,799 lines of TypeScript
- 6 phases, 30 plans
- 2 days from start to ship (2026-01-24 → 2026-01-26)

**Git range:** `feat(01-01)` → `feat(06-04)`

---
