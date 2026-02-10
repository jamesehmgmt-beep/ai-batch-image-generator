# Roadmap: BulkImageGen

## Milestones

- ✅ **v1.0 MVP** - Phases 1-6 (shipped 2026-01-26)
- ✅ **v2.0 Multi-Model** - Phases 7-12 (shipped 2026-01-27)
- ✅ **v2.1 AI Parsing & Bug Fixes** - Phases 13-15 (shipped 2026-01-30)
- ✅ **v3.0 Gemini Migration & Bug Fixes** - Phases 16-20 (shipped 2026-01-31)
- ✅ **v3.1 Stability & Claude Migration** - Phases 21-24 (shipped 2026-02-03)
- ✅ **v4.0 Per-Generation Prompts** - Phases 25-27 (shipped 2026-02-04)

## Phases

<details>
<summary>v1.0 MVP (Phases 1-6) - SHIPPED 2026-01-26</summary>

### Phase 1: Setup & Database Foundation
**Goal**: Project infrastructure ready for development
**Plans**: 6 plans (complete)

### Phase 2: Folder Upload & Processing
**Goal**: Users can upload folders of images with structure preservation
**Plans**: 6 plans (complete)

### Phase 3: Queue Processing & Image Generation
**Goal**: Queue processes generations with automatic job feeding and resilient retry
**Plans**: 4 plans (complete)

### Phase 4: Pre-Execution Summary & Status Polling
**Goal**: Users see generation preview before execution and track real-time progress
**Plans**: 5 plans (complete)

### Phase 5: Download Results
**Goal**: Users can download generated images organized by folder
**Plans**: 5 plans (complete)

### Phase 6: Job History
**Goal**: Users can browse past jobs and re-download results
**Plans**: 4 plans (complete)

**v1.0 Stats:**
- Total plans: 30
- Execution time: ~2 hours
- Timeline: 2 days
- Codebase: 10,799 LOC TypeScript

</details>

<details>
<summary>v2.0 Multi-Model (Phases 7-12) - SHIPPED 2026-01-27</summary>

### Phase 7: Model Strategy Infrastructure
**Goal**: System can switch between multiple image generation models transparently
**Requirements**: MODL-01, MODL-03
**Plans**: 6 plans (complete)

### Phase 8: Schema Extensions & Migrations
**Goal**: Database and schemas support multi-model parameters and per-folder configuration
**Requirements**: MODL-02, MODL-03, MODL-04, MODL-05
**Plans**: 3 plans (complete)

### Phase 9: Queue Integration
**Goal**: Generation queue executes jobs using correct model strategy with accurate cost estimation
**Requirements**: MODL-04, MODL-05
**Plans**: 2 plans (complete)

### Phase 10: Per-Folder Prompt Logic
**Goal**: System can parse and execute per-folder prompts as alternative to global prompts
**Requirements**: PRMT-01, PRMT-02, PRMT-03, PRMT-04
**Plans**: 3 plans (complete)

### Phase 11: Multi-Model UI
**Goal**: Users can select models, see model-specific options, and configure per-folder prompts
**Requirements**: MODL-02
**Plans**: 3 plans (complete)

### Phase 12: Delete Generations
**Goal**: Users can delete individual generations from results with atomic count updates
**Requirements**: DELT-01, DELT-02, DELT-03, DELT-04
**Plans**: 2 plans (complete)

**v2.0 Stats:**
- Total plans: 19
- Requirements: 13 (100% delivered)

</details>

<details>
<summary>v2.1 AI Parsing & Bug Fixes (Phases 13-15) - SHIPPED 2026-01-30</summary>

### Phase 13: Bug Fixes
**Goal**: Preview page loads and displays generations correctly after cost estimation
**Requirements**: BUGF-01, BUGF-02
**Plans**: 2 plans (complete)

### Phase 14: Per-Image Schema & Parsing
**Goal**: AI parser can assign different models to different images within the same folder
**Requirements**: PIMG-01, PIMG-02, PIMG-03, PIMG-04, PARS-03, PARS-04, PARS-05
**Plans**: 4 plans (complete)

### Phase 15: Interpretation Confirmation UI
**Goal**: Users can review and approve AI's interpretation before job creation
**Requirements**: PARS-01, PARS-02
**Plans**: 3 plans (complete)

**v2.1 Stats:**
- Total plans: 9
- Requirements: 11 (100% delivered)
- Timeline: 2 days

</details>

<details>
<summary>v3.0 Gemini Migration & Bug Fixes (Phases 16-20) - SHIPPED 2026-01-31</summary>

### Phase 16: Folder Ordering Fix
**Goal**: Folder upload and display maintains drag-and-drop order throughout the UI
**Requirements**: ORDR-01, ORDR-02
**Plans**: TBD
**Manual Test Checkpoint**: YES
- Upload 5+ folders in specific order (e.g., A, B, C, D, E)
- Verify per-folder prompt UI shows folders in same order
- Verify confirmation page shows folders in same order

### Phase 17: Gemini SDK Integration
**Goal**: Google AI SDK installed and configured with proper error handling
**Requirements**: GEMI-04, GEMI-05
**Plans**: TBD
**Manual Test Checkpoint**: NO (SDK setup only, no user-facing changes)

### Phase 18: Gemini AI Parser Migration
**Goal**: AI parsing uses Gemini models with per-folder API calls
**Requirements**: GEMI-01, GEMI-02, GEMI-03
**Plans**: TBD
**Manual Test Checkpoint**: YES
- Upload folders with images
- Write a prompt and submit
- Verify AI returns valid parsed job structure
- Check console/network for per-folder API calls

### Phase 19: Bug Fixes
**Goal**: Generation count accuracy and exclusion logic work correctly
**Requirements**: BUGF-03, BUGF-04
**Plans**: 1 plan (complete)
**Manual Test Checkpoint**: YES
- Test generation count: cost page count must match preview page count exactly
- Test exclusions: exclude files in prompt, verify they don't appear in generations

### Phase 20: Testing
**Goal**: Comprehensive test coverage for critical paths
**Requirements**: TEST-01, TEST-02, TEST-03
**Plans**: 4 plans
**Manual Test Checkpoint**: YES (Final UAT)
- Run automated test suite
- Complete end-to-end workflow: upload -> parse -> confirm -> execute -> download

Plans:
- [ ] 20-01-PLAN.md - Vitest configuration and unit tests for calculateGenerationCount
- [ ] 20-02-PLAN.md - Integration tests for Gemini parser with mocked SDK
- [ ] 20-03-PLAN.md - Playwright E2E test setup and workflow tests
- [ ] 20-04-PLAN.md - Final verification checkpoint and UAT

</details>

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Setup & Database | v1.0 | 6/6 | Complete | 2026-01-26 |
| 2. Folder Upload | v1.0 | 6/6 | Complete | 2026-01-26 |
| 3. Queue Processing | v1.0 | 4/4 | Complete | 2026-01-26 |
| 4. Pre-Execution | v1.0 | 5/5 | Complete | 2026-01-26 |
| 5. Download Results | v1.0 | 5/5 | Complete | 2026-01-26 |
| 6. Job History | v1.0 | 4/4 | Complete | 2026-01-26 |
| 7. Model Strategy | v2.0 | 6/6 | Complete | 2026-01-26 |
| 8. Schema Extensions | v2.0 | 3/3 | Complete | 2026-01-26 |
| 9. Queue Integration | v2.0 | 2/2 | Complete | 2026-01-26 |
| 10. Per-Folder Prompts | v2.0 | 3/3 | Complete | 2026-01-27 |
| 11. Multi-Model UI | v2.0 | 3/3 | Complete | 2026-01-27 |
| 12. Delete Generations | v2.0 | 2/2 | Complete | 2026-01-27 |
| 13. Bug Fixes | v2.1 | 2/2 | Complete | 2026-01-29 |
| 14. Per-Image Schema & Parsing | v2.1 | 4/4 | Complete | 2026-01-30 |
| 15. Interpretation Confirmation UI | v2.1 | 3/3 | Complete | 2026-01-30 |
| 16. Folder Ordering Fix | v3.0 | 1/1 | Complete | 2026-01-30 |
| 17. Gemini SDK Integration | v3.0 | 1/1 | Complete | 2026-01-30 |
| 18. Gemini AI Parser Migration | v3.0 | 1/1 | Complete | 2026-01-30 |
| 19. Bug Fixes | v3.0 | 1/1 | Complete | 2026-01-31 |
| 20. Testing | v3.0 | 4/4 | Complete | 2026-01-31 |

<details>
<summary>v3.1 Stability & Claude Migration (Phases 21-24) - SHIPPED 2026-02-01</summary>

### Phase 21: Claude Sonnet 4.5 Migration
**Goal**: Replace Gemini with Claude Sonnet 4.5 Thinking for AI parsing
**Requirements**: CLDE-01, CLDE-02, CLDE-03, CLDE-04
**Plans**: 2 plans
**Manual Test Checkpoint**: YES
- Run AI parsing with multiple folders
- Verify extended thinking produces quality results
- Confirm per-folder sequential calls work

Plans:
- [x] 21-01-PLAN.md - Anthropic client retry logic and Claude parser with extended thinking
- [x] 21-02-PLAN.md - API route migration and verification checkpoint

### Phase 22: Codebase Cleanup
**Goal**: Remove unused Gemini files, verify test integrity, remove debug console.log statements
**Requirements**: CLEN-01, CLEN-02, CLEN-03
**Plans**: 3 plans
**Manual Test Checkpoint**: NO (cleanup only)

Plans:
- [x] 22-01-PLAN.md - Remove Gemini files and @google/generative-ai dependency
- [x] 22-02-PLAN.md - Verify test file integrity after Gemini removal
- [x] 22-03-PLAN.md - Remove excessive console.log debug statements

### Phase 23: Full E2E Debugging
**Goal**: Test and fix every step of the workflow
**Requirements**: DEBG-01, DEBG-02, DEBG-03, DEBG-04, DEBG-05
**Plans**: 5 plans
**Manual Test Checkpoint**: YES
- Complete workflow: upload -> parse -> confirm -> execute -> download
- Verify each step works correctly
- Document and fix any issues found

Plans:
- [ ] 23-01-PLAN.md - Upload flow testing and fixes (DEBG-01)
- [ ] 23-02-PLAN.md - AI parsing testing and fixes (DEBG-02)
- [ ] 23-03-PLAN.md - Confirmation page testing and fixes (DEBG-03)
- [ ] 23-04-PLAN.md - Job execution testing and fixes (DEBG-04)
- [ ] 23-05-PLAN.md - Download testing and fixes (DEBG-05)

### Phase 24: Final Quality Assurance
**Goal**: Verify all tests pass and complete manual UAT
**Requirements**: QUAL-01, QUAL-02, QUAL-03, QUAL-04
**Plans**: 2 plans
**Manual Test Checkpoint**: YES (Final UAT)
- All automated tests pass
- Complete E2E workflow with real images
- App is production-ready

Plans:
- [ ] 24-01-PLAN.md - Run and verify all automated tests (unit, integration, E2E)
- [ ] 24-02-PLAN.md - Complete manual UAT with structured test scenarios

</details>

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Setup & Database | v1.0 | 6/6 | Complete | 2026-01-26 |
| 2. Folder Upload | v1.0 | 6/6 | Complete | 2026-01-26 |
| 3. Queue Processing | v1.0 | 4/4 | Complete | 2026-01-26 |
| 4. Pre-Execution | v1.0 | 5/5 | Complete | 2026-01-26 |
| 5. Download Results | v1.0 | 5/5 | Complete | 2026-01-26 |
| 6. Job History | v1.0 | 4/4 | Complete | 2026-01-26 |
| 7. Model Strategy | v2.0 | 6/6 | Complete | 2026-01-26 |
| 8. Schema Extensions | v2.0 | 3/3 | Complete | 2026-01-26 |
| 9. Queue Integration | v2.0 | 2/2 | Complete | 2026-01-26 |
| 10. Per-Folder Prompts | v2.0 | 3/3 | Complete | 2026-01-27 |
| 11. Multi-Model UI | v2.0 | 3/3 | Complete | 2026-01-27 |
| 12. Delete Generations | v2.0 | 2/2 | Complete | 2026-01-27 |
| 13. Bug Fixes | v2.1 | 2/2 | Complete | 2026-01-29 |
| 14. Per-Image Schema & Parsing | v2.1 | 4/4 | Complete | 2026-01-30 |
| 15. Interpretation Confirmation UI | v2.1 | 3/3 | Complete | 2026-01-30 |
| 16. Folder Ordering Fix | v3.0 | 1/1 | Complete | 2026-01-30 |
| 17. Gemini SDK Integration | v3.0 | 1/1 | Complete | 2026-01-30 |
| 18. Gemini AI Parser Migration | v3.0 | 1/1 | Complete | 2026-01-30 |
| 19. Bug Fixes | v3.0 | 1/1 | Complete | 2026-01-31 |
| 20. Testing | v3.0 | 4/4 | Complete | 2026-01-31 |
| 21. Claude Migration | v3.1 | 2/2 | Complete | 2026-01-31 |
| 22. Codebase Cleanup | v3.1 | 3/3 | Complete | 2026-01-31 |
| 23. E2E Debugging | v3.1 | 0/5 | Complete (manual) | 2026-02-01 |
| 24. Quality Assurance | v3.1 | 2/2 | Complete | 2026-02-01 |
| 25. Schema & Storage | v4.0 | 2/2 | Complete | 2026-02-03 |
| 26. AI Prompt Generation | v4.0 | 2/2 | Complete | 2026-02-04 |
| 27. UI Integration | v4.0 | 1/1 | Complete | 2026-02-04 |

<details>
<summary>✅ v4.0 Per-Generation Prompts (Phases 25-27) - SHIPPED 2026-02-04</summary>

- [x] Phase 25: Schema & Storage (2/2 plans) — completed 2026-02-03
- [x] Phase 26: AI Prompt Generation (2/2 plans) — completed 2026-02-04
- [x] Phase 27: UI Integration (direct implementation) — completed 2026-02-04

**v4.0 Stats:**
- Total plans: 4+
- Requirements: 11 (100% delivered)
- Timeline: 2 days

See: .planning/milestones/v4.0-ROADMAP.md for full archive

</details>

---
*Roadmap created: 2026-01-26*
*v4.0 shipped: 2026-02-04*
*Total phases: 27*
*Total plans: 86+
