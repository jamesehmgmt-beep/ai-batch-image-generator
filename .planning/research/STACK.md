# Technology Stack for Multi-Model + Per-Folder Prompts

**Project:** BulkImageGen v2.0
**Researched:** 2026-01-26
**Scope:** Stack additions for multi-model support (Nano Banana Pro + Seedream 4.5 Edit) and per-folder prompt UX
**Confidence:** HIGH

## Executive Summary

v2.0 adds multi-model support and per-folder prompts to existing v1.0 architecture. **No new external dependencies required.** The existing stack (Next.js, TypeScript, Zod, Supabase) provides all necessary primitives. Implementation requires:

1. **Model abstraction layer** using Strategy Pattern (native TypeScript)
2. **Schema extensions** for model selection and model-specific parameters
3. **Conditional UI** using existing React patterns
4. **Database schema additions** (single column: `model`)

**Anti-recommendation:** Do NOT add heavy abstraction libraries like Vercel AI SDK or ModelFusion. The app only needs 2 models with specific APIs—over-engineering would add complexity without benefit.

---

## Stack Additions (What's NEW for v2.0)

### None Required

All capabilities exist in current stack:
- TypeScript interfaces for model abstraction
- Zod for runtime validation of model-specific params
- React Hook Form's `watch()` for conditional UI
- Supabase JSONB for flexible model parameter storage

---

## Architecture Patterns (NEW for v2.0)

### 1. Model Abstraction Layer

**Pattern:** Strategy Pattern with TypeScript interfaces

**Why this pattern:**
- Only 2 models (not 20), so lightweight approach is appropriate
- Each model has unique parameter sets (quality vs resolution, different aspect ratios)
- Models may have different retry strategies or error handling
- Need to swap models at generation-time based on user choice

**Implementation structure:**

```typescript
// lib/models/types.ts
export interface ModelCapabilities {
  id: 'nano-banana-pro' | 'seedream-4.5-edit';
  displayName: string;
  maxReferenceImages: number;
  supportedResolutions: string[];
  supportedAspectRatios: string[];
  supportedFormats: string[];
  costPerGeneration: Record<string, number>; // By resolution/quality
}

export interface ModelGenerationParams {
  model: 'nano-banana-pro' | 'seedream-4.5-edit';
  prompt: string;
  referenceImages: string[];
  aspectRatio: string;
  // Model-specific params
  nanoBananaParams?: {
    resolution: '1K' | '2K' | '4K';
    outputFormat: 'png' | 'jpg';
  };
  seedreamParams?: {
    quality: 'basic' | 'high'; // basic=2K, high=4K
  };
}

export interface ModelClient {
  readonly capabilities: ModelCapabilities;
  createTask(params: ModelGenerationParams): Promise<string>; // Returns taskId
  pollTask(taskId: string): Promise<{ resultUrl: string }>;
  classifyError(error: unknown): ErrorClassification; // For model-specific retry logic
}
```

**Why NOT use existing abstraction libraries:**

| Library | Why Not Use |
|---------|-------------|
| Vercel AI SDK | Built for LLMs (streaming, tool calling), not image generation APIs. Over-engineered for our use case. |
| ModelFusion | Same—designed for multi-modal AI apps with complex orchestration. We just need HTTP clients for 2 image APIs. |
| LangChain.js | Massive dependency for simple API abstraction. Adds 50+ packages for functionality we don't need. |
| Replicate SDK | Replicate-specific, doesn't support kie.ai. Would need custom wrappers anyway. |

**Recommendation:** Build thin abstraction (3 files, ~200 LOC total) rather than add heavyweight framework.

---

### 2. Model-Specific Parameters

**Current schema (v1.0):** Fixed parameters tied to Nano Banana Pro

```typescript
// lib/ai/schemas/job.ts (v1.0)
export const FolderOperationSchema = z.object({
  folderPath: z.string(),
  operation: z.string(),
  resolution: ResolutionSchema, // '1K' | '2K' | '4K'
  aspectRatio: AspectRatioSchema,
  photoMode: PhotoModeSchema,
  outputFormat: z.enum(['PNG', 'JPG']),
  // ...
});
```

**Proposed schema (v2.0):** Model selection + conditional parameters

```typescript
// lib/ai/schemas/job.ts (v2.0)
export const ModelSchema = z.enum(['nano-banana-pro', 'seedream-4.5-edit']);

export const NanoBananaParamsSchema = z.object({
  resolution: z.enum(['1K', '2K', '4K']),
  outputFormat: z.enum(['PNG', 'JPG', 'png', 'jpg'])
    .transform(v => v.toUpperCase() as 'PNG' | 'JPG'),
});

export const SeedreamParamsSchema = z.object({
  quality: z.enum(['basic', 'high']), // basic=2K, high=4K
  // outputFormat not available in Seedream API
});

export const FolderOperationSchema = z.object({
  folderPath: z.string(),
  operation: z.string(),
  model: ModelSchema.describe('Which AI model to use for this folder'),
  aspectRatio: AspectRatioSchema, // Union of both models' supported ratios
  photoMode: PhotoModeSchema,

  // Model-specific params (discriminated union)
  nanoBananaParams: NanoBananaParamsSchema.optional()
    .describe('Required when model=nano-banana-pro'),
  seedreamParams: SeedreamParamsSchema.optional()
    .describe('Required when model=seedream-4.5-edit'),

  // Shared params
  generationCount: z.number().int().min(1).max(100).optional(),
  excludedFiles: z.array(z.string()).optional(),
})
.refine(
  (data) => {
    // Validate model-specific params are present
    if (data.model === 'nano-banana-pro') return !!data.nanoBananaParams;
    if (data.model === 'seedream-4.5-edit') return !!data.seedreamParams;
    return false;
  },
  { message: 'Model-specific parameters required' }
);
```

**Why discriminated unions:**
- Type-safe at compile time (TypeScript narrows based on `model` field)
- Runtime-validated by Zod
- Explicit about which params go with which model
- Easy to add future models without breaking changes

---

### 3. Database Schema Changes

**Current schema (v1.0):** Model implicitly "nano-banana-pro"

```sql
-- supabase/migrations/001_jobs_and_generations.sql
CREATE TABLE generations (
  id UUID PRIMARY KEY,
  resolution TEXT NOT NULL,
  aspect_ratio TEXT NOT NULL,
  -- No model field
);
```

**Proposed migration (v2.0):** Add model column with default

```sql
-- supabase/migrations/002_add_model_support.sql

-- Add model column to generations table
ALTER TABLE generations
  ADD COLUMN model TEXT NOT NULL DEFAULT 'nano-banana-pro'
  CHECK (model IN ('nano-banana-pro', 'seedream-4.5-edit'));

-- Add model-specific params as JSONB (flexible for different param shapes)
ALTER TABLE generations
  ADD COLUMN model_params JSONB NOT NULL DEFAULT '{}';

-- Update cost estimation to account for model
ALTER TABLE jobs
  ADD COLUMN cost_breakdown JSONB; -- Store per-model costs

-- Index for querying by model
CREATE INDEX idx_generations_model ON generations(model);
```

**Why JSONB for model_params:**
- Each model has different parameter shapes
- Avoids 8+ nullable columns (resolution, quality, output_format, etc.)
- Easy to query with Postgres JSONB operators if needed
- Forward-compatible with new models

**Migration strategy:**
- Default to 'nano-banana-pro' for backward compatibility
- Existing generations continue working
- New generations specify model explicitly

---

### 4. Per-Folder Prompt UX Pattern

**Requirement:** Each folder can have its own prompt OR use global prompt

**UI Pattern:** Configuration hierarchy (inspired by Git config model)

```
Global prompt (applies to all folders)
  └─ Folder 1 prompt (overrides global for this folder)
  └─ Folder 2 prompt (overrides global for this folder)
  └─ Folder 3 (uses global)
```

**Schema already supports this (v1.0):**

```typescript
export const FolderOperationSchema = z.object({
  folderPath: z.string(),
  operation: z.string(), // Per-folder prompt
  // ...
});

export const ParsedJobSchema = z.object({
  job: z.object({
    folders: z.array(FolderOperationSchema),
    globalPrompt: z.string().optional(), // Global fallback
  }),
});
```

**Existing code already implements fallback:**

```typescript
// lib/job/job-manager.ts (v1.0)
const operation = folder.operation || parsedJob.job.globalPrompt || '';
```

**No changes needed!** v1.0 already supports per-folder prompts. v2.0 just needs UI to expose this capability.

**UI component pattern (NEW for v2.0):**

```tsx
// components/job/folder-settings.tsx
function FolderSettings({ folder, globalPrompt }) {
  const [useGlobal, setUseGlobal] = useState(!folder.operation);

  return (
    <div>
      <label>
        <input
          type="checkbox"
          checked={useGlobal}
          onChange={(e) => setUseGlobal(e.target.checked)}
        />
        Use global prompt for this folder
      </label>

      {!useGlobal && (
        <textarea
          value={folder.operation}
          placeholder="Enter folder-specific prompt..."
        />
      )}

      {useGlobal && globalPrompt && (
        <div className="text-muted">
          Will use: "{globalPrompt}"
        </div>
      )}
    </div>
  );
}
```

**Pattern:** Checkbox to toggle between global and per-folder, with visual feedback showing what will be used.

---

### 5. Conditional UI for Model-Specific Parameters

**Problem:** When user selects model, show only relevant parameters

**Solution:** React Hook Form's `watch()` + conditional rendering

```tsx
// components/job/model-settings.tsx
import { useFormContext } from 'react-hook-form';

function ModelSettings({ folderIndex }) {
  const { watch } = useFormContext();
  const selectedModel = watch(`folders.${folderIndex}.model`);

  return (
    <div>
      <Select name={`folders.${folderIndex}.model`}>
        <option value="nano-banana-pro">Nano Banana Pro</option>
        <option value="seedream-4.5-edit">Seedream 4.5 Edit</option>
      </Select>

      {selectedModel === 'nano-banana-pro' && (
        <NanoBananaSettings folderIndex={folderIndex} />
      )}

      {selectedModel === 'seedream-4.5-edit' && (
        <SeedreamSettings folderIndex={folderIndex} />
      )}
    </div>
  );
}

function NanoBananaSettings({ folderIndex }) {
  return (
    <>
      <Select name={`folders.${folderIndex}.nanoBananaParams.resolution`}>
        <option value="1K">1K</option>
        <option value="2K">2K</option>
        <option value="4K">4K</option>
      </Select>
      <Select name={`folders.${folderIndex}.nanoBananaParams.outputFormat`}>
        <option value="PNG">PNG</option>
        <option value="JPG">JPG</option>
      </Select>
    </>
  );
}

function SeedreamSettings({ folderIndex }) {
  return (
    <Select name={`folders.${folderIndex}.seedreamParams.quality`}>
      <option value="basic">Basic (2K)</option>
      <option value="high">High (4K)</option>
    </Select>
  );
}
```

**Why this pattern:**
- No external library needed (React Hook Form already in use)
- Type-safe with discriminated union types
- Form state automatically managed
- Only renders fields user needs to see

**Alternative considered:** Dynamic form libraries (Formik, React Final Form)
**Why not:** Already using React Hook Form. No benefit to switching.

---

## Cost Estimation Updates

**Current (v1.0):** Fixed Nano Banana Pro pricing

```typescript
// lib/job/cost-estimation.ts
const COST_PER_IMAGE: Record<Resolution, number> = {
  '1K': 0.134,
  '2K': 0.134,
  '4K': 0.24,
};
```

**Proposed (v2.0):** Model-aware cost calculation

```typescript
// lib/job/cost-estimation.ts
const COST_BY_MODEL = {
  'nano-banana-pro': {
    '1K': 0.134,
    '2K': 0.134,
    '4K': 0.24,
  },
  'seedream-4.5-edit': {
    'basic': 0.15,  // Approximate—needs verification
    'high': 0.30,   // Approximate—needs verification
  },
};

export function calculateCostEstimate(
  operations: FolderOperation[],
  fileCountByFolder: Record<string, number>
): CostBreakdown {
  const byModel: Record<string, Record<string, number>> = {};

  for (const op of operations) {
    const costs = COST_BY_MODEL[op.model];
    const resolution = op.model === 'nano-banana-pro'
      ? op.nanoBananaParams!.resolution
      : op.seedreamParams!.quality;

    // Calculate cost based on model + resolution/quality
    const effectiveCount = /* same logic as v1.0 */;
    const costPerImage = costs[resolution];
    // ...
  }

  return { /* breakdown by model and resolution/quality */ };
}
```

**CRITICAL:** Seedream 4.5 Edit pricing needs research. Values above are placeholders.

---

### 6. Delete Individual Generations

**Requirement:** User can delete individual failed/unwanted generations

**Implementation:**

```typescript
// app/api/generation/[id]/route.ts
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const supabase = createServerSupabaseClient();

  // Delete from database
  const { error } = await supabase
    .from('generations')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Optionally delete result image from storage
  // (if you want to free up space)

  return NextResponse.json({ success: true });
}
```

**UI Component:**

```tsx
// components/job/generation-item.tsx
function GenerationItem({ generation }) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm('Delete this generation?')) return;

    setIsDeleting(true);
    await fetch(`/api/generation/${generation.id}`, {
      method: 'DELETE',
    });
    // Refetch job status to update UI
  };

  return (
    <div>
      <img src={generation.resultUrl} />
      <button onClick={handleDelete} disabled={isDeleting}>
        Delete
      </button>
    </div>
  );
}
```

**Pattern:** Simple DELETE endpoint + confirmation dialog. No undo needed (user can regenerate).

---

## Integration Points

### Existing v1.0 Code Requiring Updates

| File | Change | Reason |
|------|--------|--------|
| `lib/ai/schemas/job.ts` | Add model selection, discriminated union params | Support multi-model |
| `lib/queue/kie-api-client.ts` | Extract interface, rename to `nano-banana-client.ts` | Separate model-specific client |
| `lib/queue/generation-queue.ts` | Use model client factory, dispatch to correct client | Route to correct API |
| `lib/job/cost-estimation.ts` | Model-aware pricing | Accurate cost estimates |
| `supabase/migrations/` | Add model column, model_params JSONB | Persist model choice |
| `components/job/` | Add model selector, conditional param UI | User can choose model |

### New Files to Create

| File | Purpose |
|------|---------|
| `lib/models/types.ts` | Model abstraction interfaces |
| `lib/models/nano-banana-client.ts` | Nano Banana Pro implementation (refactor from kie-api-client.ts) |
| `lib/models/seedream-client.ts` | Seedream 4.5 Edit implementation |
| `lib/models/factory.ts` | Model client factory (returns correct client based on model ID) |
| `lib/models/capabilities.ts` | Model capabilities registry (for UI dropdowns, validation) |
| `components/job/model-selector.tsx` | Model selection UI |
| `components/job/model-params.tsx` | Conditional params UI |
| `app/api/generation/[id]/route.ts` | DELETE endpoint for individual generations |

---

## What NOT to Add

### 1. Heavy Abstraction Libraries

**Don't add:**
- Vercel AI SDK
- ModelFusion
- LangChain.js
- Replicate SDK

**Why:** These are built for LLM orchestration (streaming, tool calling, agents), not simple image generation HTTP APIs. Adding them would:
- Increase bundle size by 5-10MB
- Add maintenance burden (dependency updates)
- Create unnecessary abstraction layers
- Slow down build times

**Our use case:** 2 image generation APIs with fixed parameters. A 200-line abstraction is sufficient.

---

### 2. Complex Form Libraries

**Don't add:**
- Formik
- React Final Form
- TanStack Form

**Why:** Already using React Hook Form. It handles conditional rendering via `watch()` and dynamic field registration. Switching libraries would:
- Create inconsistency in codebase (two form libraries)
- Require rewriting existing forms
- Add learning curve for no benefit

---

### 3. Model Registry Systems

**Don't add:**
- Database-driven model registry
- Admin UI for adding models
- Plugin architecture for models

**Why:** Only 2 models, both hardcoded in app. Over-engineering for future flexibility that may never be needed. YAGNI principle applies.

**When to reconsider:** If model count reaches 5+, consider dynamic registry.

---

## Implementation Order (Recommended)

Based on dependencies and risk:

1. **Database migration** (foundation)
   - Add model column, model_params JSONB
   - Backfill existing records with 'nano-banana-pro'

2. **Model abstraction layer** (backend)
   - Define interfaces in `lib/models/types.ts`
   - Refactor Nano Banana client
   - Implement Seedream client
   - Create factory

3. **Schema updates** (validation)
   - Extend Zod schemas with model selection
   - Add discriminated union for model params
   - Update TypeScript types

4. **Cost estimation** (business logic)
   - Update cost calculation for multi-model
   - Add model-specific pricing
   - Test edge cases

5. **Queue integration** (execution)
   - Update generation-queue.ts to use model factory
   - Route generations to correct API client
   - Test retry logic per model

6. **UI components** (user-facing)
   - Model selector component
   - Conditional parameter forms
   - Update job summary to show model
   - Update cost display

7. **Delete generations feature** (independent)
   - API endpoint: DELETE /api/generation/[id]
   - UI: Delete button per generation
   - Confirmation dialog

**Rationale:** Backend-first ensures type safety propagates to frontend. UI is last because it depends on all backend changes.

---

## Confidence Assessment

| Area | Confidence | Reasoning |
|------|------------|-----------|
| Model abstraction pattern | HIGH | Strategy pattern is well-established for this use case. TypeScript provides excellent type safety. |
| Schema design | HIGH | Discriminated unions are TypeScript best practice. Zod validation proven in v1.0. |
| Database migration | HIGH | Simple column additions, backward compatible. |
| Conditional UI | HIGH | React Hook Form `watch()` is documented pattern for conditional fields. |
| Cost estimation | MEDIUM | Nano Banana pricing known. Seedream pricing needs verification. |
| Per-folder prompts | HIGH | Already implemented in v1.0, just needs UI exposure. |
| Delete generations | HIGH | Simple CRUD operation with existing patterns. |

---

## Open Questions / Research Needed

1. **Seedream 4.5 Edit pricing** - Need official pricing for basic (2K) and high (4K) quality
2. **Seedream output format** - Can we specify PNG vs JPG? Or is it fixed?
3. **Seedream rate limits** - Same 20 concurrent as Nano Banana, or different?
4. **Seedream error responses** - What error codes/messages does API return? (For retry classification)

**How to resolve:**
- Check Seedream API documentation
- Contact kie.ai support if docs unclear
- Test API during implementation to observe error responses

---

## Sources

**Model abstraction patterns:**
- [Strategy Pattern in TypeScript](https://refactoring.guru/design-patterns/strategy/typescript/example) - Strategy pattern examples
- [Design Patterns in TypeScript](https://refactoring.guru/design-patterns/typescript) - GoF patterns reference

**Configuration hierarchy UX:**
- [Overrides: Content/Folder/Core-Specific Settings](https://docs.libretro.com/guides/overrides/) - Configuration override patterns
- [Per-folder git configuration](https://www.damirscorner.com/blog/posts/20251114-PerFolderGitConfiguration.html) - Git's hierarchical config model
- [How to Improve App Settings UX](https://www.toptal.com/designers/ux/settings-ux) - Settings UX best practices

**Conditional forms in React:**
- [Conditionally Render Fields Using React Hook Form](https://echobind.com/post/conditionally-render-fields-using-react-hook-form) - Watch + conditional rendering pattern
- [Advanced Usage - React Hook Form](https://react-hook-form.com/advanced-usage) - Dynamic field registration
- [Hands-On: Adaptive Forms with Conditional Rendering in React](https://dev.to/pixel_mosaic/hands-on-adaptive-forms-with-conditional-rendering-in-react-ip2) - Conditional form patterns

**Why NOT to use abstraction libraries:**
- Based on codebase analysis: App has simple use case (2 APIs, fixed parameters)
- Vercel AI SDK and ModelFusion designed for LLMs (streaming, tool calling, agents)
- YAGNI principle: Don't add infrastructure for hypothetical future needs
- Existing stack (TypeScript + Zod) provides all needed type safety

---

## Validation Checklist

- [x] Integration with existing stack considered (no new external deps needed)
- [x] Model abstraction pattern specified (Strategy with TypeScript interfaces)
- [x] Database schema changes identified (model column, model_params JSONB)
- [x] UI patterns specified (conditional rendering via React Hook Form watch())
- [x] Cost estimation updates specified (model-aware pricing)
- [x] What NOT to add documented (heavy abstraction libraries)
- [x] Implementation order recommended (backend-first for type safety)
- [x] Open questions flagged (Seedream pricing, format, rate limits)
- [x] Delete generations feature specified (DELETE endpoint + UI)
- [x] Per-folder prompt capability confirmed (already exists in v1.0)
