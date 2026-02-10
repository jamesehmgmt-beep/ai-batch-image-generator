# Architecture Patterns: Multi-Model + Per-Folder Prompts Integration

**Domain:** Bulk Image Generation Tool Enhancement
**Researched:** 2026-01-26
**Confidence:** HIGH (existing codebase analyzed, patterns verified)

## Context

BulkImageGen v1.0 currently supports only Nano Banana Pro model with folder-level prompts. v2.0 adds:
1. **Multi-model support** - Seedream 4.5 Edit alongside existing Nano Banana Pro
2. **Per-folder prompts** - Folder-specific instructions + global prompt combination
3. **Delete generations** - Remove individual failed/unwanted results

**Existing architecture to integrate with:**
- Next.js App Router with protected routes (`/app/(protected)`)
- Supabase Postgres: `jobs` and `generations` tables
- Generation queue manager with p-queue (20 concurrent)
- kie.ai API client with retry logic
- Job context (React Context) for parsed job state
- Cost estimation utilities

## Recommended Architecture

### High-Level Integration Strategy

```
[UI Layer: Model Selector + Folder Config]
           ↓
[Schema Layer: Extended ParsedJob]
           ↓
[API Client Layer: Model Strategy Pattern]
           ↓
[Queue Layer: Model-Aware Generation]
           ↓
[kie.ai API: Multi-Model Endpoints]
```

**Key principle:** Extend existing components rather than rewrite. Use Strategy pattern for model-specific API behavior, maintain existing queue/retry infrastructure.

### Component Boundaries

| Component | Current Responsibility | NEW Responsibilities | Integration Points |
|-----------|----------------------|---------------------|-------------------|
| **ParsedJobSchema** (lib/ai/schemas/job.ts) | Define job structure with folders, operations, resolution | Add `model` field to FolderOperation, support nested prompt hierarchy | Job Context, Cost Estimation, Job Manager |
| **KieAPIClient** (lib/queue/kie-api-client.ts) | Create tasks for Nano Banana Pro, poll completion | **Split into**: BaseClient + ModelStrategies (Nano, Seedream) | Generation Queue |
| **GenerationQueue** (lib/queue/generation-queue.ts) | Execute generations with retry | Pass model type to API client strategy | Job Manager, Execute API |
| **Job Context** (lib/session/job-context.tsx) | Store parsed job, conversation state | No changes needed (schema extension flows through) | All UI components |
| **Cost Estimation** (lib/job/cost-estimation.ts) | Calculate cost by resolution | Add model-specific pricing (Seedream quality param) | Job Creation UI |
| **Job Manager** (lib/job/job-manager.ts) | Expand folders to generations | Include model field in generation records | Execute API |
| **Generations Table** (Supabase) | Store state, task_id, result_url | Add `model` column, `quality` column (for Seedream) | All generation queries |
| **Generation UI** (app/(protected)/job/results) | Display results, download | Add delete button per generation | Delete API endpoint |

### Data Flow: Multi-Model Support

**1. User selects model in UI (new component)**
```typescript
// New: components/job/model-selector.tsx
<ModelSelector
  value={model}
  onChange={(model) => updateFolderConfig(folderPath, { model })}
  models={['nano-banana-pro', 'seedream-4.5-edit']}
/>
```

**2. Schema captures model per folder**
```typescript
// MODIFIED: lib/ai/schemas/job.ts
export const FolderOperationSchema = z.object({
  folderPath: z.string(),
  operation: z.string(),
  model: z.enum(['nano-banana-pro', 'seedream-4.5-edit']).default('nano-banana-pro'),

  // Model-specific parameters (validated based on model)
  resolution: ResolutionSchema.optional(), // Only for Nano Banana Pro
  quality: z.enum(['basic', 'high']).optional(), // Only for Seedream (basic=2K, high=4K)

  // Common parameters
  aspectRatio: AspectRatioSchema,
  photoMode: PhotoModeSchema,
  excludedFiles: z.array(z.string()).optional(),
  generationCount: z.number().int().min(1).max(100).optional(),
});
```

**3. API client uses Strategy pattern**
```typescript
// NEW: lib/queue/model-strategies/base-strategy.ts
export interface ModelStrategy {
  createTask(payload: ModelPayload): Promise<string>;
  pollTaskCompletion(taskId: string): Promise<{ resultUrl: string }>;
  validateParams(params: GenerationJob): void;
  getMaxReferenceImages(): number;
}

// NEW: lib/queue/model-strategies/nano-banana-strategy.ts
export class NanoBananaStrategy implements ModelStrategy {
  async createTask(payload: ModelPayload): Promise<string> {
    // Existing createKieAITask logic
    return createKieAITask({
      model: 'nano-banana-pro',
      input: {
        prompt: payload.prompt,
        image_input: payload.referenceUrls.slice(0, 8),
        aspect_ratio: payload.aspectRatio,
        resolution: payload.resolution!, // Required for Nano
        output_format: payload.outputFormat,
      },
    });
  }

  getMaxReferenceImages(): number { return 8; }
}

// NEW: lib/queue/model-strategies/seedream-strategy.ts
export class SeedreamStrategy implements ModelStrategy {
  async createTask(payload: ModelPayload): Promise<string> {
    return createKieAITask({
      model: 'seedream-4.5-edit',
      input: {
        prompt: payload.prompt,
        image_input: payload.referenceUrls.slice(0, 14), // Seedream supports 14
        aspect_ratio: payload.aspectRatio,
        quality: payload.quality || 'basic', // Different param than resolution
        // NO output_format for Seedream
      },
    });
  }

  getMaxReferenceImages(): number { return 14; }
}

// MODIFIED: lib/queue/kie-api-client.ts
export function getModelStrategy(model: string): ModelStrategy {
  switch (model) {
    case 'nano-banana-pro':
      return new NanoBananaStrategy();
    case 'seedream-4.5-edit':
      return new SeedreamStrategy();
    default:
      throw new Error(`Unknown model: ${model}`);
  }
}
```

**4. Queue manager uses strategy**
```typescript
// MODIFIED: lib/queue/generation-queue.ts
private async executeGeneration(job: GenerationJob): Promise<GenerationResult> {
  // Get model-specific strategy
  const strategy = getModelStrategy(job.model);

  // Validate params for this model
  strategy.validateParams(job);

  // Trim reference images to model's max
  const maxRefs = strategy.getMaxReferenceImages();
  const trimmedRefs = job.referenceImageUrls.slice(0, maxRefs);

  // Prepare prompt (existing logic for analysis mode)
  let finalPrompt = job.operation;
  if (job.photoMode === 'analysis' && trimmedRefs.length > 0) {
    finalPrompt = await analyzeImageWithClaude(trimmedRefs[0], job.operation);
  }

  // Create task using strategy
  const taskId = await strategy.createTask({
    prompt: finalPrompt,
    referenceUrls: trimmedRefs,
    aspectRatio: job.aspectRatio,
    resolution: job.resolution,
    quality: job.quality,
    outputFormat: job.outputFormat,
  });

  // Poll using strategy (same interface)
  const { resultUrl } = await strategy.pollTaskCompletion(taskId);

  // Rest of existing logic (update DB, etc.)
}
```

**5. Database migration adds model column**
```sql
-- Migration: Add model support to generations table
ALTER TABLE generations
  ADD COLUMN model TEXT DEFAULT 'nano-banana-pro',
  ADD COLUMN quality TEXT; -- NULL for Nano, 'basic'|'high' for Seedream
```

### Data Flow: Per-Folder Prompts

**Current behavior:** Global prompt OR folder-level operation (mutually exclusive)

**New behavior:** Global prompt + folder-level prompt combination

**1. Schema supports prompt hierarchy**
```typescript
// MODIFIED: lib/ai/schemas/job.ts
export const ParsedJobSchema = z.object({
  understood: z.boolean(),
  confidence: z.number().min(0).max(1),
  job: z.object({
    folders: z.array(FolderOperationSchema),
    globalPrompt: z.string().optional(),
    globalPromptMode: z.enum(['prefix', 'suffix', 'only']).optional().default('prefix'),
    outputFormat: z.enum(['PNG', 'JPG', 'png', 'jpg']).optional(),
  }).optional(),
});

// Updated FolderOperationSchema
export const FolderOperationSchema = z.object({
  folderPath: z.string(),
  operation: z.string().optional(), // Now optional if globalPrompt exists
  // ... rest of fields
});
```

**2. Prompt combination logic**
```typescript
// NEW: lib/job/prompt-builder.ts
export function buildFinalPrompt(
  globalPrompt: string | undefined,
  folderOperation: string | undefined,
  globalPromptMode: 'prefix' | 'suffix' | 'only' = 'prefix'
): string {
  if (!globalPrompt && !folderOperation) {
    throw new Error('Either globalPrompt or folderOperation must be provided');
  }

  if (!globalPrompt) {
    return folderOperation!;
  }

  if (!folderOperation || globalPromptMode === 'only') {
    return globalPrompt;
  }

  if (globalPromptMode === 'prefix') {
    return `${globalPrompt}\n\n${folderOperation}`;
  }

  if (globalPromptMode === 'suffix') {
    return `${folderOperation}\n\n${globalPrompt}`;
  }

  return folderOperation;
}
```

**3. Job manager applies combination**
```typescript
// MODIFIED: lib/job/job-manager.ts
export async function expandJobToGenerations(params: {
  jobId: string;
  parsedJob: ParsedJob;
  filesByFolder: Record<string, string[]>;
  additionalReferenceUrls?: string[];
}): Promise<GenerationJob[]> {
  // ...existing logic...

  for (const folder of parsedJob.job.folders) {
    // Build final prompt using combination logic
    const finalPrompt = buildFinalPrompt(
      parsedJob.job.globalPrompt,
      folder.operation,
      parsedJob.job.globalPromptMode
    );

    // Use finalPrompt in generation job
    const generationJob: GenerationJob = {
      id: generationId,
      operation: finalPrompt, // Combined prompt
      model: folder.model || 'nano-banana-pro',
      // ...rest of fields
    };

    generationJobs.push(generationJob);
  }
}
```

**4. UI shows prompt hierarchy**
```typescript
// MODIFIED: components/job/cost-summary.tsx
<div>
  {parsedJob.job.globalPrompt && (
    <div className="bg-muted p-3 rounded mb-3">
      <p className="text-sm font-medium">Global Prompt ({parsedJob.job.globalPromptMode})</p>
      <p className="text-sm text-muted-foreground">{parsedJob.job.globalPrompt}</p>
    </div>
  )}

  {parsedJob.job.folders.map(folder => (
    <div key={folder.folderPath}>
      <p className="font-medium">{folder.folderPath}</p>
      {folder.operation && (
        <p className="text-sm text-muted-foreground">Folder prompt: {folder.operation}</p>
      )}
      <p className="text-xs text-muted-foreground">
        Final: {buildFinalPrompt(parsedJob.job.globalPrompt, folder.operation)}
      </p>
    </div>
  ))}
</div>
```

### Data Flow: Delete Generations

**Current behavior:** No delete functionality - all generations persist

**New behavior:** DELETE endpoint removes generation record and updates job counts

**1. API endpoint**
```typescript
// NEW: app/api/generation/[id]/route.ts
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabaseClient();

  // Get generation to verify it exists
  const { data: generation, error: fetchError } = await supabase
    .from('generations')
    .select('id, job_id, state')
    .eq('id', params.id)
    .single();

  if (fetchError || !generation) {
    return NextResponse.json({ error: 'Generation not found' }, { status: 404 });
  }

  // Delete generation record
  const { error: deleteError } = await supabase
    .from('generations')
    .delete()
    .eq('id', params.id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  // Update job counts (decrement total, decrement completed/failed if applicable)
  const { error: updateError } = await supabase.rpc('decrement_job_counts', {
    p_job_id: generation.job_id,
    p_state: generation.state,
  });

  if (updateError) {
    console.error('[Delete] Failed to update job counts:', updateError);
  }

  return NextResponse.json({ success: true });
}
```

**2. Database function for atomic count updates**
```sql
-- Migration: Add function to decrement job counts
CREATE OR REPLACE FUNCTION decrement_job_counts(
  p_job_id UUID,
  p_state TEXT
)
RETURNS VOID AS $$
BEGIN
  UPDATE jobs
  SET
    total_generations = total_generations - 1,
    completed_generations = CASE
      WHEN p_state = 'completed' THEN completed_generations - 1
      ELSE completed_generations
    END,
    failed_generations = CASE
      WHEN p_state = 'failed' THEN failed_generations - 1
      ELSE failed_generations
    END
  WHERE id = p_job_id;
END;
$$ LANGUAGE plpgsql;
```

**3. UI delete button**
```typescript
// MODIFIED: app/(protected)/job/results/page.tsx
async function handleDelete(generationId: string) {
  if (!confirm('Delete this generation? This cannot be undone.')) {
    return;
  }

  const response = await fetch(`/api/generation/${generationId}`, {
    method: 'DELETE',
  });

  if (response.ok) {
    // Optimistic update: remove from local state
    setGenerations(prev => prev.filter(g => g.id !== generationId));
    toast.success('Generation deleted');
  } else {
    toast.error('Failed to delete generation');
  }
}

// In generation card
<Button
  variant="destructive"
  size="sm"
  onClick={() => handleDelete(generation.id)}
>
  Delete
</Button>
```

## Integration Points with Existing Components

### 1. Schema Layer (lib/ai/schemas/job.ts)

**Current:**
- FolderOperationSchema with resolution, aspectRatio, photoMode
- ParsedJobSchema with folders array and globalPrompt

**Integration:**
- Add `model` field to FolderOperationSchema
- Add `quality` field for Seedream (validated conditionally)
- Add `globalPromptMode` to ParsedJobSchema
- Make `operation` optional in FolderOperationSchema (global can be only prompt)

**Risk:** LOW - Schema extensions backward compatible (defaults provided)

### 2. API Client Layer (lib/queue/kie-api-client.ts)

**Current:**
- Single createKieAITask function hardcoded to nano-banana-pro
- Single pollTaskCompletion function

**Integration:**
- **Refactor:** Extract interface `ModelStrategy`
- **Split:** Create NanoBananaStrategy and SeedreamStrategy classes
- **Add:** Factory function `getModelStrategy(model: string)`
- **Keep:** Existing retry logic (in strategies)

**Risk:** MEDIUM - Refactoring existing API client. Mitigation: Keep existing function as wrapper for NanoBananaStrategy initially, test thoroughly.

### 3. Queue Manager (lib/queue/generation-queue.ts)

**Current:**
- Calls createKieAITask directly
- Hardcoded to 8 reference images

**Integration:**
- Call `getModelStrategy(job.model)` to get strategy
- Use `strategy.getMaxReferenceImages()` for trimming
- Pass job.model through GenerationJob interface

**Risk:** LOW - Single integration point, well-defined interface

### 4. Job Context (lib/session/job-context.tsx)

**Current:**
- Stores ParsedJob in state
- Persists to sessionStorage

**Integration:**
- No changes needed - schema extensions flow through automatically
- ParsedJob already stored as flexible object

**Risk:** NONE - Pure data flow

### 5. Cost Estimation (lib/job/cost-estimation.ts)

**Current:**
- COST_PER_IMAGE keyed by resolution ('1K', '2K', '4K')

**Integration:**
- Extend to `COST_PER_IMAGE[model][resolutionOrQuality]`
- Add Seedream pricing: basic (2K equivalent), high (4K equivalent)

```typescript
const COST_PER_IMAGE: Record<string, Record<string, number>> = {
  'nano-banana-pro': {
    '1K': 0.134,
    '2K': 0.134,
    '4K': 0.24,
  },
  'seedream-4.5-edit': {
    'basic': 0.134, // Assuming similar to 2K
    'high': 0.24,   // Assuming similar to 4K
  },
};
```

**Risk:** LOW - Straightforward extension

### 6. Job Manager (lib/job/job-manager.ts)

**Current:**
- expandJobToGenerations creates GenerationJob objects
- Combines folder operation with globalPrompt (simple concatenation)

**Integration:**
- Use `buildFinalPrompt()` utility for prompt combination
- Add model field to GenerationJob creation
- Add quality field for Seedream jobs

**Risk:** LOW - Well-contained change

### 7. Database Schema (Supabase)

**Current:**
- generations table: resolution, aspect_ratio, photo_mode
- jobs table: parsed_job (JSONB), estimated_cost

**Integration:**
- Add `model TEXT DEFAULT 'nano-banana-pro'` to generations
- Add `quality TEXT` to generations (NULL for Nano, 'basic'|'high' for Seedream)

**Risk:** LOW - Additive migration with defaults

### 8. UI Components

**Current:**
- Job configuration UI shows folders with operation input
- Cost summary shows breakdown by resolution
- Results page shows generation cards

**Integration:**
- Add ModelSelector component (new)
- Update cost summary to show model + resolution/quality
- Add delete button to generation cards (new)
- Update prompt display to show hierarchy (modified)

**Risk:** LOW - Additive UI changes

## Patterns to Follow

### Pattern 1: Strategy Pattern for Model-Specific Behavior

**What:** Abstract model-specific API logic behind ModelStrategy interface

**When:** Creating tasks, polling completion, validating parameters

**Why:**
- Isolates model differences in dedicated classes
- Easy to add new models (implement interface)
- Testable in isolation
- Maintains existing queue/retry infrastructure

**Example:**
```typescript
// Clean separation: Queue doesn't know model details
const strategy = getModelStrategy(job.model);
const taskId = await strategy.createTask(payload);
const { resultUrl } = await strategy.pollTaskCompletion(taskId);
```

**References:**
- [Strategy Pattern in TypeScript (refactoring.guru)](https://refactoring.guru/design-patterns/strategy/typescript/example)
- [Environment-Aware Model Routing (LogRocket)](https://blog.logrocket.com/environment-aware-model-routing/)

### Pattern 2: Schema Composition with Conditional Validation

**What:** Use Zod's `.refine()` to validate model-specific parameters

**When:** Validating FolderOperationSchema with model field

**Why:**
- Single schema handles all models
- Type-safe parameter validation
- Clear error messages when wrong params used

**Example:**
```typescript
export const FolderOperationSchema = z.object({
  model: z.enum(['nano-banana-pro', 'seedream-4.5-edit']),
  resolution: ResolutionSchema.optional(),
  quality: z.enum(['basic', 'high']).optional(),
  // ... other fields
}).refine(
  (data) => {
    // Nano requires resolution
    if (data.model === 'nano-banana-pro' && !data.resolution) {
      return false;
    }
    // Seedream requires quality
    if (data.model === 'seedream-4.5-edit' && !data.quality) {
      return false;
    }
    return true;
  },
  {
    message: 'Model-specific parameters required',
  }
);
```

### Pattern 3: Prompt Builder Utility

**What:** Centralized function for global + folder prompt combination

**When:** Expanding job to generations

**Why:**
- Single source of truth for prompt logic
- Testable in isolation
- UI can preview final prompt
- Supports multiple combination modes (prefix, suffix, only)

**Example:**
```typescript
// lib/job/prompt-builder.ts
export function buildFinalPrompt(
  globalPrompt: string | undefined,
  folderOperation: string | undefined,
  mode: 'prefix' | 'suffix' | 'only' = 'prefix'
): string {
  // ...combination logic
}

// Used in job manager
const finalPrompt = buildFinalPrompt(
  parsedJob.job.globalPrompt,
  folder.operation,
  parsedJob.job.globalPromptMode
);

// Used in UI for preview
<PreviewPrompt
  global={globalPrompt}
  folder={folderOperation}
  mode={promptMode}
/>
```

### Pattern 4: Atomic Database Operations for Counts

**What:** Use Postgres stored procedure for decrementing job counts

**When:** Deleting a generation

**Why:**
- Atomic update (no race conditions)
- Consistent with existing job count updates
- Handles completed/failed state correctly

**Example:**
```sql
CREATE OR REPLACE FUNCTION decrement_job_counts(
  p_job_id UUID,
  p_state TEXT
)
RETURNS VOID AS $$
BEGIN
  UPDATE jobs SET
    total_generations = total_generations - 1,
    completed_generations = CASE WHEN p_state = 'completed'
      THEN completed_generations - 1 ELSE completed_generations END,
    failed_generations = CASE WHEN p_state = 'failed'
      THEN failed_generations - 1 ELSE failed_generations END
  WHERE id = p_job_id;
END;
$$ LANGUAGE plpgsql;
```

**References:**
- [Configuration Externalization Pattern (Medium)](https://medium.com/@vinciabhinav7/configuration-externalization-design-pattern-an-overview-25a05680ca73)

## Anti-Patterns to Avoid

### Anti-Pattern 1: Model Conditionals Scattered Across Codebase

**What:** if/else checks for model type in multiple files

**Why bad:**
- Hard to add new models (need to find all conditionals)
- Violates Open/Closed Principle
- Error-prone (easy to miss a spot)

**Instead:** Use Strategy pattern with factory function

```typescript
// BAD: Scattered conditionals
if (job.model === 'nano-banana-pro') {
  // Nano logic
} else if (job.model === 'seedream-4.5-edit') {
  // Seedream logic
}

// GOOD: Strategy pattern
const strategy = getModelStrategy(job.model);
const taskId = await strategy.createTask(payload);
```

### Anti-Pattern 2: String Concatenation for Prompts

**What:** Directly concatenating global and folder prompts with `+` or template literals

**Why bad:**
- Inconsistent formatting (spacing, newlines)
- Hard to change combination logic later
- No validation or preview

**Instead:** Use prompt builder utility with modes

```typescript
// BAD
const finalPrompt = globalPrompt + ' ' + folderPrompt;

// GOOD
const finalPrompt = buildFinalPrompt(globalPrompt, folderPrompt, 'prefix');
```

### Anti-Pattern 3: Deleting Without Updating Aggregates

**What:** DELETE generation record without updating job.total_generations

**Why bad:**
- Job progress percentage becomes incorrect
- "10 of 12 completed" but only 11 generations exist
- Violates database consistency

**Instead:** Use stored procedure for atomic updates

```typescript
// BAD
await supabase.from('generations').delete().eq('id', id);
// Job counts now wrong!

// GOOD
await supabase.from('generations').delete().eq('id', id);
await supabase.rpc('decrement_job_counts', { p_job_id, p_state });
```

### Anti-Pattern 4: Tight Coupling to Model Field Names

**What:** Assuming resolution always exists, or quality always exists

**Why bad:**
- Crashes when other model is used
- Hard to maintain as models evolve

**Instead:** Model-specific interfaces + strategy validation

```typescript
// BAD: Assumes resolution exists
const cost = COST_PER_IMAGE[job.resolution];

// GOOD: Model-specific lookup
const resolutionOrQuality = job.model === 'nano-banana-pro'
  ? job.resolution
  : job.quality;
const cost = COST_PER_IMAGE[job.model][resolutionOrQuality];
```

## Build Order (Suggested Phase Structure)

Based on integration dependencies, recommended build order:

### Phase 1: Foundation - Model Strategy Infrastructure (Build First)

**Why first:** All subsequent features depend on multi-model abstraction

**Components:**
1. ModelStrategy interface (lib/queue/model-strategies/base-strategy.ts)
2. NanoBananaStrategy implementation (extract existing logic)
3. SeedreamStrategy implementation (new)
4. Factory function getModelStrategy()
5. Tests for strategies

**Validation:** Existing Nano Banana Pro jobs still work, Seedream strategy unit tested

**Dependencies:** None

### Phase 2: Schema Extensions (Build Second)

**Why second:** Schema changes flow through to all other components

**Components:**
1. Add `model` field to FolderOperationSchema
2. Add `quality` field for Seedream
3. Add `globalPromptMode` to ParsedJobSchema
4. Add Zod refinements for model-specific validation
5. Database migration: add model + quality columns

**Validation:** Existing ParsedJob objects still validate, new fields optional with defaults

**Dependencies:** None (parallel with Phase 1)

### Phase 3: Queue Integration (Build Third)

**Why third:** Connects schema to strategy infrastructure

**Components:**
1. Update GenerationJob interface with model + quality fields
2. Modify executeGeneration() to use getModelStrategy()
3. Update job-manager.ts to include model in generation records
4. Update cost-estimation.ts for multi-model pricing

**Validation:** End-to-end generation works for both models

**Dependencies:** Phase 1 (strategies), Phase 2 (schema)

### Phase 4: Per-Folder Prompt Logic (Build Fourth)

**Why fourth:** Depends on schema extensions, independent of model strategy

**Components:**
1. buildFinalPrompt() utility (lib/job/prompt-builder.ts)
2. Update expandJobToGenerations() to use buildFinalPrompt()
3. Update job parser prompt (lib/ai/prompts/job-parser.ts) to understand global + folder prompts
4. Tests for prompt combination logic

**Validation:** Prompt combinations work correctly (prefix, suffix, only modes)

**Dependencies:** Phase 2 (schema)

### Phase 5: UI - Model Selection (Build Fifth)

**Why fifth:** Depends on schema and queue integration

**Components:**
1. ModelSelector component (components/job/model-selector.tsx)
2. Update cost summary to show model-specific params
3. Update folder configuration UI to show model per folder
4. Update prompt display to show hierarchy

**Validation:** User can select models, see cost estimates, preview prompts

**Dependencies:** Phase 2 (schema), Phase 3 (cost estimation)

### Phase 6: Delete Generations (Build Last)

**Why last:** Independent feature, can be built anytime

**Components:**
1. DELETE /api/generation/[id] endpoint
2. decrement_job_counts() database function
3. Delete button in generation card UI
4. Confirmation dialog

**Validation:** Delete removes record, updates job counts correctly

**Dependencies:** None (operates on existing tables)

### Parallel Work Opportunities

- **Phase 1 + Phase 2** can be built in parallel (no dependencies)
- **Phase 4 + Phase 6** can be built in parallel (independent features)
- **Phase 5** can start UI scaffolding while Phase 3 is being tested

## Scalability Considerations

| Concern | Current Scale | 10+ Models | 1000+ Folders |
|---------|--------------|-----------|---------------|
| **Strategy pattern** | 2 models (Nano, Seedream) | Add new class per model, no core changes | N/A |
| **Schema validation** | 2 models, conditional validation | May need model registry pattern | N/A |
| **Prompt combination** | Global + folder, 3 modes | Add new modes in buildFinalPrompt() | Works fine (per-generation operation) |
| **Cost estimation** | 2 models × 3-4 params | Extend COST_PER_IMAGE map | Works fine (pre-calculated, not runtime) |
| **Database queries** | model column filter | Add index on model column | Add index on folder_path |
| **API client** | 2 strategies, factory function | Consider plugin architecture | N/A |

**When to refactor:**
- **5+ models:** Introduce model registry pattern (register strategies dynamically)
- **Complex model selection logic:** Consider rule engine for model auto-selection
- **Many prompt modes:** Extract to configuration/plugin system

## Database Migration Strategy

### Migration 1: Add Model Support

```sql
-- Up
ALTER TABLE generations
  ADD COLUMN model TEXT DEFAULT 'nano-banana-pro' NOT NULL,
  ADD COLUMN quality TEXT;

CREATE INDEX idx_generations_model ON generations(model);

-- Down
DROP INDEX idx_generations_model;
ALTER TABLE generations
  DROP COLUMN quality,
  DROP COLUMN model;
```

### Migration 2: Add Job Count Decrement Function

```sql
-- Up
CREATE OR REPLACE FUNCTION decrement_job_counts(
  p_job_id UUID,
  p_state TEXT
)
RETURNS VOID AS $$
BEGIN
  UPDATE jobs
  SET
    total_generations = GREATEST(0, total_generations - 1),
    completed_generations = CASE
      WHEN p_state = 'completed' THEN GREATEST(0, completed_generations - 1)
      ELSE completed_generations
    END,
    failed_generations = CASE
      WHEN p_state = 'failed' THEN GREATEST(0, failed_generations - 1)
      ELSE failed_generations
    END
  WHERE id = p_job_id;
END;
$$ LANGUAGE plpgsql;

-- Down
DROP FUNCTION IF EXISTS decrement_job_counts(UUID, TEXT);
```

**Migration notes:**
- Model column has default for backward compatibility
- Quality column nullable (only used by Seedream)
- Index on model for efficient filtering
- GREATEST(0, ...) prevents negative counts from delete race conditions

## Testing Strategy

### Unit Tests

**Model Strategies:**
```typescript
describe('NanoBananaStrategy', () => {
  it('creates task with correct payload', async () => {
    const strategy = new NanoBananaStrategy();
    const taskId = await strategy.createTask({
      prompt: 'test',
      referenceUrls: ['url1'],
      aspectRatio: '1:1',
      resolution: '1K',
      outputFormat: 'png',
    });
    expect(taskId).toBeDefined();
  });

  it('rejects more than 8 reference images', () => {
    const strategy = new NanoBananaStrategy();
    expect(strategy.getMaxReferenceImages()).toBe(8);
  });
});
```

**Prompt Builder:**
```typescript
describe('buildFinalPrompt', () => {
  it('combines global + folder with prefix mode', () => {
    const result = buildFinalPrompt(
      'Make it professional',
      'Add blue background',
      'prefix'
    );
    expect(result).toBe('Make it professional\n\nAdd blue background');
  });

  it('uses only global when mode is "only"', () => {
    const result = buildFinalPrompt(
      'Make it professional',
      'Add blue background',
      'only'
    );
    expect(result).toBe('Make it professional');
  });
});
```

### Integration Tests

**End-to-End Generation:**
```typescript
describe('Multi-model generation', () => {
  it('generates with Nano Banana Pro', async () => {
    const job: GenerationJob = {
      id: uuid(),
      model: 'nano-banana-pro',
      resolution: '1K',
      // ...
    };

    const result = await queueManager.addGeneration(job);
    expect(result.state).toBe('completed');
  });

  it('generates with Seedream 4.5 Edit', async () => {
    const job: GenerationJob = {
      id: uuid(),
      model: 'seedream-4.5-edit',
      quality: 'basic',
      // ...
    };

    const result = await queueManager.addGeneration(job);
    expect(result.state).toBe('completed');
  });
});
```

**Delete Operation:**
```typescript
describe('DELETE /api/generation/[id]', () => {
  it('deletes generation and updates job counts', async () => {
    // Create generation
    const generation = await createTestGeneration();

    // Delete
    const response = await fetch(`/api/generation/${generation.id}`, {
      method: 'DELETE',
    });
    expect(response.ok).toBe(true);

    // Verify deleted
    const { data } = await supabase
      .from('generations')
      .select()
      .eq('id', generation.id)
      .single();
    expect(data).toBeNull();

    // Verify job counts updated
    const { data: job } = await supabase
      .from('jobs')
      .select('total_generations')
      .eq('id', generation.job_id)
      .single();
    expect(job.total_generations).toBe(originalCount - 1);
  });
});
```

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Breaking existing Nano Banana Pro jobs** | HIGH | Keep default model='nano-banana-pro', test existing flow thoroughly |
| **Strategy pattern over-engineering** | LOW | Only 2 models initially, pattern scales well |
| **Database migration fails** | MEDIUM | Test migrations on staging, use transactions, have rollback plan |
| **Prompt combination breaks existing logic** | MEDIUM | Comprehensive tests for all modes, UI preview for validation |
| **Delete without permission check** | MEDIUM | Already password-protected app, single user |
| **Model-specific params confusion** | MEDIUM | Zod validation with clear error messages, UI shows only relevant params |
| **Cost estimation wrong for Seedream** | HIGH | Verify Seedream pricing with kie.ai docs, add override in UI |

## Sources

### Architecture Patterns
- [Software Architecture Patterns 2026 (SayOne Tech)](https://www.sayonetech.com/blog/software-architecture-patterns/)
- [Layered Architecture Pattern in TypeScript (Software Patterns Lexicon)](https://softwarepatternslexicon.com/patterns-js/5/1/1/)
- [Multi-Model AI Integration Patterns (DEV Community)](https://dev.to/clayroach/day-23-llm-manager-service-layer-refactor-consolidating-multi-model-ai-integration-1k29)

### Design Patterns
- [Strategy Pattern in TypeScript (refactoring.guru)](https://refactoring.guru/design-patterns/strategy/typescript/example)
- [Environment-Aware Model Routing (LogRocket)](https://blog.logrocket.com/environment-aware-model-routing/)
- [TypeScript Design Patterns (Netguru)](https://www.netguru.com/blog/top-5-most-used-patterns-in-oop-with-typescript)

### Configuration Patterns
- [Configuration Externalization Pattern (Medium)](https://medium.com/@vinciabhinav7/configuration-externalization-design-pattern-an-overview-25a05680ca73)
- [Configuration Management Design Patterns (Software Patterns)](https://softwarepatterns.com/the-best-configuration-management-using-design-patterns)

### TypeScript Best Practices
- [TypeScript Best Practices 2026 (Johal.in)](https://johal.in/typescript-best-practices-for-large-scale-web-applications-in-2026/)
- [Generic Repository Pattern with TypeScript (Medium)](https://medium.com/@JeffyJeff/a-step-by-step-guide-to-abstraction-with-a-generic-repository-pattern-typescript-and-react-990b579c10b)
