# Phase 8: Schema Extensions & Migrations - Research

**Researched:** 2026-01-26
**Domain:** Database schema evolution, data backfilling, and discriminated union validation
**Confidence:** HIGH

## Summary

Phase 8 extends the database schema and Zod validation to support the multi-model infrastructure built in Phase 7. The core challenge is adding model-specific columns and backfilling existing v1.0 jobs to 'nano-banana-pro' without data loss or downtime. This phase makes the model abstraction fully operational by connecting TypeScript types, Zod schemas, and PostgreSQL storage.

The research reveals PostgreSQL 11+ optimizations make adding columns with constant defaults extremely fast (metadata-only operation). Batched backfilling is only needed for volatile defaults or when updating JSONB structures. Zod discriminated unions provide O(1) conditional validation and automatic type narrowing based on the model field. Cost estimation must query model capabilities from the Strategy Pattern rather than hardcoded pricing tables.

Database changes include: add model column to jobs and generations tables (TEXT NOT NULL DEFAULT 'nano-banana-pro'), add quality and image_size columns to generations table for Seedream parameters (nullable), create indexes for model-based queries, and optionally update parsed_job JSONB to include model in folder operations. The migration is straightforward because Phase 7 already added ModelId types and strategy infrastructure—Phase 8 persists this to the database.

**Primary recommendation:** Use single migration with ALTER TABLE ADD COLUMN (constant default), batched JSONB updates via jsonb_set for parsed_job evolution, Zod discriminated unions with .and() to merge model-specific params into FolderOperationSchema, and update cost estimation to query strategy.capabilities.costPerGeneration instead of hardcoded COST_PER_IMAGE constant.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| PostgreSQL ALTER TABLE | 11+ | Schema evolution with zero downtime | Constant defaults are metadata-only in PG 11+, no table rewrite. Industry standard for relational schema changes. |
| Zod discriminated unions | 3.24.1 | Conditional validation by model field | Already in project, O(1) validation lookup, automatic TypeScript type narrowing, first-class support for discriminated unions. |
| PostgreSQL JSONB | Current (Supabase) | Flexible storage for parsed_job evolution | Schema-less evolution within structured tables. GIN indexes enable efficient querying. jsonb_set for surgical updates. |
| Supabase migrations | Current | Version-controlled schema changes | Git-tracked .sql files, supabase db push for deployment, automatic rollback on failure. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| PostgreSQL DO blocks | Current | Batched backfill with throttling | When updating JSONB columns or volatile defaults. Loop with pg_sleep prevents lock contention. |
| PostgreSQL CHECK constraints | Current | Enforce model enum at DB level | Validate model field against known ModelId values. Prevents invalid data from non-TypeScript clients. |
| PostgreSQL jsonb_set | Current | Update nested JSONB structures | Modify parsed_job.job.folders[].model without replacing entire JSONB object. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Single migration | Dual-write pattern with two columns | Dual-write adds complexity (old_model + new_model columns, sync logic). Only needed for high-traffic table renames. Our use case is simple column addition. |
| CHECK constraint for model | Application-level validation only | DB constraint prevents invalid data from reaching application. Defense in depth. CHECK adds negligible overhead. |
| jsonb_set for parsed_job | Full JSONB replacement | Replacing entire JSONB loses concurrent updates, requires read-modify-write lock. jsonb_set is atomic, surgical. |
| Batched backfill in migration | Application-layer backfill after migration | Migration backfill is atomic with schema change, ensures consistency. App-layer requires coordination, tracking of completion. |
| Zod .and() for merging schemas | .extend() or .merge() | .and() creates intersection type (both schemas must validate). .extend() replaces conflicting keys. .and() better for discriminated unions. |

**Installation:**
```bash
# No new dependencies required
# Using existing PostgreSQL (Supabase), Zod 3.24.1, TypeScript 5.x
```

## Architecture Patterns

### Recommended Project Structure
```
supabase/
└── migrations/
    ├── 001_jobs_and_generations.sql     # Existing (Phase 3)
    └── 002_add_model_fields.sql         # NEW: Add model columns + Seedream fields

lib/
├── ai/schemas/
│   └── job.ts                           # MODIFIED: Discriminated union for model params
├── types/
│   └── generation.ts                    # MODIFIED: Add model/quality/imageSize to GenerationRecord
├── job/
│   └── cost-estimation.ts               # MODIFIED: Query strategy.capabilities instead of hardcoded
└── models/
    └── types.ts                         # Already has ModelCapabilities (Phase 7)
```

### Pattern 1: Zero-Downtime Column Addition with Constant Default
**What:** Add model column with DEFAULT value (constant, not volatile). PostgreSQL 11+ makes this metadata-only—no table rewrite.
**When to use:** Adding required columns to existing tables without downtime.
**Example:**
```sql
-- Source: PostgreSQL ALTER TABLE optimization (PG 11+)
-- https://www.postgresql.org/docs/current/ddl-alter.html
-- https://www.cybertec-postgresql.com/en/postgresql-alter-table-add-column-done-right/

-- Migration: 002_add_model_fields.sql

-- Step 1: Add model column to jobs table
-- Safe: Constant default 'nano-banana-pro' is metadata-only in PG 11+
-- No table rewrite, no downtime
ALTER TABLE jobs
ADD COLUMN model TEXT NOT NULL DEFAULT 'nano-banana-pro';

-- Step 2: Add model column to generations table
-- Same optimization applies
ALTER TABLE generations
ADD COLUMN model TEXT NOT NULL DEFAULT 'nano-banana-pro';

-- Step 3: Add Seedream-specific columns to generations (nullable)
-- These are optional, so NULL is acceptable default
ALTER TABLE generations
ADD COLUMN quality TEXT,
ADD COLUMN image_size TEXT;

-- Step 4: Add CHECK constraints for validation
-- Ensures only valid ModelId values are stored
ALTER TABLE jobs
ADD CONSTRAINT check_jobs_model CHECK (model IN ('nano-banana-pro', 'seedream-4.5-edit'));

ALTER TABLE generations
ADD CONSTRAINT check_generations_model CHECK (model IN ('nano-banana-pro', 'seedream-4.5-edit'));

-- Step 5: Add indexes for model-based queries
-- Enables efficient filtering by model (e.g., cost aggregation per model)
CREATE INDEX idx_jobs_model ON jobs(model);
CREATE INDEX idx_generations_model ON generations(model);

-- Step 6: Create GIN index on parsed_job JSONB for folder queries
-- Enables fast queries on parsed_job.job.folders array
CREATE INDEX idx_jobs_parsed_job_gin ON jobs USING GIN (parsed_job);
```

### Pattern 2: Batched JSONB Backfill for Schema Evolution
**What:** Update parsed_job JSONB to add model field to each folder operation. Use jsonb_set for surgical updates, batch with pg_sleep to prevent lock contention.
**When to use:** Evolving JSONB schema without disrupting concurrent operations.
**Example:**
```sql
-- Source: PostgreSQL JSONB best practices
-- https://medium.com/@shinyjai2011/zero-downtime-postgresql-jsonb-migration-a-practical-guide-for-scalable-schema-evolution-9f74124ef4a1
-- https://code.jjb.cc/how-to-create-a-new-column-in-postgres-with-existing-rows-backfilled-with-a-different-value-from-the-default

-- Optional: Update parsed_job JSONB to include model in folders array
-- This is only necessary if cost estimation or UI reads from parsed_job directly
-- If reading from jobs.model or generations.model, skip this step

-- Backfill model field into parsed_job.job.folders array
DO $$
DECLARE
  batch_size INT := 100; -- Small batches to prevent lock contention
  rows_updated INT;
  folder_count INT;
  folder_idx INT;
BEGIN
  LOOP
    -- Update jobs in batches
    WITH batch AS (
      SELECT id, parsed_job
      FROM jobs
      WHERE parsed_job->'job'->'folders' @> '[{}]'::jsonb -- Has folders array
      AND NOT (parsed_job->'job'->'folders'->0 ? 'model') -- Missing model field
      LIMIT batch_size
    )
    UPDATE jobs j
    SET parsed_job = (
      SELECT jsonb_set(
        j.parsed_job,
        ARRAY['job', 'folders'],
        (
          SELECT jsonb_agg(
            jsonb_set(folder, '{model}', '"nano-banana-pro"'::jsonb)
          )
          FROM jsonb_array_elements(j.parsed_job->'job'->'folders') AS folder
        )
      )
    )
    FROM batch
    WHERE j.id = batch.id;

    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    EXIT WHEN rows_updated = 0;

    -- Log progress
    RAISE NOTICE 'Updated % jobs with model field in parsed_job', rows_updated;

    -- Throttle to prevent overwhelming the database
    PERFORM pg_sleep(0.1);
  END LOOP;

  RAISE NOTICE 'JSONB backfill complete';
END $$;
```

### Pattern 3: Zod Discriminated Union with .and() for Model-Specific Params
**What:** Use z.discriminatedUnion to define model-specific parameter schemas, merge into FolderOperationSchema with .and() operator. Enables conditional validation and automatic type narrowing.
**When to use:** Validating objects where required fields differ based on a discriminator field.
**Example:**
```typescript
// Source: Zod discriminated unions documentation
// https://zod.dev/api
// https://timkapitein.nl/blog/parsing-discriminated-unions-with-zod

// lib/ai/schemas/job.ts - MODIFIED for Phase 8

import { z } from 'zod';

// Photo mode and aspect ratio (unchanged from v1.0)
export const PhotoModeSchema = z.enum(['reference', 'analysis']);
export const AspectRatioSchema = z.enum([
  '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9', 'auto'
]);

// Nano Banana Pro specific parameters
const NanoBananaParamsSchema = z.object({
  model: z.literal('nano-banana-pro'),
  resolution: z.enum(['1K', '2K', '4K']).optional().default('2K'),
  outputFormat: z.enum(['PNG', 'JPG', 'png', 'jpg'])
    .transform(val => val.toUpperCase() as 'PNG' | 'JPG')
    .optional()
    .default('PNG'),
});

// Seedream 4.5 Edit specific parameters
const SeedreamParamsSchema = z.object({
  model: z.literal('seedream-4.5-edit'),
  quality: z.enum(['basic', 'high']).optional().default('basic'),
  imageSize: z.enum([
    'square', 'square_hd',
    'portrait_4_3', 'portrait_3_2', 'portrait_16_9',
    'landscape_4_3', 'landscape_3_2', 'landscape_16_9', 'landscape_21_9'
  ]).optional().default('landscape_16_9'),
});

// Discriminated union based on 'model' field
// Zod uses O(1) lookup on discriminator for performance
const ModelSpecificParamsSchema = z.discriminatedUnion('model', [
  NanoBananaParamsSchema,
  SeedreamParamsSchema,
]);

// Base folder operation schema (model-agnostic fields)
const BaseFolderOperationSchema = z.object({
  folderPath: z.string().describe('Path to the folder'),
  operation: z.string().describe('Generation prompt for this folder'),
  excludedFiles: z.array(z.string()).optional(),
  photoMode: PhotoModeSchema,
  aspectRatio: AspectRatioSchema,
  generationCount: z.number().int().min(1).max(100).optional(),
});

// Complete folder operation = base fields + model-specific params
// Use .and() to create intersection type (both schemas must validate)
export const FolderOperationSchema = BaseFolderOperationSchema.and(ModelSpecificParamsSchema);

// Inferred type has automatic type narrowing based on model field
export type FolderOperation = z.infer<typeof FolderOperationSchema>;

// Usage example - TypeScript automatically narrows types
function processFolderOperation(folder: FolderOperation) {
  if (folder.model === 'nano-banana-pro') {
    // TypeScript knows: folder.resolution exists, folder.quality doesn't
    console.log(`Resolution: ${folder.resolution}`);
    console.log(`Output: ${folder.outputFormat}`);
  } else if (folder.model === 'seedream-4.5-edit') {
    // TypeScript knows: folder.quality exists, folder.resolution doesn't
    console.log(`Quality: ${folder.quality}`);
    console.log(`Size: ${folder.imageSize}`);
  }
}

// Updated ParsedJobSchema
export const ParsedJobSchema = z.object({
  understood: z.boolean(),
  confidence: z.number().min(0).max(1),
  clarifyingQuestions: z.array(ClarifyingQuestionSchema).optional(),
  interpretation: z.string().optional(),
  job: z.object({
    folders: z.array(FolderOperationSchema),
    globalPrompt: z.string().optional(),
    model: z.enum(['nano-banana-pro', 'seedream-4.5-edit']).default('nano-banana-pro'),
    outputFormat: z.enum(['PNG', 'JPG', 'png', 'jpg'])
      .transform(val => val.toUpperCase() as 'PNG' | 'JPG')
      .optional()
      .default('PNG'),
  }).optional(),
});
```

### Pattern 4: Strategy-Based Cost Estimation
**What:** Query model capabilities from Strategy Pattern instances instead of hardcoded pricing tables. Enables dynamic pricing updates and multi-model support.
**When to use:** Calculating costs for multi-model jobs.
**Example:**
```typescript
// Source: Phase 7 Strategy Pattern implementation
// lib/job/cost-estimation.ts - MODIFIED for Phase 8

import type { FolderOperation } from '@/lib/types/job';
import { getModelStrategy } from '@/lib/models/model-factory';
import type { ModelId } from '@/lib/models/types';

export interface CostBreakdown {
  totalImages: number;
  estimatedCost: number;
  byModel: Array<{
    model: ModelId;
    imageCount: number;
    costPerImage: number;
    totalCost: number;
  }>;
  byFolder: Array<{
    folderPath: string;
    imageCount: number;
    model: ModelId;
    tier: string; // resolution or quality
    folderCost: number;
  }>;
}

/**
 * Calculate cost estimate for a parsed job using model strategies
 * @param operations - Folder operations from parsed job
 * @param fileCountByFolder - Map of folder path to file count (from upload phase)
 */
export function calculateCostEstimate(
  operations: FolderOperation[],
  fileCountByFolder: Record<string, number>
): CostBreakdown {
  const byModel = new Map<ModelId, { count: number; cost: number }>();
  const byFolder: CostBreakdown['byFolder'] = [];

  for (const op of operations) {
    // Determine effective generation count
    const generationCount = op.generationCount;
    let effectiveCount: number;

    if (generationCount && generationCount > 0) {
      // User specified exact number of generations
      effectiveCount = generationCount;
    } else {
      // Default: 1 generation per input image
      const folderCount = fileCountByFolder[op.folderPath] || 0;
      const excludedCount = op.excludedFiles?.length || 0;
      effectiveCount = Math.max(0, folderCount - excludedCount);
    }

    // Get model strategy to query pricing
    const strategy = getModelStrategy(op.model);

    // Determine tier (resolution for Nano, quality for Seedream)
    let tier: string;
    let costPerImage: number;

    if (op.model === 'nano-banana-pro') {
      tier = op.resolution || '2K'; // Default to 2K for backward compatibility
      costPerImage = strategy.capabilities.costPerGeneration[tier];
    } else if (op.model === 'seedream-4.5-edit') {
      tier = op.quality || 'basic';
      costPerImage = strategy.capabilities.costPerGeneration[tier];
    } else {
      // Fallback for unknown models
      tier = 'standard';
      costPerImage = 0.134; // Default Nano pricing
    }

    const folderCost = effectiveCount * costPerImage;

    // Accumulate by model
    const existing = byModel.get(op.model) || { count: 0, cost: 0 };
    byModel.set(op.model, {
      count: existing.count + effectiveCount,
      cost: existing.cost + folderCost,
    });

    // Add folder breakdown
    byFolder.push({
      folderPath: op.folderPath,
      imageCount: effectiveCount,
      model: op.model,
      tier,
      folderCost,
    });
  }

  // Calculate totals
  const totalImages = Array.from(byModel.values()).reduce((sum, m) => sum + m.count, 0);
  const estimatedCost = Array.from(byModel.values()).reduce((sum, m) => sum + m.cost, 0);

  // Convert byModel map to array
  const byModelArray = Array.from(byModel.entries()).map(([model, data]) => {
    const strategy = getModelStrategy(model);
    return {
      model,
      imageCount: data.count,
      costPerImage: data.cost / data.count, // Average cost per image for this model
      totalCost: data.cost,
    };
  });

  return {
    totalImages,
    estimatedCost,
    byModel: byModelArray,
    byFolder,
  };
}

/**
 * Format cost for display
 */
export function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}
```

### Anti-Patterns to Avoid
- **Adding NOT NULL column without DEFAULT:** PostgreSQL will fail migration if any existing rows would violate constraint. Always add DEFAULT first, make NOT NULL second.
- **Backfilling entire table in single UPDATE:** Locks table for duration of backfill. Use batched updates with LIMIT + pg_sleep.
- **Using .merge() instead of .and() for discriminated unions:** .merge() replaces conflicting keys, losing discriminated union type narrowing. Use .and() for intersection.
- **Hardcoding pricing in cost estimation:** Defeats purpose of Strategy Pattern. Query strategy.capabilities.costPerGeneration dynamically.
- **Storing model-specific fields on jobs table:** Jobs table represents parent job. Model-specific params (resolution, quality) belong on generations table where execution occurs.
- **Volatile defaults in ADD COLUMN:** Functions like clock_timestamp() or gen_random_uuid() force table rewrite. Use constant defaults for zero downtime.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Conditional validation by enum field | Manual refine() with if/else | Zod discriminatedUnion | Discriminated union provides O(1) lookup vs O(n) checks, automatic type narrowing, compile-time safety. Manual refine loses type information after validation. |
| Database column backfill | Single massive UPDATE | Batched DO block with LIMIT + pg_sleep | Single UPDATE locks table for entire operation. Batched updates spread load, allow concurrent operations, prevent connection pool exhaustion. |
| JSONB structure updates | SELECT + replace entire JSONB | PostgreSQL jsonb_set() | Full replacement requires read-modify-write lock, loses concurrent updates. jsonb_set is atomic surgical update preserving rest of structure. |
| Model pricing lookup | Hardcoded switch/case | strategy.capabilities.costPerGeneration | Hardcoded pricing requires code changes for price updates. Strategy Pattern centralizes pricing with model implementation, queryable at runtime. |
| Type narrowing by discriminator | Type guards with 'as' casts | TypeScript discriminated union | Manual casts lose type safety, require repetition at every usage site. Discriminated union provides automatic narrowing after checking discriminator. |

**Key insight:** PostgreSQL 11+ optimized ALTER TABLE for constant defaults specifically to enable zero-downtime migrations. Zod's discriminatedUnion was designed specifically for this pattern (conditional validation by discriminator field). These aren't over-engineered solutions—they're purpose-built tools for this exact use case.

## Common Pitfalls

### Pitfall 1: Breaking v1.0 Jobs by Not Defaulting Model Field
**What goes wrong:** Existing v1.0 jobs in database have no model field. After migration, code reads jobs table expecting model field, gets NULL or undefined, crashes.
**Why it happens:** Assuming migration backfill is instant. There's always a window where new code runs on old data during deployment.
**How to avoid:**
- Always use DEFAULT 'nano-banana-pro' when adding model column
- Verify default matches v1.0 behavior (v1.0 exclusively used Nano Banana Pro)
- Test migration on copy of production data before deploying
- Ensure TypeScript types mark model as required, forcing explicit handling
**Warning signs:** "Cannot read property 'model' of undefined" errors after deployment. Existing jobs fail to process. Queue throws "Unknown model: undefined" from factory.

### Pitfall 2: JSONB Backfill Without Batching Causes Downtime
**What goes wrong:** Migration runs single UPDATE on parsed_job column updating 10,000 rows. Table lock prevents reads/writes for 30+ seconds. Users see timeout errors.
**Why it happens:** Underestimating table size. Assuming "just 10k rows" is fast. PostgreSQL UPDATE takes AccessExclusive lock.
**How to avoid:**
- Always batch JSONB updates: LIMIT 100 per iteration
- Add pg_sleep(0.1) between batches to allow concurrent operations
- Log progress with RAISE NOTICE for monitoring
- Test on production-sized dataset locally before deploying
- Consider making JSONB backfill optional (only needed if cost estimation reads JSONB)
**Warning signs:** Migration takes >30 seconds. Supabase connection timeouts during migration. Users report "502 Bad Gateway" errors during deployment.

### Pitfall 3: Forgetting to Update Cost Estimation After Schema Changes
**What goes wrong:** Database has model column, Zod schemas validate model-specific params, but cost estimation still uses hardcoded COST_PER_IMAGE for Nano only. Seedream jobs show incorrect costs.
**Why it happens:** Cost estimation file not updated during schema migration. Treating it as separate concern from database changes.
**How to avoid:**
- Update calculateCostEstimate to query strategy.capabilities.costPerGeneration
- Remove hardcoded COST_PER_IMAGE constant entirely
- Add test case: Seedream folder with 10 images should cost $0.32 (10 × $0.032)
- Verify cost breakdown shows per-model subtotals
**Warning signs:** Seedream jobs show Nano pricing ($1.34 vs $0.32 per 10 images). Cost breakdown missing model field. Tests pass but UI shows wrong estimates.

### Pitfall 4: Discriminated Union Validation Happens After Base Schema
**What goes wrong:** Zod validates BaseFolderOperationSchema first, fails before checking discriminated union. Error message says "required field missing" but doesn't mention it's model-specific.
**Why it happens:** Zod's refine/superRefine only runs after base schema passes. Discriminated union with .and() evaluates sequentially.
**How to avoid:**
- Make model-specific fields optional in base type, required in discriminated variants
- Use .and() to merge schemas (both must validate independently)
- Test validation errors: folder with model='nano-banana-pro' missing resolution should say "resolution required for nano-banana-pro"
- Check error messages reference model field for clarity
**Warning signs:** Generic "Invalid type" errors without model context. Users confused about which fields are required. Validation fails before checking discriminator.

### Pitfall 5: CHECK Constraint Drift from TypeScript ModelId Type
**What goes wrong:** TypeScript ModelId type includes 'flux-1-pro', but database CHECK constraint only allows 'nano-banana-pro' and 'seedream-4.5-edit'. INSERT fails with constraint violation.
**Why it happens:** Adding new model to TypeScript types without updating database constraints. Two sources of truth drift.
**How to avoid:**
- Update CHECK constraint in same PR/commit as ModelId type change
- Create migration that adds new model to CHECK constraint: ALTER TABLE jobs DROP CONSTRAINT check_jobs_model, ADD CONSTRAINT check_jobs_model CHECK (model IN ('nano-banana-pro', 'seedream-4.5-edit', 'flux-1-pro'))
- Add integration test: INSERT job with each ModelId value should succeed
- Document: "When adding new model, update 3 places: ModelId type, CHECK constraints, strategy factory"
**Warning signs:** 500 errors during job creation with "constraint violation" in logs. New model works in dev (no DB constraint) but fails in production. TypeScript compiles but runtime INSERT fails.

### Pitfall 6: Nullable Model-Specific Columns Allow Invalid Combinations
**What goes wrong:** Generation with model='nano-banana-pro' has quality='high' (Seedream field). Database allows it because quality column is nullable. Cost estimation uses wrong pricing.
**Why it happens:** Making model-specific columns nullable for flexibility. Not enforcing mutual exclusivity at database level.
**How to avoid:**
- Accept that quality/image_size columns are nullable—this is correct for flexibility
- Enforce mutual exclusivity in application code: if model='nano-banana-pro', quality/image_size must be NULL
- Add Zod validation in FolderOperationSchema (discriminated union handles this)
- Alternatively: Add CHECK constraint: CHECK ((model = 'nano-banana-pro' AND quality IS NULL) OR (model = 'seedream-4.5-edit' AND resolution IS NULL))
- Trade-off: Complex CHECK constraints make adding third model harder
**Warning signs:** Generation records have both resolution='2K' and quality='high'. Cost estimation throws "invalid tier" errors. Queue manager confused about which params to send to API.

### Pitfall 7: Not Indexing model Column Causes Slow Cost Aggregation
**What goes wrong:** Admin dashboard shows cost breakdown per model. Query scans entire generations table (100k rows) to SUM(estimated_cost) GROUP BY model. Takes 5+ seconds.
**Why it happens:** Adding model column but forgetting index. PostgreSQL falls back to sequential scan.
**How to avoid:**
- Always add index when adding filterable column: CREATE INDEX idx_generations_model ON generations(model)
- Add composite index if frequently querying by model + state: CREATE INDEX idx_generations_model_state ON generations(model, state)
- Test with EXPLAIN ANALYZE: SELECT model, COUNT(*) FROM generations GROUP BY model
- Verify query uses index scan, not sequential scan
**Warning signs:** Dashboard queries take >1 second with 10k+ generations. PostgreSQL logs show sequential scans. pg_stat_statements shows high execution time for GROUP BY model queries.

## Code Examples

Verified patterns from official sources:

### Complete Database Migration
```sql
-- Source: PostgreSQL ALTER TABLE best practices
-- https://www.postgresql.org/docs/current/ddl-alter.html
-- https://dev.to/bajena/manage-postgresql-default-column-values-with-rails-without-downtime-401

-- Migration: 002_add_model_fields.sql
-- Purpose: Add model selection and model-specific parameters to jobs and generations
-- Safe for production: Uses constant defaults (PG 11+ optimization)

BEGIN;

-- ================================================================
-- STEP 1: Add model columns with constant defaults (zero downtime)
-- ================================================================

-- Add model to jobs table (parent job default model)
ALTER TABLE jobs
ADD COLUMN model TEXT NOT NULL DEFAULT 'nano-banana-pro';

-- Add model to generations table (actual model used for each generation)
ALTER TABLE generations
ADD COLUMN model TEXT NOT NULL DEFAULT 'nano-banana-pro';

-- Add Seedream-specific columns to generations (nullable, optional)
ALTER TABLE generations
ADD COLUMN quality TEXT CHECK (quality IS NULL OR quality IN ('basic', 'high')),
ADD COLUMN image_size TEXT;

-- ================================================================
-- STEP 2: Add validation constraints
-- ================================================================

-- Enforce valid ModelId values at database level
ALTER TABLE jobs
ADD CONSTRAINT check_jobs_model CHECK (model IN ('nano-banana-pro', 'seedream-4.5-edit'));

ALTER TABLE generations
ADD CONSTRAINT check_generations_model CHECK (model IN ('nano-banana-pro', 'seedream-4.5-edit'));

-- ================================================================
-- STEP 3: Create indexes for efficient queries
-- ================================================================

-- Enable fast filtering by model (cost aggregation, analytics)
CREATE INDEX idx_jobs_model ON jobs(model);
CREATE INDEX idx_generations_model ON generations(model);

-- Composite index for common query pattern (model + state)
CREATE INDEX idx_generations_model_state ON generations(model, state);

-- GIN index for JSONB queries on parsed_job.job.folders
CREATE INDEX idx_jobs_parsed_job_gin ON jobs USING GIN (parsed_job);

-- ================================================================
-- STEP 4: Backfill parsed_job JSONB (OPTIONAL)
-- Only needed if cost estimation reads from parsed_job directly
-- If reading from jobs.model or generations.model, skip this
-- ================================================================

-- Add model field to each folder operation in parsed_job.job.folders array
DO $$
DECLARE
  batch_size INT := 100;
  rows_updated INT;
BEGIN
  RAISE NOTICE 'Starting JSONB backfill for parsed_job.job.folders[].model';

  LOOP
    -- Update jobs in batches
    WITH batch AS (
      SELECT id, parsed_job
      FROM jobs
      WHERE parsed_job->'job'->'folders' IS NOT NULL
      AND jsonb_array_length(parsed_job->'job'->'folders') > 0
      AND NOT (parsed_job->'job'->'folders'->0 ? 'model') -- Missing model field
      LIMIT batch_size
    )
    UPDATE jobs j
    SET parsed_job = jsonb_set(
      j.parsed_job,
      ARRAY['job', 'folders'],
      (
        SELECT jsonb_agg(
          jsonb_set(
            folder,
            '{model}',
            to_jsonb(COALESCE(j.model, 'nano-banana-pro'))
          )
        )
        FROM jsonb_array_elements(j.parsed_job->'job'->'folders') AS folder
      )
    )
    FROM batch
    WHERE j.id = batch.id;

    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    EXIT WHEN rows_updated = 0;

    RAISE NOTICE 'Updated % jobs', rows_updated;

    -- Throttle to prevent lock contention
    PERFORM pg_sleep(0.1);
  END LOOP;

  RAISE NOTICE 'JSONB backfill complete';
END $$;

COMMIT;

-- ================================================================
-- VERIFICATION QUERIES
-- ================================================================

-- Verify all jobs have model field
-- SELECT COUNT(*) FROM jobs WHERE model IS NULL; -- Should return 0

-- Verify all existing jobs defaulted to nano-banana-pro
-- SELECT model, COUNT(*) FROM jobs GROUP BY model;

-- Verify indexes exist
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename IN ('jobs', 'generations') AND indexname LIKE '%model%';

-- Verify JSONB structure (if backfilled)
-- SELECT parsed_job->'job'->'folders'->0->'model' FROM jobs LIMIT 5;
```

### Updated TypeScript Types with Model-Specific Fields
```typescript
// Source: Phase 7 ModelId type + Phase 8 database schema
// lib/types/generation.ts - MODIFIED for Phase 8

import { ParsedJob, AspectRatio } from './job';
import { ModelId } from '@/lib/models/types';

// Generation state machine (unchanged)
export enum GenerationState {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

// Generation job input to queue (in-memory representation)
export interface GenerationJob {
  id: string; // UUID
  jobId: string; // Parent job UUID
  folderPath: string;
  operation: string; // The prompt text
  model: ModelId; // Model to use for this generation
  aspectRatio: AspectRatio;
  photoMode: 'reference' | 'analysis';
  outputFormat: 'PNG' | 'JPG';
  referenceImageUrls: string[]; // Supabase storage URLs
  sourceFileName: string; // Original file being processed

  // Nano Banana Pro specific (only present when model='nano-banana-pro')
  resolution?: '1K' | '2K' | '4K';

  // Seedream specific (only present when model='seedream-4.5-edit')
  quality?: 'basic' | 'high';
  imageSize?: string;
}

// Generation record (database row) - matches migrations/002_add_model_fields.sql
export interface GenerationRecord {
  id: string; // UUID
  job_id: string; // FK to jobs table
  folder_path: string;
  operation: string;
  state: GenerationState;
  model: ModelId; // NEW: Model used for this generation (NOT NULL)
  task_id: string | null; // kie.ai taskId after submission
  result_url: string | null; // kie.ai result after completion
  source_file_name: string;
  reference_image_urls: string[]; // JSON array in DB

  // Model-specific fields (nullable)
  resolution: string | null; // Nano Banana only
  aspect_ratio: string;
  photo_mode: string;
  quality: string | null; // NEW: Seedream only
  image_size: string | null; // NEW: Seedream only

  error_message: string | null;
  retry_count: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

// Job record (parent job database row) - matches migrations/002_add_model_fields.sql
export interface JobRecord {
  id: string; // UUID
  session_id: string; // Links to upload session
  parsed_job: ParsedJob; // JSON - the ParsedJob from Phase 2
  model: ModelId; // NEW: Default model for this job (NOT NULL)
  total_generations: number;
  completed_generations: number;
  failed_generations: number;
  state: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  estimated_cost: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

// Enhanced generation status for UI display
export interface GenerationStatus {
  id: string;
  state: GenerationState;
  taskId: string | null;
  resultUrl: string | null;
  sourceFileName: string;
  folderPath: string;
  model: ModelId; // NEW: Display which model was used
  retryCount: number;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded COST_PER_IMAGE constant | Query strategy.capabilities.costPerGeneration | Phase 8 (2026-01) | Dynamic pricing per model, centralizes pricing with model implementation |
| Model inference from parameters | Explicit model field in DB | Phase 8 (2026-01) | Single source of truth, enables per-folder model selection in future phases |
| Single UPDATE for backfill | Batched DO block with pg_sleep | 2020-present | Zero-downtime migrations, prevents lock contention |
| Manual if/else type narrowing | Zod discriminated unions | Zod 3.0+ (2020) | Automatic type narrowing, O(1) validation, compile-time safety |
| Volatile defaults in ADD COLUMN | Constant defaults (PG 11+) | PostgreSQL 11 (2018) | Metadata-only operation, no table rewrite, instant migration |
| Separate columns per model param | JSONB for parsed_job + typed columns | 2014 (PG 9.4 JSONB) | Schema evolution without breaking changes, hybrid approach (JSONB for flexibility, columns for performance) |

**Deprecated/outdated:**
- **Single-model assumptions:** Hardcoded 'nano-banana-pro' strings. Use ModelId type and model field.
- **Hardcoded pricing tables:** COST_PER_IMAGE constant in cost-estimation.ts. Query strategy.capabilities.costPerGeneration.
- **Inferring model from parameters:** "If resolution exists, must be Nano." Explicit model field is source of truth.
- **Manual type narrowing:** if/else checks with 'as' casts. Use discriminated unions for automatic narrowing.

## Open Questions

Things that couldn't be fully resolved:

1. **JSONB Backfill Necessity**
   - What we know: parsed_job JSONB can be updated to include model in folders array using jsonb_set
   - What's unclear: Is this necessary? Cost estimation could read from jobs.model or generations.model instead of parsed_job
   - Recommendation: Make JSONB backfill optional in migration (wrap in conditional DO block). Only run if application code requires it. Prefer reading from typed columns (jobs.model, generations.model) for performance and simplicity.

2. **Model Field on Jobs vs Generations Table**
   - What we know: Phase 7 research recommended storing model on both tables
   - What's unclear: Is jobs.model used, or is generations.model authoritative?
   - Recommendation: Store on both. jobs.model = default for job (used by cost estimation), generations.model = actual model used (source of truth for execution). Generation-level field enables per-folder models in Phase 10.

3. **Migration Rollback Strategy**
   - What we know: Supabase migrations support automatic rollback on failure
   - What's unclear: How to manually rollback if needed (DROP COLUMN loses data)
   - Recommendation: Migrations are forward-only. To rollback: deploy old code that ignores model column, backfill missing data if needed, then DROP COLUMN in new migration. Test rollback procedure in staging before production deployment.

4. **Third Model Addition Process**
   - What we know: Adding third model requires updating ModelId type, CHECK constraints, factory, strategies
   - What's unclear: Can this be done without migration, or does CHECK constraint need updating?
   - Recommendation: CHECK constraint must be updated via migration: ALTER TABLE jobs DROP CONSTRAINT check_jobs_model, ADD CONSTRAINT check_jobs_model CHECK (model IN (...new list...)). Document: "Adding model = 1 code PR + 1 migration PR."

5. **Cost Estimation During Transition**
   - What we know: Cost estimation must handle jobs created before Phase 8 (no model field in parsed_job)
   - What's unclear: What happens when calculateCostEstimate receives FolderOperation without model field?
   - Recommendation: Zod schema defaults model to 'nano-banana-pro', so parse will add it automatically. If bypassing Zod (raw DB read), add fallback: const model = folder.model || 'nano-banana-pro'.

## Sources

### Primary (HIGH confidence)
- [PostgreSQL ALTER TABLE documentation](https://www.postgresql.org/docs/current/ddl-alter.html) - Official docs for schema changes
- [PostgreSQL ALTER TABLE ADD COLUMN optimization](https://www.cybertec-postgresql.com/en/postgresql-alter-table-add-column-done-right/) - PG 11+ constant default optimization
- [Zod discriminated unions API](https://zod.dev/api) - Official Zod documentation
- [Parsing Discriminated Unions with Zod](https://timkapitein.nl/blog/parsing-discriminated-unions-with-zod) - Practical examples and patterns
- [Supabase Database Migrations](https://supabase.com/docs/guides/deployment/database-migrations) - Official migration best practices
- Existing codebase: supabase/migrations/001_jobs_and_generations.sql, lib/models/types.ts - Verified working schema

### Secondary (MEDIUM confidence)
- [Zero-Downtime PostgreSQL JSONB Migration](https://medium.com/@shinyjai2011/zero-downtime-postgresql-jsonb-migration-a-practical-guide-for-scalable-schema-evolution-9f74124ef4a1) - Batched backfill patterns
- [PostgreSQL backfill existing data](https://code.jjb.cc/how-to-create-a-new-column-in-postgres-with-existing-rows-backfilled-with-a-different-value-from-the-default) - Backfill different values strategy
- [Postgres default values as backfill method](https://ylan.segal-family.com/blog/2024/10/17/postgres-default-values-as-a-backfill-method/) - PG 11+ optimization explanation
- [Manage PostgreSQL default column values without downtime](https://dev.to/bajena/manage-postgresql-default-column-values-with-rails-without-downtime-401) - Production migration patterns
- [Zod conditional validation discussion](https://github.com/colinhacks/zod/discussions/2099) - Community patterns for conditional validation

### Tertiary (LOW confidence)
- WebSearch results for "PostgreSQL JSONB schema evolution 2026" - Multiple sources agree on jsonb_set approach
- WebSearch results for "Zod refine superRefine conditional validation 2026" - Community patterns, need verification in practice

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Using existing PostgreSQL, Zod, Supabase. No new dependencies.
- Database migration: HIGH - PostgreSQL 11+ constant default optimization is well-documented, verified across multiple sources.
- Discriminated unions: HIGH - Official Zod feature with extensive documentation and examples.
- Cost estimation: HIGH - Strategy Pattern from Phase 7 provides capabilities interface, straightforward to query.
- JSONB backfill: MEDIUM - Pattern is well-documented, but optional nature means less critical path.
- Backward compatibility: HIGH - Constant defaults ensure v1.0 jobs continue working without code changes.

**Research date:** 2026-01-26
**Valid until:** 2026-02-26 (30 days - PostgreSQL and Zod APIs are stable, migration patterns are evergreen)
