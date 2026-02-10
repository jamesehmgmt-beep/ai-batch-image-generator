# BulkImageGen

## What This Is

A bulk product image generation web app that automates the tedious process of creating AI-generated product photos. Upload folders of source images, write natural language prompts describing what you want done to each folder/image, and let AI parse your intent, ask clarifying questions, then execute bulk generations against kie.ai's image generation APIs with intelligent queue management.

## Core Value

Eliminate the manual one-by-one process of creating prompts and adding reference photos by letting AI understand complex, detailed instructions and execute bulk image generations automatically.

## Current State (v4.0 Shipped)

**Shipped:** 2026-02-04
**Codebase:** ~20K LOC TypeScript
**Tech Stack:** Next.js 16, Tailwind v4, shadcn/ui, Supabase, Claude Sonnet 4.5

**What's working:**
- Folder upload with structure preservation (500+ images)
- AI prompt parsing with clarifying questions
- Per-image model selection (different models for different images in same folder)
- Interpretation confirmation step before execution
- 20-concurrent queue with automatic job feeding
- Real-time progress tracking
- Resilient retry (never skips images)
- Streaming ZIP downloads by folder
- Job history browsing
- PNG/JPEG format selection
- Soft delete for generations
- **Per-generation AI prompts** (v4.0) - unique prompts for each generation
- **Intent analysis** (v4.0) - detects uniform/explicit/implicit variation modes
- **Preview prompt editing** (v4.0) - edit individual prompts before execution

## Requirements

### Validated (v1.0)

- ✓ UPLD-01 through UPLD-05 — Folder upload with thumbnails
- ✓ MODE-01 through MODE-04 — Photo mode support with AI inference
- ✓ PMPT-01 through PMPT-06 — Natural language prompt parsing
- ✓ PROC-01 through PROC-05 — Queue processing with retry
- ✓ RSLT-01 through RSLT-04 — Results download and history
- ✓ AUTH-01, AUTH-02 — Password auth, dark mode UI
- ✓ INTG-01 through INTG-04 — kie.ai, Supabase, Claude integrations

### Validated (v2.0)

- ✓ MODL-01 through MODL-05 — Multi-model support with Seedream 4.5 Edit
- ✓ PRMT-01 through PRMT-04 — Per-folder prompt configuration
- ✓ DELT-01 through DELT-04 — Soft delete for generations

### Validated (v2.1)

- ✓ PIMG-01 through PIMG-04 — Per-image model selection
- ✓ PARS-01 through PARS-05 — AI parsing accuracy and interpretation confirmation
- ✓ BUGF-01, BUGF-02 — Preview page bug fixes

### Validated (v3.0)

- ✓ ORDR-01, ORDR-02 — Folder ordering preserved
- ✓ TEST-01 through TEST-03 — Vitest and Playwright testing infrastructure

### Validated (v3.1)

- ✓ CLDE-01 through CLDE-04 — Claude Sonnet 4.5 with extended thinking
- ✓ CLEN-01 through CLEN-03 — Codebase cleanup
- ✓ QUAL-01 through QUAL-04 — Quality assurance

### Validated (v4.0)

- ✓ SCHM-01 through SCHM-03 — Per-generation prompt storage
- ✓ PGEN-01 through PGEN-04 — AI prompt generation with intent analysis
- ✓ UI-01 through UI-04 — Preview prompt editing

### Out of Scope

- Multi-user/team features — single user tool
- Mobile app — web only
- Payment/billing features — personal use tool
- Video generation — image-only scope

## Context

**Problem being solved:** Manually creating prompts and adding reference photos for each image generation is extremely time-consuming when processing large batches of product photos.

**Supported Models:**

| Model | Provider | Max Refs | Aspect Ratios | Quality |
|-------|----------|----------|---------------|---------|
| Nano Banana Pro | kie.ai | 8 | 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9, auto | 1K, 2K, 4K |
| Seedream 4.5 Edit | kie.ai | 14 | 1:1, 4:3, 3:4, 16:9, 9:16, 2:3, 3:2, 21:9 | basic (2K), high (4K) |

**API Keys:**
- Claude (Anthropic): (in environment - ANTHROPIC_API_KEY)
- kie.ai: (in environment)

## Constraints

- **API**: kie.ai — max 8-14 reference images depending on model
- **Concurrency**: Max 20 concurrent generations (kie.ai limitation)
- **Storage**: Supabase for images and job state
- **Auth**: Password-locked, password is "16063001"
- **Image upload**: Max 30MB per image

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| kie.ai for image generation | User's existing provider | ✓ Good |
| Supabase for storage/auth | User preference, good fit | ✓ Good |
| Single user with password | Personal tool | ✓ Good |
| AI-powered prompt parsing | Core value prop | ✓ Good |
| 20 concurrent queue limit | kie.ai API constraint | ✓ Good |
| Tailwind v4 + shadcn/ui | Modern styling, dark mode | ✓ Good |
| archiver for ZIP streaming | Memory efficient for 500+ images | ✓ Good |
| Exponential backoff with jitter | Prevents retry storms | ✓ Good |
| p-queue for concurrency | Simple, reliable queue control | ✓ Good |
| calculateGenerationCount pure function | Single source of truth for generation counts | ✓ Good |
| Interpretation confirmation UI | User reviews AI parsing before execution | ✓ Good |

## Shipped Milestones

- **v1.0 MVP** (2026-01-26) — Core bulk generation flow
- **v2.0 Multi-Model** (2026-01-27) — Seedream support, per-folder prompts, soft delete
- **v2.1 AI Parsing & Bug Fixes** (2026-01-30) — Per-image selection, confirmation UI, bug fixes
- **v3.0 Gemini Migration & Bug Fixes** (2026-01-31) — Testing infrastructure, folder ordering, Gemini integration (unstable)
- **v3.1 Stability & Claude Migration** (2026-02-03) — Claude Sonnet 4.5 Thinking, E2E debugging, codebase cleanup, production-ready
- **v4.0 Per-Generation Prompts** (2026-02-04) — Per-generation AI prompts, intent analysis, preview prompt editing

---
*Last updated: 2026-02-04 — v4.0 milestone shipped*

