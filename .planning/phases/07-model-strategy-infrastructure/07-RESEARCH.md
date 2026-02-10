# Phase 7: Model Strategy Infrastructure - Research

**Researched:** 2026-01-26
**Domain:** Multi-model abstraction and API client strategy pattern
**Confidence:** HIGH

## Summary

Phase 7 implements a Strategy Pattern abstraction layer to support multiple image generation models (Nano Banana Pro and Seedream 4.5 Edit) without disrupting v1.0 functionality. The research identified TypeScript interfaces as the appropriate abstraction mechanism (not heavyweight frameworks like Vercel AI SDK), with discriminated unions in Zod for runtime parameter validation and JSONB columns for flexible model-specific storage.

The core challenge is routing generation requests to different kie.ai models while maintaining backward compatibility with existing Nano Banana Pro jobs. Each model has distinct parameters (Nano: resolution 1K/2K/4K + output_format, Seedream: quality basic/high) and capabilities (Nano: 8 max refs, Seedream: 14 max refs). The Strategy Pattern isolates these differences into swappable implementations.

Database migration strategy follows PostgreSQL best practices: add nullable `model` column with default 'nano-banana-pro', backfill existing records in batches, then make non-null. This enables zero-downtime deployment while ensuring all existing v1.0 jobs continue working.

**Primary recommendation:** Use lightweight TypeScript Strategy Pattern (3 files, ~200 LOC), Zod discriminated unions for conditional validation (z.discriminatedUnion on model field), and single migration with batched backfill for the model column. Avoid heavyweight abstraction libraries—they add complexity without benefit for 2-model use case.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript native interfaces | 5.x | Strategy Pattern implementation | No external dependency needed, excellent type inference, compile-time safety, zero runtime overhead |
| Zod discriminated unions | 3.24.1 | Runtime validation of model-specific params | Already in project, O(1) lookup performance, excellent TypeScript integration, first-class discriminated union support |
| PostgreSQL JSONB | Current (Supabase) | Model-specific parameter storage | Already integrated, flexible schema evolution, indexable with GIN indexes, supports partial updates |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pg-sql (via Supabase) | Current | Batched migration backfill | For safe data migration without locking tables |
| Supabase RPC functions | Current | Atomic model field updates | When migrating existing jobs to include model identifier |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Strategy Pattern (interfaces) | Vercel AI SDK | AI SDK designed for LLMs (streaming, tool calling), not image generation. Adds 50+ packages for features we don't need. Overkill for 2 models. |
| Strategy Pattern (interfaces) | ModelFusion | Same issue—orchestrates complex multi-modal workflows. We need simple HTTP client abstraction. Would add unnecessary complexity. |
| Zod discriminated unions | Manual if/else validation | Discriminated unions provide O(1) lookup vs O(n) sequential checks. Type safety lost with manual validation. |
| JSONB for model params | Separate columns per param | JSONB allows schema evolution without migrations. Separate columns require ALTER TABLE for each new model parameter. |
| Single migration | Dual-write pattern | Dual-write adds complexity for single-column addition. Only needed for high-traffic renames or complex transformations. |

**Installation:**
```bash
# No new dependencies required - using existing stack
# Zod already installed: ^3.24.1
# TypeScript already configured: ^5.x
# Supabase client already integrated
```

## Architecture Patterns

### Recommended Project Structure
```
lib/
├── models/
│   ├── types.ts                    # ModelStrategy interface, ModelCapabilities
│   ├── nano-banana-strategy.ts     # Nano Banana Pro implementation
│   ├── seedream-strategy.ts        # Seedream 4.5 Edit implementation
│   └── model-factory.ts            # Factory to get strategy by model ID
├── queue/
│   ├── generation-queue.ts         # MODIFIED: Use model strategy instead of direct API
│   └── kie-api-client.ts           # DEPRECATED: Move logic into strategies
├── ai/schemas/
│   └── job.ts                      # MODIFIED: Add model field with discriminated union
└── types/
    └── generation.ts               # MODIFIED: Add model field to GenerationJob/Record
```

### Pattern 1: Strategy Pattern for Model Abstraction
**What:** Define common interface for model operations, implement per-model strategies, swap at runtime based on model field.
**When to use:** Multiple providers with different APIs but similar use cases (all generate images from prompts + references).
**Example:**
```typescript
// Source: TypeScript Strategy Pattern best practices
// https://refactoring.guru/design-patterns/strategy/typescript/example

// lib/models/types.ts
export type ModelId = 'nano-banana-pro' | 'seedream-4.5-edit';

export interface ModelCapabilities {
  id: ModelId;
  displayName: string;
  maxReferenceImages: number; // Nano: 8, Seedream: 14
  supportedAspectRatios: string[];
  costPerGeneration: Record<string, number>; // By resolution/quality
}

export interface ModelGenerationParams {
  prompt: string;
  referenceImages: string[]; // URLs
  aspectRatio: string;
}

export interface ModelStrategy {
  readonly capabilities: ModelCapabilities;

  // Create kie.ai task, returns taskId
  createTask(params: ModelGenerationParams): Promise<string>;

  // Poll for task completion, returns result URL
  pollTask(taskId: string): Promise<{ resultUrl: string }>;

  // Validate model-specific parameters before API call
  validateParams(params: ModelGenerationParams): void;

  // Build kie.ai API payload (model-specific structure)
  buildPayload(params: ModelGenerationParams): unknown;
}

// lib/models/nano-banana-strategy.ts
import { createKieAITask, pollTaskCompletion } from '@/lib/queue/kie-api-client';

export class NanoBananaStrategy implements ModelStrategy {
  readonly capabilities: ModelCapabilities = {
    id: 'nano-banana-pro',
    displayName: 'Nano Banana Pro',
    maxReferenceImages: 8,
    supportedAspectRatios: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9', 'auto'],
    costPerGeneration: {
      '1K': 0.134,
      '2K': 0.134,
      '4K': 0.24,
    },
  };

  async createTask(params: ModelGenerationParams & { resolution: '1K' | '2K' | '4K'; outputFormat: 'png' | 'jpg' }): Promise<string> {
    this.validateParams(params);

    const payload = {
      model: 'nano-banana-pro' as const,
      input: {
        prompt: params.prompt,
        image_input: params.referenceImages.slice(0, this.capabilities.maxReferenceImages),
        aspect_ratio: params.aspectRatio,
        resolution: params.resolution,
        output_format: params.outputFormat,
      },
    };

    // Reuse existing retry logic
    return createKieAITask(payload);
  }

  async pollTask(taskId: string): Promise<{ resultUrl: string }> {
    // Reuse existing polling logic
    return pollTaskCompletion(taskId);
  }

  validateParams(params: ModelGenerationParams & { resolution?: string }): void {
    if (!params.resolution || !['1K', '2K', '4K'].includes(params.resolution)) {
      throw new Error(`Nano Banana Pro requires resolution: 1K, 2K, or 4K. Got: ${params.resolution}`);
    }
    if (params.referenceImages.length > this.capabilities.maxReferenceImages) {
      throw new Error(`Nano Banana Pro supports max ${this.capabilities.maxReferenceImages} reference images. Got: ${params.referenceImages.length}`);
    }
  }

  buildPayload(params: ModelGenerationParams): unknown {
    // Used for cost estimation, testing
    return {
      model: 'nano-banana-pro',
      input: {
        prompt: params.prompt,
        image_input: params.referenceImages,
        aspect_ratio: params.aspectRatio,
      },
    };
  }
}

// lib/models/seedream-strategy.ts
export class SeedreamStrategy implements ModelStrategy {
  readonly capabilities: ModelCapabilities = {
    id: 'seedream-4.5-edit',
    displayName: 'Seedream 4.5 Edit',
    maxReferenceImages: 14,
    supportedAspectRatios: ['square', 'square_hd', 'portrait_4_3', 'portrait_3_2', 'portrait_16_9', 'landscape_4_3', 'landscape_3_2', 'landscape_16_9', 'landscape_21_9'],
    costPerGeneration: {
      'basic': 0.032,  // 2K equivalent
      'high': 0.032,   // 4K equivalent (same price per kie.ai)
    },
  };

  async createTask(params: ModelGenerationParams & { quality: 'basic' | 'high'; imageSize: string }): Promise<string> {
    this.validateParams(params);

    const payload = {
      model: 'seedream/4.5-edit' as const,
      input: {
        prompt: params.prompt,
        image_urls: params.referenceImages.slice(0, this.capabilities.maxReferenceImages),
        image_size: params.imageSize, // e.g., 'landscape_16_9'
        image_resolution: params.quality, // 'basic' or 'high'
      },
    };

    // Use adapted createKieAITask (supports multiple model payloads)
    return createKieAITask(payload);
  }

  async pollTask(taskId: string): Promise<{ resultUrl: string }> {
    return pollTaskCompletion(taskId);
  }

  validateParams(params: ModelGenerationParams & { quality?: string; imageSize?: string }): void {
    if (!params.quality || !['basic', 'high'].includes(params.quality)) {
      throw new Error(`Seedream 4.5 Edit requires quality: basic or high. Got: ${params.quality}`);
    }
    if (params.referenceImages.length > this.capabilities.maxReferenceImages) {
      throw new Error(`Seedream 4.5 Edit supports max ${this.capabilities.maxReferenceImages} reference images. Got: ${params.referenceImages.length}`);
    }
  }

  buildPayload(params: ModelGenerationParams): unknown {
    return {
      model: 'seedream/4.5-edit',
      input: {
        prompt: params.prompt,
        image_urls: params.referenceImages,
        image_size: 'landscape_16_9', // Default for estimation
      },
    };
  }
}

// lib/models/model-factory.ts
export function getModelStrategy(modelId: ModelId): ModelStrategy {
  switch (modelId) {
    case 'nano-banana-pro':
      return new NanoBananaStrategy();
    case 'seedream-4.5-edit':
      return new SeedreamStrategy();
    default:
      throw new Error(`Unknown model: ${modelId}`);
  }
}
```

### Pattern 2: Zod Discriminated Union for Model-Specific Parameters
**What:** Use Zod's discriminatedUnion to conditionally validate parameters based on model field. O(1) lookup performance.
**When to use:** Runtime validation where different variants require different fields (Nano needs resolution, Seedream needs quality).
**Example:**
```typescript
// Source: Zod discriminated unions documentation
// https://zod.dev/api + https://timkapitein.nl/blog/parsing-discriminated-unions-with-zod

// lib/ai/schemas/job.ts - MODIFIED for v2.0

// Nano Banana Pro specific params
const NanoBananaParamsSchema = z.object({
  model: z.literal('nano-banana-pro'),
  resolution: z.enum(['1K', '2K', '4K']),
  outputFormat: z.enum(['PNG', 'JPG', 'png', 'jpg'])
    .transform(val => val.toUpperCase() as 'PNG' | 'JPG')
    .default('PNG'),
});

// Seedream 4.5 Edit specific params
const SeedreamParamsSchema = z.object({
  model: z.literal('seedream-4.5-edit'),
  quality: z.enum(['basic', 'high']).describe('basic=2K, high=4K'),
  imageSize: z.enum([
    'square', 'square_hd',
    'portrait_4_3', 'portrait_3_2', 'portrait_16_9',
    'landscape_4_3', 'landscape_3_2', 'landscape_16_9', 'landscape_21_9'
  ]).default('landscape_16_9'),
});

// Discriminated union based on 'model' field
const ModelSpecificParamsSchema = z.discriminatedUnion('model', [
  NanoBananaParamsSchema,
  SeedreamParamsSchema,
]);

// Updated FolderOperationSchema (v2.0)
export const FolderOperationSchema = z.object({
  folderPath: z.string(),
  operation: z.string(),
  excludedFiles: z.array(z.string()).optional(),
  photoMode: PhotoModeSchema,
  aspectRatio: AspectRatioSchema,
  generationCount: z.number().int().min(1).max(100).optional(),
})
.and(ModelSpecificParamsSchema); // Merge in model-specific params

// Usage example - Zod automatically validates based on model field
const nanoBananaFolder = FolderOperationSchema.parse({
  folderPath: '5',
  operation: 'make it blue',
  model: 'nano-banana-pro',
  resolution: '2K', // ✅ Valid for Nano
  // quality: 'high', // ❌ Would fail - not allowed for Nano
  aspectRatio: '16:9',
  photoMode: 'reference',
});

const seedreamFolder = FolderOperationSchema.parse({
  folderPath: '6',
  operation: 'enhance lighting',
  model: 'seedream-4.5-edit',
  quality: 'high', // ✅ Valid for Seedream
  imageSize: 'landscape_16_9',
  // resolution: '2K', // ❌ Would fail - not allowed for Seedream
  aspectRatio: '16:9',
  photoMode: 'reference',
});
```

### Pattern 3: Backward Compatible Database Migration with Batched Backfill
**What:** Add model column with default value, backfill existing records in batches to avoid table locks, make column non-null after backfill completes.
**When to use:** Adding required fields to large tables without downtime.
**Example:**
```sql
-- Source: PostgreSQL migration best practices
-- https://fly.io/phoenix-files/backfilling-data/
-- https://blog.appsignal.com/2024/03/20/good-database-migration-practices

-- Migration: 002_add_model_field.sql

-- Step 1: Add nullable column with default
-- Safe: Does not lock table for long, default is instantly applied
ALTER TABLE generations
ADD COLUMN model TEXT DEFAULT 'nano-banana-pro';

ALTER TABLE jobs
ADD COLUMN model TEXT DEFAULT 'nano-banana-pro';

-- Step 2: Backfill existing NULL values (if any)
-- Safe: Batched updates prevent long locks
DO $$
DECLARE
  batch_size INT := 1000;
  rows_updated INT;
BEGIN
  LOOP
    -- Update in batches to prevent table lock
    UPDATE generations
    SET model = 'nano-banana-pro'
    WHERE model IS NULL
    AND id IN (
      SELECT id FROM generations
      WHERE model IS NULL
      LIMIT batch_size
    );

    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    EXIT WHEN rows_updated = 0;

    -- Small delay to allow concurrent operations
    PERFORM pg_sleep(0.1);
  END LOOP;
END $$;

-- Repeat for jobs table
DO $$
DECLARE
  batch_size INT := 1000;
  rows_updated INT;
BEGIN
  LOOP
    UPDATE jobs
    SET model = 'nano-banana-pro'
    WHERE model IS NULL
    AND id IN (
      SELECT id FROM jobs
      WHERE model IS NULL
      LIMIT batch_size
    );

    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    EXIT WHEN rows_updated = 0;
    PERFORM pg_sleep(0.1);
  END LOOP;
END $$;

-- Step 3: Make column non-null and add constraint
-- Safe: All rows have values now, no validation needed
ALTER TABLE generations
ALTER COLUMN model SET NOT NULL,
ADD CONSTRAINT check_generations_model CHECK (model IN ('nano-banana-pro', 'seedream-4.5-edit'));

ALTER TABLE jobs
ALTER COLUMN model SET NOT NULL,
ADD CONSTRAINT check_jobs_model CHECK (model IN ('nano-banana-pro', 'seedream-4.5-edit'));

-- Step 4: Add index for model-based queries
CREATE INDEX idx_generations_model ON generations(model);
CREATE INDEX idx_jobs_model ON jobs(model);

-- Step 5: Update parsed_job JSONB to include model in folders
-- This is application-layer responsibility, but add index for queries
CREATE INDEX idx_jobs_parsed_job_folders ON jobs USING GIN ((parsed_job->'job'->'folders'));
```

### Pattern 4: Model-Aware Queue Processing
**What:** Queue manager uses model factory to get correct strategy, routes generation through strategy's createTask/pollTask.
**When to use:** Executing generations with model-specific API requirements.
**Example:**
```typescript
// Source: Adapted from existing generation-queue.ts

// lib/queue/generation-queue.ts - MODIFIED for v2.0
import { getModelStrategy } from '@/lib/models/model-factory';
import type { GenerationJob } from '@/lib/types/generation';

export async function executeGeneration(job: GenerationJob): Promise<GenerationResult> {
  // Get the appropriate strategy for this generation's model
  const strategy = getModelStrategy(job.model);

  // Validate reference image count against model's limit
  if (job.referenceImageUrls.length > strategy.capabilities.maxReferenceImages) {
    console.warn(
      `[Queue] Slicing references from ${job.referenceImageUrls.length} to ${strategy.capabilities.maxReferenceImages} for ${job.model}`
    );
    job.referenceImageUrls = job.referenceImageUrls.slice(0, strategy.capabilities.maxReferenceImages);
  }

  // Build model-specific parameters
  let taskParams: any = {
    prompt: job.operation,
    referenceImages: job.referenceImageUrls,
    aspectRatio: job.aspectRatio,
  };

  // Add model-specific fields
  if (job.model === 'nano-banana-pro') {
    taskParams.resolution = job.resolution;
    taskParams.outputFormat = job.outputFormat?.toLowerCase() || 'png';
  } else if (job.model === 'seedream-4.5-edit') {
    taskParams.quality = job.quality || 'basic';
    taskParams.imageSize = job.imageSize || 'landscape_16_9';
  }

  // Validate parameters using strategy
  strategy.validateParams(taskParams);

  // Create task using strategy
  const taskId = await strategy.createTask(taskParams);

  // Update database with taskId
  await updateGenerationTaskId(job.id, taskId);

  // Poll for completion using strategy
  const result = await strategy.pollTask(taskId);

  return {
    generationId: job.id,
    taskId,
    resultUrl: result.resultUrl,
    state: 'completed',
  };
}
```

### Anti-Patterns to Avoid
- **Creating strategy instances per request:** Strategy objects are stateless—create once and reuse. Instantiating per-generation wastes memory.
- **Embedding model logic in if/else chains:** This defeats the Strategy Pattern. Use factory + polymorphism instead.
- **Not defaulting model field in migration:** If migration adds column without default, existing code breaks until all rows backfilled. Always use DEFAULT.
- **Hard-coding model IDs in business logic:** Use strategy.capabilities.id instead of string literals. Enables type safety and refactoring.
- **Mixing model-specific validation in shared code:** Keep validation in strategy implementations. Shared code should be model-agnostic.
- **Backfilling all rows in single transaction:** Locks table for duration of backfill. Use batched updates with pg_sleep between batches.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multi-provider API abstraction | Custom switch statement in API client | Strategy Pattern with factory | Violates Open/Closed Principle. Adding 3rd model requires modifying existing code. Strategy Pattern = add new class, zero changes to existing code. |
| Runtime parameter validation by model | Manual if/else checking params | Zod discriminated union | Discriminated union provides O(1) lookup vs O(n) checks, automatic type narrowing, compile-time safety. Manual validation loses type information. |
| Conditional TypeScript types by model field | Union types with manual narrowing | Discriminated union (TS built-in) | TypeScript's discriminated unions provide automatic type narrowing after checking discriminant field. Manual unions require 'as' casts or type guards everywhere. |
| Database column backfill | Single UPDATE statement | Batched updates with pg_sleep | Single UPDATE locks table for entire operation. Batched updates allow concurrent reads/writes, spread load over time. |
| Model capability lookup | Hardcoded constants per model | ModelCapabilities interface on strategy | Capabilities (max refs, cost, aspect ratios) belong with model implementation. Centralizing in strategy object makes them queryable at runtime. |

**Key insight:** The Strategy Pattern exists specifically for this use case—runtime algorithm selection without conditional logic pollution. TypeScript's discriminated unions and Zod's discriminatedUnion are designed for exactly this pattern. Using them is not over-engineering; manually replicating them is under-utilizing the language.

## Common Pitfalls

### Pitfall 1: Breaking Existing Jobs by Not Defaulting Model Field
**What goes wrong:** Adding `model` column without DEFAULT causes existing generation records to have NULL model. When queue processes them, factory throws "Unknown model: null".
**Why it happens:** Assuming existing rows will be backfilled instantly. Backfill is async—there's a window where new code runs on old data.
**How to avoid:**
- Always use DEFAULT when adding new required columns
- Set default to most common/existing model ('nano-banana-pro')
- Validate default matches existing behavior (v1.0 used Nano exclusively)
- Test migration on copy of production data
**Warning signs:** Errors in queue processing after migration. NULL pointer exceptions when accessing model field. Job creation fails with validation error.

### Pitfall 2: Hardcoding Model IDs Throughout Codebase
**What goes wrong:** Using string literals 'nano-banana-pro' everywhere couples code to specific models. Adding third model requires find-replace across codebase.
**Why it happens:** Convenience—typing strings is faster than importing types. Lack of foresight about adding models.
**How to avoid:**
- Define `ModelId` type alias: `type ModelId = 'nano-banana-pro' | 'seedream-4.5-edit'`
- Use enum or const object for model IDs if prefer named exports
- Access via strategy.capabilities.id in generic code
- Enable TypeScript strict mode to catch string mismatches
**Warning signs:** Multiple files contain model ID strings. grep for 'nano-banana' returns 50+ results. Adding new model requires touching unrelated files.

### Pitfall 3: Violating Interface Segregation with Fat Interface
**What goes wrong:** ModelStrategy interface includes methods only some models support (e.g., setQuality() only for Seedream). Nano implementation throws "Not supported".
**Why it happens:** Trying to capture all possible model features in one interface. Anticipating future models and adding methods preemptively.
**How to avoid:**
- Keep interface minimal—only operations ALL models support
- Model-specific methods belong in concrete class, not interface
- Use type guards if need to check: `if (strategy instanceof SeedreamStrategy)`
- Accept narrower types in functions that need specific models
**Warning signs:** Interface methods throw "Not implemented" errors. Methods have optional behavior or no-op implementations. Documentation says "only for X model".

### Pitfall 4: Not Slicing Reference Images to Model Limit
**What goes wrong:** Job has 10 reference images, sent to Nano Banana Pro (max 8). API returns 422 error "Too many references".
**Why it happens:** Validation happens at job creation with one model, but execution uses different model. User changes model after upload.
**How to avoid:**
- Always slice references in queue execution: `refs.slice(0, strategy.capabilities.maxReferenceImages)`
- Log warning when slicing occurs for debugging
- UI should prevent exceeding limit, but queue must enforce as backstop
- Store model on generation record, not just job—handles per-folder models later
**Warning signs:** 422 errors from kie.ai API. Reference image count inconsistent between creation and execution. Some generations fail while others succeed in same job.

### Pitfall 5: Forgetting to Migrate parsed_job JSONB
**What goes wrong:** Database model column updated to 'seedream-4.5-edit', but parsed_job JSONB still has old Nano parameters. Cost estimation reads JSONB, uses wrong pricing.
**Why it happens:** Two sources of truth—model column and parsed_job JSONB. Only one updated.
**How to avoid:**
- parsed_job is immutable snapshot of user's original request—don't modify
- Add model field to generations table as source of truth for execution
- Cost estimation reads model from job/generation record, not JSONB
- If must update JSONB, use JSONB update operation: `parsed_job = jsonb_set(...)`
**Warning signs:** Cost estimate doesn't match model selection. Job shows Seedream but charged Nano pricing. JSONB contains mismatched model and parameters.

### Pitfall 6: Strategy Pattern Causing Circular Dependencies
**What goes wrong:** model-factory imports strategies, strategies import kie-api-client, kie-api-client imports model-factory for retry logic. Circular dependency.
**Why it happens:** Mixing concerns—strategy knows HOW to call API, but API client handles retry/auth. Lines blur.
**How to avoid:**
- Strategies own entire API interaction (create task + poll)
- Extract shared retry logic into separate utility (p-retry wrapper)
- API client becomes thin adapter, strategies compose it
- Or inline API calls in strategies—only 2 models, duplication acceptable
**Warning signs:** Import order matters—moving imports breaks build. TypeScript complains about circular reference. Strategy can't import from queue/, queue/ can't import from models/.

### Pitfall 7: Not Handling Model-Specific Error Codes
**What goes wrong:** Seedream returns error code 'SEED_INVALID_QUALITY' which Nano strategy doesn't know. Retry logic treats as transient, wastes retries.
**Why it happens:** Error classification logic is shared, but error codes are model-specific.
**How to avoid:**
- Add classifyError() method to ModelStrategy interface
- Each strategy knows its own non-retryable error codes
- Shared p-retry wrapper calls strategy.classifyError() to decide throw AbortError
- Fallback: Unknown errors are retryable (fail-safe)
**Warning signs:** Retrying non-retryable errors (auth, invalid params). Logs show 5 retry attempts for error that can't succeed. Different models have different retry behavior for same HTTP status.

## Code Examples

Verified patterns from official sources:

### Complete Model Strategy Implementation
```typescript
// Source: TypeScript Strategy Pattern + kie.ai API docs
// https://refactoring.guru/design-patterns/strategy/typescript/example
// https://kie.ai/seedream-4-5

// lib/models/types.ts
export type ModelId = 'nano-banana-pro' | 'seedream-4.5-edit';

export interface ModelCapabilities {
  id: ModelId;
  displayName: string;
  maxReferenceImages: number;
  supportedAspectRatios: string[];
  costPerGeneration: Record<string, number>;
}

export interface ModelGenerationParams {
  prompt: string;
  referenceImages: string[];
  aspectRatio: string;
}

export interface ModelStrategy {
  readonly capabilities: ModelCapabilities;
  createTask(params: ModelGenerationParams): Promise<string>;
  pollTask(taskId: string): Promise<{ resultUrl: string }>;
  validateParams(params: ModelGenerationParams): void;
}

// lib/models/nano-banana-strategy.ts
import pRetry, { AbortError } from 'p-retry';

export class NanoBananaStrategy implements ModelStrategy {
  readonly capabilities: ModelCapabilities = {
    id: 'nano-banana-pro',
    displayName: 'Nano Banana Pro',
    maxReferenceImages: 8,
    supportedAspectRatios: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9', 'auto'],
    costPerGeneration: { '1K': 0.134, '2K': 0.134, '4K': 0.24 },
  };

  async createTask(params: ModelGenerationParams & { resolution: string; outputFormat: string }): Promise<string> {
    this.validateParams(params);

    return pRetry(
      async () => {
        const response = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.KIE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'nano-banana-pro',
            input: {
              prompt: params.prompt,
              image_input: params.referenceImages,
              aspect_ratio: params.aspectRatio,
              resolution: params.resolution,
              output_format: params.outputFormat,
            },
          }),
        });

        if ([401, 402, 422].includes(response.status)) {
          throw new AbortError(`Non-retryable: ${response.status}`);
        }

        if (!response.ok) {
          throw new Error(`Retryable: ${response.status}`);
        }

        const data = await response.json();
        return data.data.taskId;
      },
      { retries: 5, factor: 2, minTimeout: 1000, maxTimeout: 30000, randomize: true }
    );
  }

  async pollTask(taskId: string): Promise<{ resultUrl: string }> {
    return pRetry(
      async () => {
        const response = await fetch(
          `https://api.kie.ai/api/v1/playground/recordInfo?taskId=${taskId}`,
          { headers: { 'Authorization': `Bearer ${process.env.KIE_API_KEY}` } }
        );

        if (!response.ok) throw new Error(`Query failed: ${response.status}`);

        const data = await response.json();
        const { state, resultJson } = data.data;

        if (state === 'waiting' || state === 'processing') {
          throw new Error(`Task still ${state}`);
        }

        if (state === 'failed') {
          throw new AbortError('Task failed');
        }

        const parsed = JSON.parse(resultJson);
        const resultUrl = extractUrl(parsed);
        if (!resultUrl) throw new AbortError('No result URL');

        return { resultUrl };
      },
      { retries: 120, factor: 1.1, minTimeout: 3000, maxTimeout: 15000, randomize: true }
    );
  }

  validateParams(params: ModelGenerationParams & { resolution?: string }): void {
    if (!['1K', '2K', '4K'].includes(params.resolution || '')) {
      throw new Error(`Invalid resolution for Nano Banana Pro: ${params.resolution}`);
    }
    if (params.referenceImages.length > this.capabilities.maxReferenceImages) {
      throw new Error(`Too many references: ${params.referenceImages.length}, max ${this.capabilities.maxReferenceImages}`);
    }
  }
}

function extractUrl(obj: any): string | undefined {
  // Recursive URL extraction (reuse from existing kie-api-client.ts)
  if (typeof obj === 'string' && obj.startsWith('http')) return obj;
  if (Array.isArray(obj)) return obj.find(item => typeof item === 'string' && item.startsWith('http'));
  if (typeof obj === 'object') {
    for (const value of Object.values(obj)) {
      const url = extractUrl(value);
      if (url) return url;
    }
  }
  return undefined;
}

// lib/models/seedream-strategy.ts
export class SeedreamStrategy implements ModelStrategy {
  readonly capabilities: ModelCapabilities = {
    id: 'seedream-4.5-edit',
    displayName: 'Seedream 4.5 Edit',
    maxReferenceImages: 14,
    supportedAspectRatios: ['square', 'square_hd', 'portrait_4_3', 'portrait_3_2', 'portrait_16_9', 'landscape_4_3', 'landscape_3_2', 'landscape_16_9', 'landscape_21_9'],
    costPerGeneration: { 'basic': 0.032, 'high': 0.032 },
  };

  async createTask(params: ModelGenerationParams & { quality: string; imageSize: string }): Promise<string> {
    this.validateParams(params);

    return pRetry(
      async () => {
        const response = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.KIE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'seedream/4.5-edit',
            input: {
              prompt: params.prompt,
              image_urls: params.referenceImages,
              image_size: params.imageSize,
              image_resolution: params.quality,
            },
          }),
        });

        if ([401, 402, 422].includes(response.status)) {
          throw new AbortError(`Non-retryable: ${response.status}`);
        }

        if (!response.ok) {
          throw new Error(`Retryable: ${response.status}`);
        }

        const data = await response.json();
        return data.data.taskId;
      },
      { retries: 5, factor: 2, minTimeout: 1000, maxTimeout: 30000, randomize: true }
    );
  }

  async pollTask(taskId: string): Promise<{ resultUrl: string }> {
    // Same implementation as Nano (kie.ai polling endpoint is model-agnostic)
    return new NanoBananaStrategy().pollTask(taskId);
  }

  validateParams(params: ModelGenerationParams & { quality?: string }): void {
    if (!['basic', 'high'].includes(params.quality || '')) {
      throw new Error(`Invalid quality for Seedream: ${params.quality}`);
    }
    if (params.referenceImages.length > this.capabilities.maxReferenceImages) {
      throw new Error(`Too many references: ${params.referenceImages.length}, max ${this.capabilities.maxReferenceImages}`);
    }
  }
}

// lib/models/model-factory.ts
export function getModelStrategy(modelId: ModelId): ModelStrategy {
  switch (modelId) {
    case 'nano-banana-pro':
      return new NanoBananaStrategy();
    case 'seedream-4.5-edit':
      return new SeedreamStrategy();
    default:
      const exhaustiveCheck: never = modelId;
      throw new Error(`Unknown model: ${exhaustiveCheck}`);
  }
}
```

### Updated Type Definitions with Model Field
```typescript
// lib/types/generation.ts - MODIFIED for v2.0

export type ModelId = 'nano-banana-pro' | 'seedream-4.5-edit';

export interface GenerationJob {
  id: string;
  jobId: string;
  folderPath: string;
  operation: string;
  model: ModelId; // NEW: Model to use for this generation

  // Common params
  aspectRatio: AspectRatio;
  photoMode: 'reference' | 'analysis';
  referenceImageUrls: string[];
  sourceFileName: string;

  // Model-specific params (conditional on model field)
  resolution?: '1K' | '2K' | '4K'; // For nano-banana-pro
  outputFormat?: 'PNG' | 'JPG'; // For nano-banana-pro
  quality?: 'basic' | 'high'; // For seedream-4.5-edit
  imageSize?: string; // For seedream-4.5-edit
}

export interface GenerationRecord {
  id: string;
  job_id: string;
  folder_path: string;
  operation: string;
  state: GenerationState;
  model: ModelId; // NEW: Model identifier
  task_id: string | null;
  result_url: string | null;
  source_file_name: string;
  reference_image_urls: string[];

  // Model-specific fields stored as-is (nullable for flexibility)
  resolution: string | null;
  aspect_ratio: string;
  photo_mode: string;
  output_format: string | null;
  quality: string | null; // NEW: For seedream
  image_size: string | null; // NEW: For seedream

  error_message: string | null;
  retry_count: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single-model hardcoded logic | Strategy Pattern with model abstraction | 2020-present | Enables adding new models without modifying existing code (Open/Closed Principle) |
| Union types with manual narrowing | Discriminated unions (TS 2.0+, Zod 3.0+) | 2016 (TS), 2020 (Zod) | Automatic type narrowing, O(1) validation lookup, compile-time safety |
| Massive migrations with table locks | Batched updates with throttling | 2020-present | Zero-downtime deployments, prevents connection pool exhaustion |
| Separate columns per model param | JSONB for model-specific data | 2014 (PostgreSQL 9.4) | Schema evolution without migrations, queryable with GIN indexes |
| Heavyweight abstraction frameworks | Lightweight Strategy Pattern | Always relevant for 2-10 models | Reduced complexity, zero dependencies, full type safety |

**Deprecated/outdated:**
- **Single-model coupling:** Hardcoding 'nano-banana-pro' throughout codebase. Use ModelId type and factory pattern.
- **Manual parameter validation:** if/else chains checking model field. Use Zod discriminated unions for O(1) validation.
- **ALTER COLUMN NOT NULL without DEFAULT:** Causes migration failures if backfill incomplete. Always add DEFAULT first.
- **Vercel AI SDK for image generation:** Designed for LLMs, not image APIs. Use native Strategy Pattern for image generation use cases.

## Open Questions

Things that couldn't be fully resolved:

1. **Seedream 4.5 Edit Aspect Ratio Mapping**
   - What we know: Seedream uses named sizes ('landscape_16_9') vs Nano's ratio format ('16:9')
   - What's unclear: Exact mapping between Nano's aspect ratio options and Seedream's image_size options
   - Recommendation: Create mapping function: '16:9' → 'landscape_16_9', '1:1' → 'square'. Test with API during implementation. Document mismatches (e.g., Nano's 'auto' has no Seedream equivalent—default to 'landscape_16_9').

2. **Seedream Pricing Consistency**
   - What we know: Kie.ai documentation shows $0.032 per image for Seedream 4.5 Edit
   - What's unclear: Whether 'basic' (2K) and 'high' (4K) quality have same pricing, or if pricing differs by quality
   - Recommendation: Assume flat $0.032 per image pricing for v2.0 MVP. Add quality-based pricing if kie.ai clarifies in docs. Monitor actual billing to validate.

3. **Model Field Storage Location**
   - What we know: Need to store model identifier for each generation
   - What's unclear: Should model be on jobs table only, generations table only, or both?
   - Recommendation: Store on both. Jobs table = default model for job, Generations table = actual model used (enables per-folder models in Phase 10). Generations.model takes precedence for execution.

4. **Backward Compatibility Window**
   - What we know: v1.0 jobs must continue working, model field defaults to 'nano-banana-pro'
   - What's unclear: How long to support v1.0 job format? Forever, or eventual breaking change?
   - Recommendation: Support indefinitely—default model + discriminated union allow old jobs to parse. No breaking change needed. Cost: One extra column in DB.

5. **Strategy Object Lifecycle**
   - What we know: Strategies are stateless, can be reused
   - What's unclear: Create singleton instances or instantiate per-generation?
   - Recommendation: Factory creates new instances per-call (trivial overhead, ~50 bytes). No shared state means no concurrency issues. Don't prematurely optimize with singleton pattern.

## Sources

### Primary (HIGH confidence)
- TypeScript Strategy Pattern documentation: [https://refactoring.guru/design-patterns/strategy/typescript/example](https://refactoring.guru/design-patterns/strategy/typescript/example) - Official pattern implementation
- Zod discriminated unions: [https://zod.dev/api](https://zod.dev/api) + [https://timkapitein.nl/blog/parsing-discriminated-unions-with-zod](https://timkapitein.nl/blog/parsing-discriminated-unions-with-zod) - API documentation and practical examples
- Seedream 4.5 Edit API: [https://kie.ai/seedream-4-5](https://kie.ai/seedream-4-5) - Official kie.ai documentation for parameters, pricing
- PostgreSQL migration best practices: [https://fly.io/phoenix-files/backfilling-data/](https://fly.io/phoenix-files/backfilling-data/) - Batched backfill patterns
- Existing codebase: lib/queue/kie-api-client.ts, lib/ai/schemas/job.ts - Verified working implementations

### Secondary (MEDIUM confidence)
- [Interface Segregation Principle in TypeScript](https://dev.to/ruben_alapont/solid-principles-series-embracing-the-interface-segregation-principle-isp-in-typescript-59n6) - SOLID principles for interface design
- [API Backwards Compatibility Best Practices](https://zuplo.com/learning-center/api-versioning-backward-compatibility-best-practices) - Verified with official API versioning docs
- [PostgreSQL JSONB for Discriminated Unions](https://weiyen.net/articles/modelling-discriminated-unions-in-postgres/) - Community pattern verified with PostgreSQL docs
- [Data Migration Best Practices 2026](https://medium.com/@kanerika/data-migration-best-practices-your-ultimate-guide-for-2026-7cbd5594d92e) - Industry best practices

### Tertiary (LOW confidence)
- WebSearch results for model abstraction patterns - Multiple sources agree on Strategy Pattern approach
- WebSearch results for Seedream 4.5 Edit details - Some parameters inferred from general kie.ai documentation, need API testing

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new dependencies, using existing TypeScript/Zod/PostgreSQL features
- Strategy Pattern architecture: HIGH - Well-documented pattern, directly applicable to multi-model problem
- Discriminated unions: HIGH - Official Zod feature with extensive documentation
- Database migration: HIGH - Standard PostgreSQL patterns verified across multiple sources
- Seedream API details: MEDIUM - Official kie.ai docs available but some parameters need implementation testing
- Backward compatibility: HIGH - Default model approach verified, existing v1.0 jobs will parse correctly

**Research date:** 2026-01-26
**Valid until:** 2026-02-26 (30 days - Strategy Pattern is stable, Zod API stable, kie.ai models unlikely to change significantly)
