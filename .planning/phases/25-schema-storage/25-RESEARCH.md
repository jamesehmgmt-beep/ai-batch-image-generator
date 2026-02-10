# Phase 25: Schema & Storage - Research

**Researched:** 2026-02-03
**Domain:** Database schema evolution for per-generation prompts, Zod validation, TypeScript types
**Confidence:** HIGH

## Summary

Phase 25 adds the foundation for v4.0 Per-Generation Prompts by storing individual AI-generated prompts in the generations table. This phase extends the database schema to support prompt storage, modifies job creation to populate these prompts, and updates queue execution to use generation-specific prompts instead of folder-level prompts.

The research reveals that PostgreSQL TEXT columns are optimal for prompt storage (variable length, no performance penalty vs VARCHAR), adding nullable TEXT columns is a zero-downtime operation, and the existing Zod schema validation infrastructure can be extended incrementally. The codebase already has Claude integration for prompt analysis in analysis mode (generation-queue.ts analyzeImageWithClaude), which provides a pattern for per-generation prompt creation.

Database changes required: add `prompt` column to generations table (TEXT, nullable initially for backward compatibility), update TypeScript GenerationRecord interface, extend Zod schema validation if needed, modify job creation flow to populate prompts, and update queue execution to read from generation.prompt field.

**Primary recommendation:** Add nullable TEXT column for `prompt` field, populate during job creation with per-generation prompts (from AI prompt generation service), update queue to use generation.prompt with fallback to folder.operation for backward compatibility, maintain TypeScript type safety through interface updates.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| PostgreSQL TEXT | Current | Variable-length text storage | Optimal for prompts: no length limit, same performance as VARCHAR, 1GB max, no overhead |
| Supabase migrations | Current | Version-controlled schema changes | Git-tracked SQL files in supabase/migrations/, zero-downtime deployments |
| Zod | 4.3.6 | Runtime schema validation | Already in project, validate prompt presence/format before database insert |
| TypeScript | 5.9.3 | Static type checking | Compile-time safety for generation records with prompt field |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| PostgreSQL ALTER TABLE | 11+ | Schema evolution | Add columns with zero downtime using nullable fields |
| Supabase TypeScript types | Current | Auto-generated database types | Keep TypeScript in sync with database schema |
| Zod .nullable() | 4.x | Optional field validation | Prompt field is optional for backward compatibility with existing records |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| TEXT column | VARCHAR(n) with limit | TEXT allows unlimited length for complex prompts, no performance difference, more flexible |
| Nullable initially | NOT NULL with backfill | Nullable enables gradual rollout, avoids migration complexity, simpler deployment |
| Generation-level storage | Job-level or folder-level | Generation-level enables per-image prompts (v4.0 requirement), more granular control |
| Database column | JSONB in parsed_job | Column is queryable/indexable, better performance, simpler queries, type-safe |

**Installation:**
```bash
# No new dependencies required
# Using existing PostgreSQL (Supabase), Zod 4.3.6, TypeScript 5.9.3
```

## Architecture Patterns

### Recommended Project Structure
```
supabase/
└── migrations/
    ├── 001_jobs_and_generations.sql     # Existing
    ├── 002_add_model_fields.sql         # Existing
    ├── 003_soft_delete.sql              # Existing
    └── 004_add_prompt_column.sql        # NEW: Add prompt to generations

lib/
├── types/
│   └── generation.ts                    # MODIFIED: Add prompt to GenerationRecord, GenerationJob
├── ai/
│   └── prompt-generator.ts              # NEW: Generate per-generation prompts
├── job/
│   └── job-manager.ts                   # Potentially modified for prompt generation
└── queue/
    └── generation-queue.ts              # MODIFIED: Use generation.prompt instead of operation
```

### Pattern 1: Zero-Downtime Column Addition (Nullable TEXT)
**What:** Add prompt column as nullable TEXT without default value. PostgreSQL executes instantly without table rewrite.
**When to use:** Adding optional fields to existing tables with production data.
**Example:**
```sql
-- Source: PostgreSQL ALTER TABLE best practices
-- https://bun.uptrace.dev/postgres/zero-downtime-migrations.html

-- Migration: 004_add_prompt_column.sql
-- Purpose: Enable per-generation prompt storage for v4.0
-- Safety: Nullable column, no table rewrite, zero downtime

-- Add prompt column to generations table
-- Nullable: Existing generations have no prompts, new ones will populate
-- TEXT: No length limit, optimal for variable-length prompts
ALTER TABLE generations
ADD COLUMN prompt TEXT NULL;

-- Optional: Add index if frequently querying by prompt content
-- CREATE INDEX idx_generations_prompt_gin ON generations USING GIN (to_tsvector('english', prompt));

-- Optional: Add comment for documentation
COMMENT ON COLUMN generations.prompt IS 'AI-generated prompt specific to this generation (v4.0+)';
```

### Pattern 2: Gradual Prompt Population During Job Creation
**What:** Modify job creation flow to generate and populate prompts for each generation record.
**When to use:** Creating generation records in app/api/job/create/route.ts.
**Example:**
```typescript
// Source: Existing pattern in app/api/job/create/route.ts
// Pattern: Generate prompts during job creation, populate in database insert

import { generatePerImagePrompt } from '@/lib/ai/prompt-generator';

// In job creation loop (existing code enhanced)
for (const fileUrl of validFiles) {
  const fileName = fileUrl.split('/').pop() || 'unknown';

  // Generate per-generation prompt (new in Phase 25)
  // Could be:
  // 1. Same as folder operation (simple)
  // 2. AI-enhanced based on image analysis
  // 3. Template with per-image variables
  const generationPrompt = await generatePerImagePrompt({
    folderOperation: folder.operation,
    fileName: fileName,
    imageUrl: fileUrl,
    photoMode: photoMode,
  });

  generationRecords.push({
    id: uuidv4(),
    job_id: job.id,
    folder_path: folder.folderPath,
    operation: folder.operation, // Keep for backward compatibility
    prompt: generationPrompt,     // NEW: Per-generation prompt
    state: 'pending',
    source_file_name: fileName,
    reference_image_urls: allReferenceUrls,
    model: model,
    resolution: folder.resolution || '2K',
    aspect_ratio: folder.aspectRatio || '1:1',
    photo_mode: photoMode,
    quality: !isNanoBanana ? (folderAny.quality || 'basic') : null,
    image_size: !isNanoBanana ? (folderAny.imageSize || 'landscape_16_9') : null,
  });
}

// Insert remains the same (Supabase handles new column)
const { error: genError } = await supabase
  .from('generations')
  .insert(generationRecords);
```

### Pattern 3: Queue Execution with Prompt Fallback
**What:** Update queue to use generation.prompt field with fallback to operation for backward compatibility.
**When to use:** Queue execution in lib/queue/generation-queue.ts.
**Example:**
```typescript
// Source: Existing pattern in lib/queue/generation-queue.ts
// Pattern: Use prompt field, fall back to operation for old records

private async executeGeneration(job: GenerationJob): Promise<GenerationResult> {
  try {
    // ... existing state update code ...

    // Step 2: Prepare prompt (use generation-specific prompt)
    // MODIFIED: Use job.prompt if available, fall back to job.operation
    let finalPrompt = job.prompt || job.operation;

    // Analysis mode enhancement (existing logic)
    if (job.photoMode === 'analysis' && job.referenceImageUrls.length > 0) {
      // If prompt is already AI-generated, skip re-analysis
      // If using fallback operation, enhance with Claude analysis
      if (!job.prompt) {
        finalPrompt = await analyzeImageWithClaude(
          job.referenceImageUrls[0],
          job.operation
        );
      }
    }

    // ... rest of execution uses finalPrompt ...
  }
}
```

### Pattern 4: TypeScript Type Updates
**What:** Update GenerationRecord and GenerationJob interfaces to include prompt field.
**When to use:** Maintaining type safety across the application.
**Example:**
```typescript
// Source: Existing lib/types/generation.ts pattern
// lib/types/generation.ts - MODIFIED for Phase 25

// Generation job input to queue
export interface GenerationJob {
  id: string;
  jobId: string;
  folderPath: string;
  operation: string; // Keep for backward compatibility
  prompt?: string;   // NEW: Per-generation prompt (optional for backward compat)
  model: ModelId;
  resolution?: '1K' | '2K' | '4K';
  aspectRatio: AspectRatio;
  photoMode: 'reference' | 'analysis';
  outputFormat: 'PNG' | 'JPG';
  referenceImageUrls: string[];
  sourceFileName: string;
  quality?: 'basic' | 'high';
  imageSize?: string;
}

// Generation record (database row)
export interface GenerationRecord {
  id: string;
  job_id: string;
  folder_path: string;
  operation: string; // Legacy folder-level operation
  prompt: string | null; // NEW: Generation-specific prompt
  state: GenerationState;
  task_id: string | null;
  result_url: string | null;
  source_file_name: string;
  reference_image_urls: string[];
  model: string;
  resolution: string | null;
  aspect_ratio: string;
  photo_mode: string;
  quality: string | null;
  image_size: string | null;
  error_message: string | null;
  retry_count: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  deleted_at: string | null;
}
```

### Pattern 5: Prompt Generation Service (Placeholder)
**What:** Dedicated service for generating per-generation prompts (implementation details TBD).
**When to use:** Job creation phase when populating generation records.
**Example:**
```typescript
// lib/ai/prompt-generator.ts - NEW file for Phase 25
// Pattern: Centralized prompt generation logic

export interface PromptGenerationOptions {
  folderOperation: string;  // Base prompt from folder
  fileName: string;         // Source file name
  imageUrl?: string;        // For image analysis
  photoMode: 'reference' | 'analysis';
}

/**
 * Generate a per-generation prompt.
 *
 * Simple implementation: Return folder operation as-is.
 * Future: Enhance with image analysis, template variables, AI refinement.
 */
export async function generatePerImagePrompt(
  options: PromptGenerationOptions
): Promise<string> {
  // Phase 25: Simple pass-through (prep for v4.0)
  // Just store the folder operation as the generation prompt
  return options.folderOperation;

  // Future v4.0 enhancement:
  // - Analyze image with Claude
  // - Insert file-specific details
  // - Apply prompt templates
  // - Generate variations per image
}
```

### Anti-Patterns to Avoid
- **Adding NOT NULL constraint initially:** Breaks existing records, requires backfill, adds complexity. Use nullable.
- **Using VARCHAR with arbitrary limit:** VARCHAR(1000) may truncate complex prompts. TEXT has no limit, same performance.
- **Storing prompts in JSONB:** Less queryable, harder to index, no type safety. Use dedicated column.
- **Deleting operation field:** Keep for backward compatibility and auditing folder-level intent.
- **Synchronous prompt generation blocking job creation:** Generate prompts in parallel or batch to avoid timeouts.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Prompt text storage optimization | Custom compression/encoding | PostgreSQL TEXT column | TEXT is already optimized (TOAST for large values), compressed automatically, no manual handling needed |
| Schema synchronization | Manual TypeScript updates | Supabase type generation or shared Zod schemas | Type drift between database and TypeScript causes runtime errors, automated tooling prevents this |
| Prompt validation | Manual string checks | Zod schema with refinements | Zod provides composable validation, type inference, error messages, better than ad-hoc checks |
| Migration rollback | Custom down migrations | Forward-only with feature flags | Nullable columns enable gradual rollout, no risky rollbacks, column can stay unused if needed |

**Key insight:** PostgreSQL TEXT columns are specifically designed for variable-length text like prompts. They handle compression (TOAST), unlimited length, and indexing automatically. Don't reinvent text storage—use the database's built-in capabilities.

## Common Pitfalls

### Pitfall 1: Forgetting to Update All Generation Queries
**What goes wrong:** Code reads generations from database but doesn't SELECT prompt field, so it's always null in application.
**Why it happens:** Adding column to database but forgetting to update SELECT statements in API endpoints.
**How to avoid:**
- Audit all SELECT queries from generations table
- Update to include `prompt` field: `.select('*, prompt')`
- Verify TypeScript types match database schema
- Test with generation records that have prompts
**Warning signs:**
- Prompt always null/undefined in UI
- Queue uses operation instead of prompt
- TypeScript shows prompt field but runtime value is missing

### Pitfall 2: Not Handling Null Prompts in Queue
**What goes wrong:** Queue crashes when processing old generations without prompts if code expects prompt to always exist.
**Why it happens:** Assuming prompt field is always populated, not handling legacy records.
**How to avoid:**
- Always use fallback: `const prompt = job.prompt || job.operation`
- TypeScript type should be `prompt?: string` (optional)
- Test queue with mix of old (no prompt) and new (with prompt) records
**Warning signs:**
- Queue fails on old generation records
- "Cannot read property 'prompt' of undefined" errors
- New jobs work but retry of old jobs fails

### Pitfall 3: Prompt Generation Timeout During Job Creation
**What goes wrong:** Generating prompts for 100+ images takes too long, API request times out, job creation fails.
**Why it happens:** Synchronous prompt generation in job creation loop, especially if calling external AI APIs.
**How to avoid:**
- For Phase 25: Simple pass-through (just copy operation), no API calls
- For v4.0: Generate prompts asynchronously after job creation
- Consider background job for prompt enrichment
- Set reasonable timeout limits
**Warning signs:**
- Job creation endpoint times out
- Supabase connection timeouts
- Large jobs fail but small jobs succeed

### Pitfall 4: Using VARCHAR with Length Limit
**What goes wrong:** Complex AI-generated prompts exceed VARCHAR(500) limit, insert fails with "value too long" error.
**Why it happens:** Assuming prompts are short, adding arbitrary length limit for "safety".
**How to avoid:**
- Always use TEXT for variable-length content
- TEXT has same performance as VARCHAR in PostgreSQL
- No artificial limits, database handles storage optimization
**Warning signs:**
- Insert errors: "value too long for type character varying(500)"
- Prompts get truncated silently
- Complex prompts fail but simple ones work

### Pitfall 5: Not Maintaining Backward Compatibility
**What goes wrong:** Removing operation field breaks existing queue processing, old jobs fail to execute.
**Why it happens:** Assuming prompt field replaces operation field entirely.
**How to avoid:**
- Keep both fields: operation (folder-level) and prompt (generation-level)
- Use prompt as primary, operation as fallback
- Document: "operation = folder intent, prompt = generation-specific refinement"
**Warning signs:**
- Old pending jobs fail after deployment
- Queue can't find prompt source
- Error logs mention missing operation field

### Pitfall 6: Forgetting to Update TypeScript Types
**What goes wrong:** Database has prompt column but TypeScript GenerationRecord doesn't, causing type errors or missing data.
**Why it happens:** Database migration and TypeScript types updated in different commits/PRs.
**How to avoid:**
- Update database schema and TypeScript types in same commit
- Run type checking after migration: `npm run type-check`
- Verify interfaces match database columns exactly
**Warning signs:**
- TypeScript compilation errors after migration
- Runtime data has fields that TypeScript doesn't recognize
- IDE doesn't autocomplete prompt field

### Pitfall 7: Poor Prompt Index Choice
**What goes wrong:** Adding full-text search index on prompt column slows down inserts significantly.
**Why it happens:** Prematurely optimizing for searching prompts when it's not a current requirement.
**How to avoid:**
- Don't add indexes unless there's a query pattern that needs them
- For Phase 25: No index needed (only reading by generation id)
- For v4.0: Consider GIN index only if searching/filtering by prompt text
**Warning signs:**
- Insert performance degrades after adding index
- Migration takes very long time
- Database CPU spikes during job creation

## Code Examples

Verified patterns from official sources:

### Complete Database Migration
```sql
-- Migration: 004_add_prompt_column.sql
-- Purpose: Add per-generation prompt storage for v4.0 Per-Generation Prompts
-- Phase: 25 (Schema & Storage)
-- Safety: Nullable column, zero downtime, no backfill required
-- Created: 2026-02-03

BEGIN;

-- ==================================================================
-- Add prompt column to generations table
-- ==================================================================

-- Add nullable TEXT column for per-generation prompts
-- Nullable: Existing generations have no prompts (use operation fallback)
-- TEXT: No length limit, optimal for variable-length AI-generated prompts
-- No default: NULL for existing rows is expected behavior
ALTER TABLE generations
ADD COLUMN prompt TEXT NULL;

-- Add column comment for documentation
COMMENT ON COLUMN generations.prompt IS
  'AI-generated prompt specific to this generation. ' ||
  'NULL for legacy records (fall back to operation field). ' ||
  'Added in Phase 25 for v4.0 Per-Generation Prompts milestone.';

-- ==================================================================
-- OPTIONAL: Add full-text search index (only if needed for v4.0)
-- ==================================================================

-- Uncomment if prompt search/filtering is required:
-- CREATE INDEX idx_generations_prompt_fts
-- ON generations
-- USING GIN (to_tsvector('english', prompt))
-- WHERE prompt IS NOT NULL;

-- ==================================================================
-- Verification Queries
-- ==================================================================

-- Verify column exists
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'generations' AND column_name = 'prompt';

-- Expected: prompt | text | YES

-- Verify existing records have NULL prompts
-- SELECT COUNT(*) as null_prompts
-- FROM generations
-- WHERE prompt IS NULL;

-- Expected: All existing records

-- Verify new inserts work with prompt
-- INSERT INTO generations (id, job_id, folder_path, operation, prompt, state, ...)
-- VALUES (..., 'Test prompt for image X', ...);

COMMIT;
```

### Updated Job Creation with Prompt Population
```typescript
// app/api/job/create/route.ts - MODIFIED for Phase 25
// Pattern: Populate prompt field during generation record creation

import { generatePerImagePrompt } from '@/lib/ai/prompt-generator';

// In the generation records creation loop
for (const fileUrl of validFiles) {
  const fileName = fileUrl.split('/').pop() || 'unknown';

  // Determine reference URLs (existing logic)
  let allReferenceUrls: string[];
  if (photoMode === 'analysis') {
    const otherValidFiles = validFiles.filter((f: string) => f !== fileUrl);
    allReferenceUrls = [fileUrl, ...otherValidFiles, ...validatedReferenceUrls].slice(0, 8);
  } else {
    allReferenceUrls = [fileUrl, ...validatedReferenceUrls].slice(0, 8);
  }

  // Get model config (existing logic)
  const folderAny = folder as typeof folder & {
    model?: string;
    quality?: string;
    imageSize?: string;
  };
  const model = folderAny.model || validatedParsedJob.job?.model || 'nano-banana-pro';
  const isNanoBanana = model === 'nano-banana-pro';

  // NEW: Generate per-generation prompt
  // Phase 25: Simple implementation (just use folder operation)
  // v4.0: Will enhance with AI-based prompt generation
  const generationPrompt = await generatePerImagePrompt({
    folderOperation: folder.operation,
    fileName: fileName,
    imageUrl: fileUrl,
    photoMode: photoMode,
  });

  generationRecords.push({
    id: uuidv4(),
    job_id: job.id,
    folder_path: folder.folderPath,
    operation: folder.operation,      // Keep for backward compatibility
    prompt: generationPrompt,          // NEW: Per-generation prompt
    state: 'pending',
    source_file_name: fileName,
    reference_image_urls: allReferenceUrls,
    model: model,
    resolution: folder.resolution || '2K',
    aspect_ratio: folder.aspectRatio || '1:1',
    photo_mode: photoMode,
    quality: !isNanoBanana ? (folderAny.quality || 'basic') : null,
    image_size: !isNanoBanana ? (folderAny.imageSize || 'landscape_16_9') : null,
  });
}

// Insert generation records (Supabase automatically handles new prompt column)
const { error: genError } = await supabase
  .from('generations')
  .insert(generationRecords);
```

### Queue Execution with Prompt Support
```typescript
// lib/queue/generation-queue.ts - MODIFIED for Phase 25
// Pattern: Use generation.prompt with fallback to operation

private async executeGeneration(job: GenerationJob): Promise<GenerationResult> {
  try {
    // Step 1: Update state to 'processing' (existing)
    const { error: processingError } = await this.supabase
      .from('generations')
      .update({
        state: 'processing',
        started_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    if (processingError) {
      throw new Error(`Failed to update state to processing: ${processingError.message}`);
    }

    // Step 2: Prepare prompt (MODIFIED for Phase 25)
    // Use generation-specific prompt if available, fall back to folder operation
    let finalPrompt = job.prompt || job.operation;

    // Analysis mode enhancement (existing logic, skip if prompt already generated)
    if (job.photoMode === 'analysis' && job.referenceImageUrls.length > 0) {
      // If generation has custom prompt, use it as-is
      // If using fallback operation, enhance with Claude analysis
      if (!job.prompt) {
        finalPrompt = await analyzeImageWithClaude(
          job.referenceImageUrls[0],
          job.operation
        );
      }
      // else: prompt was pre-generated, no need to analyze again
    }

    // Step 3-9: Rest of execution uses finalPrompt (unchanged)
    const strategy = getModelStrategy(job.model);
    const params = buildModelParams(job, strategy, finalPrompt);
    strategy.validateParams(params);
    const taskId = await strategy.createTask(params);

    // ... rest of existing code ...
  }
}
```

### Prompt Generator Service
```typescript
// lib/ai/prompt-generator.ts - NEW for Phase 25
// Purpose: Centralized per-generation prompt creation

export interface PromptGenerationOptions {
  /** Base prompt from folder operation */
  folderOperation: string;
  /** Source file name for this generation */
  fileName: string;
  /** Image URL for analysis (optional) */
  imageUrl?: string;
  /** Photo mode: reference or analysis */
  photoMode: 'reference' | 'analysis';
}

/**
 * Generate a per-generation prompt.
 *
 * Phase 25: Simple implementation - returns folder operation as-is.
 * This populates the database column for v4.0 infrastructure.
 *
 * v4.0: Will be enhanced with:
 * - Image-specific analysis
 * - Template variable substitution ({{filename}}, {{index}}, etc.)
 * - AI-based prompt variations
 * - Per-image customization
 *
 * @param options - Prompt generation configuration
 * @returns Generated prompt text
 */
export async function generatePerImagePrompt(
  options: PromptGenerationOptions
): Promise<string> {
  // Phase 25: Simple pass-through
  // Just store the folder operation in the prompt field
  // This sets up the database column for future enhancements
  return options.folderOperation;

  // Future v4.0 implementation example:
  /*
  if (options.photoMode === 'analysis' && options.imageUrl) {
    // Analyze image with Claude to create custom prompt
    return await analyzeImageForPrompt(options.imageUrl, options.folderOperation);
  }

  // Apply template variables
  return options.folderOperation
    .replace(/\{\{filename\}\}/g, options.fileName)
    .replace(/\{\{basename\}\}/g, options.fileName.replace(/\.[^/.]+$/, ''));
  */
}

/**
 * Batch generate prompts for multiple generations.
 * Optimizes by parallelizing independent generations.
 *
 * @param generations - Array of generation configs
 * @returns Array of generated prompts (same order)
 */
export async function generatePromptsForBatch(
  generations: PromptGenerationOptions[]
): Promise<string[]> {
  // Phase 25: Simple map
  return Promise.all(generations.map(gen => generatePerImagePrompt(gen)));

  // v4.0: Could batch AI calls, cache common analyses, etc.
}
```

### Updated TypeScript Types
```typescript
// lib/types/generation.ts - MODIFIED for Phase 25

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
  id: string;
  jobId: string;
  folderPath: string;
  operation: string;        // Folder-level operation (legacy/fallback)
  prompt?: string;          // NEW: Generation-specific prompt (optional)
  model: ModelId;
  resolution?: '1K' | '2K' | '4K';
  aspectRatio: AspectRatio;
  photoMode: 'reference' | 'analysis';
  outputFormat: 'PNG' | 'JPG';
  referenceImageUrls: string[];
  sourceFileName: string;
  quality?: 'basic' | 'high';
  imageSize?: string;
}

// Generation record (database row)
export interface GenerationRecord {
  id: string;
  job_id: string;
  folder_path: string;
  operation: string;        // Folder-level operation
  prompt: string | null;    // NEW: Generation-specific prompt (nullable)
  state: GenerationState;
  task_id: string | null;
  result_url: string | null;
  source_file_name: string;
  reference_image_urls: string[];
  model: string;
  resolution: string | null;
  aspect_ratio: string;
  photo_mode: string;
  quality: string | null;
  image_size: string | null;
  error_message: string | null;
  retry_count: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  deleted_at: string | null;
}

// Job record (unchanged - no modifications needed)
export interface JobRecord {
  id: string;
  session_id: string;
  parsed_job: ParsedJob;
  model: string;
  total_generations: number;
  completed_generations: number;
  failed_generations: number;
  state: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  estimated_cost: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| VARCHAR(n) for text | TEXT for variable content | PostgreSQL 9.1+ (2011) | No arbitrary limits, same performance, simpler schema |
| Folder-level prompts | Generation-level prompts | Phase 25 (v4.0 prep) | Enables per-image customization, better AI control |
| Hardcoded prompts in code | Database-stored prompts | Phase 25 | Enables dynamic prompt generation, easier iteration |
| NOT NULL with backfill | Nullable with gradual adoption | Modern migration patterns | Zero downtime, simpler deployments, safer rollouts |

**Deprecated/outdated:**
- **VARCHAR with length limits for prompts:** Use TEXT instead, no performance penalty and no artificial limits
- **Storing prompts in JSONB parsed_job:** Use dedicated column for better queryability and type safety
- **Synchronous backfill migrations:** Use nullable columns for gradual rollout, avoid complex backfill logic

## Open Questions

Things that couldn't be fully resolved:

1. **Prompt Generation Complexity for Phase 25**
   - What we know: Phase 25 focuses on schema/storage foundation
   - What's unclear: Should Phase 25 include AI-based prompt generation or just simple pass-through?
   - Recommendation: Phase 25 = simple pass-through (store operation as prompt), defer AI enhancement to v4.0 prompt generation phase

2. **Prompt Validation Requirements**
   - What we know: Prompts will be AI-generated text of variable length
   - What's unclear: Should there be validation beyond "not empty"? Max length? Format checks?
   - Recommendation: Minimal validation in Phase 25 (allow null, store as-is), add validation in v4.0 if needed

3. **Index Requirements for Prompt Column**
   - What we know: No current query patterns search/filter by prompt text
   - What's unclear: Will v4.0 need full-text search on prompts?
   - Recommendation: No index in Phase 25, add GIN full-text search index in v4.0 only if prompt search feature is added

4. **Backward Compatibility Strategy**
   - What we know: Existing pending generations have null prompts
   - What's unclear: Should queue populate missing prompts on-the-fly or require explicit backfill?
   - Recommendation: Fallback to operation field (prompt || operation), no backfill needed, simple and safe

5. **Prompt Field Naming**
   - What we know: "prompt" is clear and matches AI terminology
   - What's unclear: Could be confused with operation field, consider "generation_prompt" or "ai_prompt"?
   - Recommendation: Use "prompt" for simplicity, document that operation = folder intent, prompt = generation-specific

## Sources

### Primary (HIGH confidence)
- [PostgreSQL TEXT vs VARCHAR](https://airbyte.com/data-engineering-resources/postgres-text-vs-varchar) - Performance characteristics identical, TEXT recommended for variable length
- [Supabase Database Migrations](https://supabase.com/docs/guides/deployment/database-migrations) - Official migration best practices
- [Zero-downtime PostgreSQL migrations](https://bun.uptrace.dev/postgres/zero-downtime-migrations.html) - Nullable column patterns
- Existing codebase: `supabase/migrations/001_jobs_and_generations.sql`, `app/api/job/create/route.ts`, `lib/queue/generation-queue.ts`

### Secondary (MEDIUM confidence)
- [PostgreSQL Character Types](https://www.postgresql.org/docs/current/datatype-character.html) - Official PostgreSQL documentation
- [Should You Use char, varchar, or text in PostgreSQL?](https://maximorlov.com/char-varchar-text-postgresql/) - Community best practices
- [PostgreSQL TEXT Data Type](https://neon.com/postgresql/postgresql-tutorial/postgresql-char-varchar-text) - Practical usage patterns

### Tertiary (LOW confidence)
- Multiple sources on Zod schema patterns - general TypeScript validation approaches
- WebSearch results for database prompt storage patterns - limited specific guidance for AI prompts

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - PostgreSQL TEXT is well-documented, established practice for variable-length content
- Architecture: HIGH - Pattern matches existing codebase migrations, verified against actual schema
- Pitfalls: HIGH - Common migration issues well-documented, validated against existing phases
- Prompt generation: MEDIUM - Simple pass-through is straightforward, but v4.0 AI enhancement TBD

**Research date:** 2026-02-03
**Valid until:** 2026-03-03 (30 days - PostgreSQL and migration patterns are stable)

**Technology stack versions verified:**
- PostgreSQL: 11+ (Supabase default)
- Zod: 4.3.6 (verified in package.json)
- TypeScript: 5.9.3 (verified in package.json)
- Next.js: 16.1.4 (verified in package.json)
- Supabase: 2.91.1 (verified in package.json)
