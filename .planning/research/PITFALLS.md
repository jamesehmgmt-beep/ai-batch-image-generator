# Domain Pitfalls: Adding Multi-Model & Per-Folder Prompts

**Domain:** Adding multi-model support and per-folder prompts to existing bulk image generation system
**Researched:** 2026-01-26
**Confidence:** MEDIUM (based on WebSearch findings verified against codebase inspection)

## Critical Pitfalls

Mistakes that cause rewrites, data loss, or major breaking changes.

### Pitfall 1: Model Parameter Incompatibility Breaking Existing Jobs
**What goes wrong:** Different AI image models support different parameter sets (aspect ratios, resolutions, quality levels). Nano Banana Pro supports 11 aspect ratios and 3 quality levels; Seedream 4.5 Edit supports 8 aspect ratios and 2 quality levels. When you add Seedream support, existing ParsedJob records with "4:5" or "5:4" aspect ratios will fail because Seedream doesn't support them.

**Why it happens:** The current schema hardcodes aspect ratios as a single enum (`AspectRatioSchema`) used across all operations. There's no model-specific validation at parse time or execution time.

**Consequences:**
- Existing jobs in `parsed_job` JSONB column will reference unsupported aspect ratios
- Job execution fails silently or with cryptic API errors
- Cost estimates become incorrect (Seedream has different pricing)
- Users can't re-run historical jobs without manual editing

**Prevention:**
1. Add `model` field to `FolderOperationSchema` BEFORE adding Seedream
2. Create model-specific parameter validators:
   ```typescript
   const NANO_BANANA_ASPECTS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9', 'auto'];
   const SEEDREAM_ASPECTS = ['1:1', '4:3', '3:4', '16:9', '9:16', '2:3', '3:2', '21:9'];
   ```
3. Validate at THREE points: parse-time (AI output), save-time (before DB insert), execution-time (before API call)
4. Add migration to backfill `model: "nano-banana-pro"` to all existing generations

**Detection:**
- API errors mentioning "invalid aspect_ratio" from kie.ai
- Failed generations with error_message = "Unsupported parameter"
- Cost estimation showing $0 because model pricing lookup fails

**Phase to address:** Phase 1 (Schema Evolution) - MUST get this right before adding Seedream

---

### Pitfall 2: Cascading Deletes Destroying Job History
**What goes wrong:** Your current schema has `ON DELETE CASCADE` from jobs → generations (line 27 in migration). When you add "delete individual generation" feature, users might accidentally think they're deleting a generation but actually delete the parent job, cascading to ALL generations. Or worse, trying to delete a job deletes results that are still being downloaded.

**Why it happens:**
- CASCADE is bidirectional in how users mentally model it (delete parent = delete children makes sense, but not the reverse)
- No "soft delete" pattern means deletion is immediate and irreversible
- Bulk operations in Microsoft Power Platform show this pattern causes "stuck deletion jobs" when async processes haven't finished

**Consequences:**
- User deletes one failed generation, accidentally deletes entire job and all 500+ successful generations
- Results that were streaming in ZIP download suddenly 404
- Cost tracking becomes incorrect (deleted records not counted)
- History browsing shows gaps (job existed, now gone)

**Prevention:**
1. Implement soft deletion pattern:
   ```sql
   ALTER TABLE generations ADD COLUMN deleted_at TIMESTAMPTZ;
   ALTER TABLE jobs ADD COLUMN deleted_at TIMESTAMPTZ;
   ```
2. Change all queries to `WHERE deleted_at IS NULL`
3. Add `PROTECT` option for jobs that have completed generations:
   ```typescript
   // Before deleting generation, check if it's the last one
   const remainingGens = await supabase
     .from('generations')
     .select('id', { count: 'exact' })
     .eq('job_id', jobId)
     .is('deleted_at', null);

   if (remainingGens.count === 1) {
     throw new Error('Cannot delete last generation. Delete entire job instead.');
   }
   ```
4. Add confirmation dialog: "This will delete 1 of 523 generations. Job will remain."

**Detection:**
- User reports "I deleted one image and lost everything"
- `generations` table showing orphaned records (job_id references non-existent job)
- Supabase logs showing CASCADE triggered unexpectedly
- Download URLs 404ing mid-stream

**Phase to address:** Phase 3 (Delete Individual Generations) - MUST implement before allowing deletions

---

### Pitfall 3: Per-Folder Prompt Overriding Global Prompt Ambiguity
**What goes wrong:** Your current schema has both `FolderOperation.operation` (per-folder) and `ParsedJob.job.globalPrompt` (global). The execution logic at line 110 in `job-manager.ts` does:
```typescript
const operation = folder.operation || parsedJob.job.globalPrompt || '';
```
This is FALLBACK logic (folder OR global), not COMBINATION logic (folder AND global). When users say "Add sunglasses to all photos, and for folder 5 make them blue", they expect BOTH prompts to apply. But your code only uses the folder prompt.

**Why it happens:**
- Natural language is ambiguous about combination vs replacement
- AI parser (Claude) must infer intent from phrasing like "also", "in addition", "but for folder X"
- Current schema doesn't have a `combineWithGlobal: boolean` field

**Consequences:**
- User's global prompt ("professional lighting, high contrast") gets ignored when folder prompt exists
- Generations look inconsistent (some folders have global style, others don't)
- Re-parsing job with clarifying questions wastes API credits
- Users file "bug reports" that are actually design ambiguity

**Prevention:**
1. Add explicit combination field to schema:
   ```typescript
   export const FolderOperationSchema = z.object({
     // ...existing fields...
     promptMode: z.enum(['replace', 'append', 'prepend']).default('append')
       .describe('replace = ignore global prompt, append = add folder prompt after global, prepend = add before')
   });
   ```
2. Update AI parser system prompt to ask clarifying question:
   ```
   When user provides both global and per-folder prompts, ask:
   "Should folder-specific prompts REPLACE the global prompt, or COMBINE with it?"
   ```
3. Update execution logic:
   ```typescript
   let finalPrompt = folder.operation || '';
   if (parsedJob.job.globalPrompt && folder.promptMode !== 'replace') {
     finalPrompt = folder.promptMode === 'prepend'
       ? `${folder.operation} ${parsedJob.job.globalPrompt}`
       : `${parsedJob.job.globalPrompt} ${folder.operation}`;
   }
   ```

**Detection:**
- User complaints about "prompt not working"
- Support tickets with screenshots showing generations missing global style
- Claude clarifying questions looping infinitely trying to understand intent
- Cost estimation off because generation count differs from expectation

**Phase to address:** Phase 2 (Per-Folder Prompts) - Design decision needed BEFORE implementing

---

### Pitfall 4: Hardcoded Model Assumptions in Cost Estimation
**What goes wrong:** Your `cost-estimation.ts` hardcodes Nano Banana Pro pricing at line 27:
```typescript
const COST_PER_IMAGE: Record<Resolution, number> = {
  '1K': 0.134,
  '2K': 0.134,
  '4K': 0.24,
};
```
When Seedream 4.5 Edit launches with different pricing (likely higher for "high" quality vs "basic"), existing jobs show wrong costs. Worse: `calculateCostEstimate` doesn't accept a model parameter, so it can't compute per-model pricing even if you wanted to.

**Why it happens:**
- MVP optimized for single-model use case
- Cost function assumes resolution is the only pricing variable
- Seedream uses quality levels ("basic" = 2K, "high" = 4K) that don't map to resolution enum

**Consequences:**
- Pre-execution cost estimates show $67 but actual cost is $142 (user rage-quits)
- Job history page shows incorrect historical costs
- Billing reconciliation impossible (can't tell which jobs used which model)
- Adding price changes requires code deploy (can't update DB)

**Prevention:**
1. Create model pricing table in database:
   ```sql
   CREATE TABLE model_pricing (
     model TEXT NOT NULL,
     resolution TEXT NOT NULL,
     quality TEXT,
     cost_per_image DECIMAL(10,4) NOT NULL,
     effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
     PRIMARY KEY (model, resolution, quality, effective_date)
   );

   -- Seed with current pricing
   INSERT INTO model_pricing VALUES
     ('nano-banana-pro', '1K', NULL, 0.134, '2026-01-01'),
     ('nano-banana-pro', '2K', NULL, 0.134, '2026-01-01'),
     ('nano-banana-pro', '4K', NULL, 0.24, '2026-01-01'),
     ('seedream-4.5-edit', '2K', 'basic', 0.18, '2026-01-26'),
     ('seedream-4.5-edit', '4K', 'high', 0.32, '2026-01-26');
   ```
2. Refactor `calculateCostEstimate` to accept model per folder:
   ```typescript
   export async function calculateCostEstimate(
     operations: FolderOperation[],
     fileCountByFolder: Record<string, number>
   ): Promise<CostBreakdown> {
     const supabase = createServerSupabaseClient();

     for (const op of operations) {
       const model = op.model || 'nano-banana-pro'; // default for backward compat
       const { data: pricing } = await supabase
         .from('model_pricing')
         .select('cost_per_image')
         .eq('model', model)
         .eq('resolution', op.resolution)
         .lte('effective_date', new Date().toISOString())
         .order('effective_date', { ascending: false })
         .limit(1)
         .single();

       // ... use pricing.cost_per_image
     }
   }
   ```
3. Add `model` and `actual_cost` columns to generations table
4. Display cost breakdown by model in UI

**Detection:**
- User says "your estimate was way off"
- Supabase function errors about missing pricing for new model
- Historical job costs don't match bank statements
- A/B testing shows users abandon high-cost estimates even if accurate

**Phase to address:** Phase 1 (Schema Evolution) - Add pricing table BEFORE multi-model

---

### Pitfall 5: AI Parser Schema Drift Between Parse and Execution
**What goes wrong:** Your AI parser in `app/api/ai/parse/route.ts` has a FALLBACK hardcoded schema (lines 66-111) when zod-to-json-schema conversion fails. This fallback might be out of sync with your actual Zod schemas. When you add `model` field to `FolderOperationSchema`, you update Zod but forget to update the fallback. Result: Claude sometimes returns responses missing the model field, causing execution to use wrong model.

**Why it happens:**
- Fallback schema is copy-pasted, not derived from source of truth
- No CI test verifying fallback matches Zod schema
- zod-to-json-schema library has edge cases with transforms and unions

**Consequences:**
- Jobs intermittently use wrong model (hard to reproduce bug)
- Different users get different schema based on runtime conditions
- Cost estimates random (sometimes include model, sometimes default)
- Support nightmare (can't reproduce user's exact parse result)

**Prevention:**
1. Make Zod schema the ONLY source of truth:
   ```typescript
   // Remove fallback entirely, throw error instead
   if (!schemaProperties || Object.keys(schemaProperties).length === 0) {
     console.error('[AI Parse] Schema conversion FAILED');
     throw new Error('Critical: schema conversion failed, cannot parse job');
   }
   ```
2. Add test suite for schema conversion:
   ```typescript
   // tests/ai/schema-conversion.test.ts
   import { ParsedJobSchema } from '@/lib/ai/schemas/job';
   import { zodToJsonSchema } from 'zod-to-json-schema';

   test('schema conversion produces valid JSON Schema', () => {
     const jsonSchema = zodToJsonSchema(ParsedJobSchema, { $refStrategy: 'none' });
     expect(jsonSchema.properties).toBeDefined();
     expect(Object.keys(jsonSchema.properties)).toContain('understood');
     expect(Object.keys(jsonSchema.properties)).toContain('job');
     // Add assertions for nested job.folders structure
   });
   ```
3. Add runtime validation that Claude's response matches expected schema version:
   ```typescript
   const parsed = ParsedJobSchema.safeParse(inputData);
   if (!parsed.success) {
     // Log to monitoring service (Sentry, LogRocket, etc)
     logSchemaValidationFailure({
       zodErrors: parsed.error.issues,
       claudeResponse: inputData,
       schemaVersion: SCHEMA_VERSION,
     });
   }
   ```

**Detection:**
- Sentry alerts showing "Invalid response from AI" errors
- User reports inconsistent behavior ("sometimes it works, sometimes not")
- Different cost estimates for identical prompts
- Claude responses in logs showing fields you thought were required are missing

**Phase to address:** Phase 1 (Schema Evolution) - Harden before adding fields

---

## Moderate Pitfalls

Mistakes that cause delays, technical debt, or require refactoring.

### Pitfall 6: Reference Image Count Mismatch Between Models
**What goes wrong:** Nano Banana Pro supports max 8 reference images, Seedream 4.5 Edit supports max 14. Your `expandJobToGenerations` function at line 162 hardcodes `.slice(0, 8)`. When user selects Seedream and uploads 12 reference photos, system silently drops 4 photos without warning.

**Why it happens:** Magic number hardcoded for single-model MVP, no model-aware slicing logic.

**Prevention:**
1. Add model config constant:
   ```typescript
   const MODEL_CONFIG = {
     'nano-banana-pro': { maxRefs: 8, maxConcurrent: 20 },
     'seedream-4.5-edit': { maxRefs: 14, maxConcurrent: 20 },
   };
   ```
2. Update slicing logic:
   ```typescript
   const model = folder.model || 'nano-banana-pro';
   const maxRefs = MODEL_CONFIG[model].maxRefs;
   const allReferenceUrls = [fileUrl, ...additionalReferenceUrls].slice(0, maxRefs);
   ```
3. Show warning in UI when user uploads more than max:
   ```typescript
   if (additionalReferenceUrls.length > maxRefs) {
     showWarning(`${model} supports max ${maxRefs} references. ${additionalReferenceUrls.length - maxRefs} will be ignored.`);
   }
   ```

**Phase to address:** Phase 4 (Multi-Model Execution Engine)

---

### Pitfall 7: Global Prompt Length Not Validated Per-Model
**What goes wrong:** Different models have different token/character limits for prompts. If global prompt is 500 characters and folder prompt is 300, combined prompt might exceed model limit.

**Why it happens:** No prompt length validation at parse or execution time.

**Prevention:**
1. Add per-model prompt limits to config
2. Validate total prompt length = global + folder before API call
3. Show character counter in UI with model-specific limit
4. Offer prompt compression/summarization if over limit

**Phase to address:** Phase 2 (Per-Folder Prompts)

---

### Pitfall 8: Job Re-Execution with Different Model
**What goes wrong:** User runs job with Nano Banana, sees results, wants to re-run with Seedream for higher quality. But `parsed_job` JSONB is immutable after creation. No way to "clone job with different model" without re-uploading files.

**Why it happens:** Job design assumes one-shot execution, no concept of job templates or re-execution.

**Prevention:**
1. Add "Clone Job" feature that creates new job from existing parsed_job
2. Allow model override during clone
3. Re-validate parameters for new model (aspect ratios, etc)
4. Copy reference photos to new session folder

**Phase to address:** Post-v2.0 (consider for v3.0)

---

### Pitfall 9: Migration of Existing Jobs Missing `model` Field
**What goes wrong:** You add `model` field to schema, but 100 existing jobs in database have `parsed_job` JSONB without it. Code expects `folder.model` to exist, crashes when reading old jobs.

**Why it happens:** JSONB fields don't enforce schema, no automatic migration of JSON data.

**Prevention:**
1. Add migration to backfill default model:
   ```sql
   -- Update all existing parsed_job JSONB to add model field
   UPDATE jobs
   SET parsed_job = jsonb_set(
     parsed_job,
     '{job,folders}',
     (
       SELECT jsonb_agg(
         folder || '{"model": "nano-banana-pro"}'::jsonb
       )
       FROM jsonb_array_elements(parsed_job->'job'->'folders') AS folder
     )
   )
   WHERE parsed_job->'job'->'folders' IS NOT NULL;
   ```
2. Add TypeScript fallback for old records:
   ```typescript
   const model = folder.model || 'nano-banana-pro'; // safe default
   ```
3. Add `schema_version` field to jobs table to track JSONB structure:
   ```typescript
   const CURRENT_SCHEMA_VERSION = 2; // v1 = no model, v2 = with model
   ```

**Phase to address:** Phase 1 (Schema Evolution)

---

### Pitfall 10: Model Toggle UI State Not Persisted in Upload Session
**What goes wrong:** User uploads 500 images, selects Seedream model in UI, writes prompt, but on review page model selection is reset to default (Nano Banana). Prompt was written for Seedream parameters but executed with Nano Banana.

**Why it happens:** Upload session context (lib/session/job-context.tsx) doesn't track model selection.

**Prevention:**
1. Add model to JobContext:
   ```typescript
   interface JobContextType {
     // ...existing fields...
     selectedModel: string;
     setSelectedModel: (model: string) => void;
   }
   ```
2. Persist to sessionStorage:
   ```typescript
   useEffect(() => {
     sessionStorage.setItem('selectedModel', selectedModel);
   }, [selectedModel]);
   ```
3. Show selected model prominently on review page

**Phase to address:** Phase 2 (Per-Folder Prompts) - Add UI state management

---

## Minor Pitfalls

Mistakes that cause annoyance but are easily fixable.

### Pitfall 11: Model Names Not User-Friendly in UI
**What goes wrong:** Internal model ID "seedream-4.5-edit" shown in dropdowns instead of "Seedream 4.5 Edit (up to 14 refs)".

**Prevention:**
1. Create display name mapping:
   ```typescript
   const MODEL_DISPLAY_NAMES = {
     'nano-banana-pro': 'Nano Banana Pro (up to 8 refs)',
     'seedream-4.5-edit': 'Seedream 4.5 Edit (up to 14 refs)',
   };
   ```

**Phase to address:** Phase 2 (Per-Folder Prompts)

---

### Pitfall 12: No Model Icon/Badge in Results View
**What goes wrong:** User forgot which model they used for a job 2 weeks ago, can't tell from results page.

**Prevention:**
1. Add model badge to job card in history
2. Extract model from first generation record
3. Show model-specific icon (banana, dream cloud, etc)

**Phase to address:** Phase 4 (Multi-Model Execution Engine)

---

### Pitfall 13: Cost Breakdown Doesn't Show Per-Model Totals
**What goes wrong:** Job uses 200 Nano Banana + 100 Seedream generations. Cost page shows total but not breakdown by model.

**Prevention:**
1. Group cost breakdown by model:
   ```typescript
   byModel: {
     'nano-banana-pro': { images: 200, cost: 28.40 },
     'seedream-4.5-edit': { images: 100, cost: 32.00 },
   }
   ```

**Phase to address:** Phase 1 (Schema Evolution)

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Schema Evolution | Adding `model` field breaks existing JSONB records | Backfill migration + TypeScript fallback |
| Per-Folder Prompts | Global + folder prompt combination ambiguity | Add `promptMode` enum, update AI parser to ask clarifying question |
| Delete Generations | CASCADE deletes entire job when user deletes one generation | Implement soft delete pattern, add confirmation dialogs |
| Multi-Model Execution | Model-specific parameter validation missed at execution time | Three-tier validation (parse, save, execute) |
| Reference Photos | Max reference count differs by model, silent truncation | Model-aware slicing + UI warnings |
| Cost Estimation | Hardcoded pricing can't handle multi-model or price changes | Database-backed pricing table with effective dates |

---

## Migration Checklist for v2.0

Before implementing new features, complete these migrations to avoid pitfalls:

- [ ] **Database schema changes:**
  - [ ] Add `model TEXT` column to generations table
  - [ ] Add `model_pricing` table with seeded values
  - [ ] Add `deleted_at TIMESTAMPTZ` to jobs and generations tables
  - [ ] Add `schema_version INTEGER` to jobs table
  - [ ] Backfill `model = 'nano-banana-pro'` to existing generations
  - [ ] Backfill `schema_version = 1` to existing jobs

- [ ] **Zod schema changes:**
  - [ ] Add `model` field to `FolderOperationSchema`
  - [ ] Add `promptMode` enum to `FolderOperationSchema`
  - [ ] Create model-specific aspect ratio validators
  - [ ] Create model-specific resolution validators

- [ ] **TypeScript changes:**
  - [ ] Refactor `calculateCostEstimate` to query pricing table
  - [ ] Add `MODEL_CONFIG` constant with per-model limits
  - [ ] Update `expandJobToGenerations` to use model-aware slicing
  - [ ] Add soft delete utility functions
  - [ ] Update all queries to filter `deleted_at IS NULL`

- [ ] **AI Parser changes:**
  - [ ] Update system prompt to explain Nano Banana vs Seedream differences
  - [ ] Add clarifying question for global + folder prompt combination
  - [ ] Remove hardcoded fallback schema (fail fast instead)
  - [ ] Add schema version to parsed output

- [ ] **Testing:**
  - [ ] Test zod-to-json-schema conversion for new schema
  - [ ] Test backward compatibility with v1.0 jobs
  - [ ] Test CASCADE delete behavior with soft deletes
  - [ ] Test cost calculation for mixed-model jobs
  - [ ] Test parameter validation for each model

---

## Sources

**Multi-Model Abstraction Patterns:**
- [A Guide to Large Language Model Abstractions - Two Sigma](https://www.twosigma.com/articles/a-guide-to-large-language-model-abstractions/)
- [Top 5 LiteLLM Alternatives in 2026](https://www.truefoundry.com/blog/litellm-alternatives)
- [5 Patterns for Scalable LLM Service Integration](https://latitude-blog.ghost.io/blog/5-patterns-for-scalable-llm-service-integration/)

**AI Image Generation Best Practices:**
- [How to Generate 100+ Images in Seconds in 2025](https://bulkimagegeneration.com/blog/en/tutorials/how-to-generate-100-ai-images-in-seconds-the-ultimate-guide-to-ai-bulk-image-generation-2025)
- [Complete Guide to AI Image Generation APIs in 2026](https://wavespeed.ai/blog/posts/complete-guide-ai-image-apis-2026/)
- [10 AI Image Generation Mistakes 99% Of People Make](https://www.godofprompt.ai/blog/10-ai-image-generation-mistakes-99percent-of-people-make-and-how-to-fix-them)

**Model API Compatibility:**
- [OpenRouter Image Generation Documentation](https://openrouter.ai/docs/guides/overview/multimodal/image-generation)
- [AI SDK Core: Image Generation](https://ai-sdk.dev/docs/ai-sdk-core/image-generation)
- [How to Specify Aspect Ratio in Nano Banana Pro: Complete 2025 Developer Guide](https://www.aifreeapi.com/en/posts/nano-banana-pro-aspect-ratio-guide)

**Database Migration Patterns:**
- [Strategies for Reliable Schema Migrations | Atlas](https://atlasgo.io/blog/2024/10/09/strategies-for-reliable-migrations)
- [Rails Data Migration Best Practices Guide 2026](https://www.railscarma.com/blog/rails-data-migration-best-practices-guide/)
- [Common Challenges in Schema Migration & How To Overcome Them](https://www.metisdata.io/blog/common-challenges-in-schema-migration-how-to-overcome-them)

**Cascade Delete Best Practices:**
- [Cascade Deletes | Supabase Docs](https://supabase.com/docs/guides/database/postgres/cascade-deletes)
- [Cascade Delete - EF Core | Microsoft Learn](https://learn.microsoft.com/en-us/ef/core/saving/cascade-delete)
- [Postgres ON DELETE CASCADE - A Comprehensive Guide](https://www.dbvis.com/thetable/postgres-on-delete-cascade-a-guide/)

**Bulk Job Management:**
- [Removing Jobs | BullMQ](https://docs.bullmq.io/guide/queues/removing-jobs)
- [Delete bulk records - Power Platform | Microsoft Learn](https://learn.microsoft.com/en-us/power-platform/admin/delete-bulk-records)
- [Bulk deletion jobs: view, pause, postpone, resume, or cancel](https://learn.microsoft.com/en-us/power-platform/admin/view-take-action-bulk-deletion-jobs)
