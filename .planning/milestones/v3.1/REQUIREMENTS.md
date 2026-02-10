# Requirements: BulkImageGen v3.1 (ARCHIVED)

**Defined:** 2026-01-31
**Completed:** 2026-02-01
**Status:** ALL SATISFIED (16/16)

## v3.1 Requirements

Requirements for v3.1 Stability & Claude Migration release. Focuses on switching from Gemini back to Claude, full debugging, and codebase cleanup.

### Claude Migration (4/4)

- [x] **CLDE-01**: Replace Gemini with Claude Sonnet 4.5 Thinking for AI parsing
- [x] **CLDE-02**: AI parsing uses extended thinking for thorough analysis
- [x] **CLDE-03**: Per-folder API calls maintained (one call per folder, sequential)
- [x] **CLDE-04**: Proper error handling and retry logic for Claude API

### Full E2E Debugging (5/5)

- [x] **DEBG-01**: Upload flow works correctly (folder upload, structure preservation)
- [x] **DEBG-02**: AI parsing returns valid job structure
- [x] **DEBG-03**: Confirmation page shows correct interpretation and counts
- [x] **DEBG-04**: Job execution completes without errors
- [x] **DEBG-05**: Download produces valid ZIP with generated images

### Codebase Cleanup (3/3)

- [x] **CLEN-01**: Remove unused files and directories
- [x] **CLEN-02**: Clean up orphaned test files and artifacts
- [x] **CLEN-03**: Remove development debugging code

### Quality Assurance (4/4)

- [x] **QUAL-01**: All unit tests pass
- [x] **QUAL-02**: All integration tests pass
- [x] **QUAL-03**: All E2E tests pass
- [x] **QUAL-04**: Manual UAT passes (full workflow verification)

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CLDE-01 | 21 | ✓ Verified |
| CLDE-02 | 21 | ✓ Verified |
| CLDE-03 | 21 | ✓ Verified |
| CLDE-04 | 21 | ✓ Verified |
| DEBG-01 | 23 | ✓ Verified |
| DEBG-02 | 23 | ✓ Verified |
| DEBG-03 | 23 | ✓ Verified |
| DEBG-04 | 23 | ✓ Verified |
| DEBG-05 | 23 | ✓ Verified |
| CLEN-01 | 22 | ✓ Verified |
| CLEN-02 | 22 | ✓ Verified |
| CLEN-03 | 22 | ✓ Verified |
| QUAL-01 | 24 | ✓ Verified |
| QUAL-02 | 24 | ✓ Verified |
| QUAL-03 | 24 | ✓ Verified |
| QUAL-04 | 24 | ✓ Verified |

---
*Archived: 2026-02-01*
