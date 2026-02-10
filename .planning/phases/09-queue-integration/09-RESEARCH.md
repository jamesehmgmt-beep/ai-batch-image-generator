# Phase 9: Queue Integration - Research

**Researched:** 2026-01-26
**Domain:** Queue processing with strategy pattern integration
**Confidence:** HIGH

## Summary

Phase 9 integrates the existing Strategy Pattern (Phase 7-8) with the generation queue (Phase 3-5) to support dynamic model selection, model-specific parameter handling, and accurate cost estimation during queue execution. The research focuses on how to modify queue processing to use ModelStrategy instances instead of hardcoded model logic.

The current queue (lib/queue/generation-queue.ts) is hardcoded to use 'nano-banana-pro' with fixed parameters. Phase 9 replaces this with strategy-based processing where each GenerationJob carries its model ID, and the queue calls the appropriate strategy's createTask() and pollTask() methods. This enables support for Seedream 4.5 Edit with its 14-reference-image limit and different parameter conventions.

Cost estimation already uses strategy-based pricing (Phase 8) via getModelStrategy().capabilities.costPerGeneration. Queue integration requires no changes to cost estimation logic, only ensuring that the correct model is selected during job expansion and persisted to the generations table.

**Primary recommendation:** Modify GenerationQueueManager.executeGeneration() to use getModelStrategy(job.model) instead of hardcoded kie.ai client calls, and ensure reference image arrays are sliced to strategy.capabilities.maxReferenceImages before task creation.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| p-queue | 8.0+ | Concurrent queue with auto-feeding | Industry standard for promise-based queue processing with concurrency limits |
| p-retry | 6.0+ | Automatic retry with exponential backoff | Used by both strategies for robust API retry logic |
| TypeScript | 5.3+ | Type-safe strategy selection | Ensures exhaustive model ID checking at compile time |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| AbortError | (from p-retry) | Non-retryable error signaling | Distinguish permanent failures (401, 402, 422) from transient errors (429, 5xx) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| p-queue | BullMQ | BullMQ requires Redis infrastructure; p-queue is simpler for in-process queuing |
| Strategy Pattern | If-else branching | Strategy pattern provides type safety, extensibility, and compile-time model checking |

**Installation:**
```bash
# Already installed from Phase 3 and Phase 7
npm install p-queue p-retry
```

## Architecture Patterns

### Recommended Project Structure
```
lib/
├── queue/
│   ├── generation-queue.ts     # Queue manager using strategies
│   ├── kie-api-client.ts       # DEPRECATED after Phase 9
│   └── retry-strategies.ts     # Error classification
├── models/
│   ├── types.ts                # ModelStrategy interface
│   ├── model-factory.ts        # getModelStrategy()
│   ├── nano-banana-strategy.ts # NanoBananaStrategy
│   └── seedream-strategy.ts    # SeedreamStrategy
└── job/
    ├── job-manager.ts          # expandJobToGenerations() with model selection
    └── cost-estimation.ts      # Strategy-based pricing (already done)
```

### Pattern 1: Strategy-Based Queue Processing
**What:** Replace hardcoded model logic with strategy lookup and delegation
**When to use:** When queue needs to support multiple models with different APIs/parameters
**Example:**
```typescript
// Source: Existing codebase analysis + strategy pattern best practices
// Before (Phase 3-5): Hardcoded to nano-banana-pro
const payload: KieAIPayload = {
  model: 'nano-banana-pro',
  input: { ... }
};
const taskId = await createKieAITask(payload);

// After (Phase 9): Strategy-based
const strategy = getModelStrategy(job.model);
const params = buildModelParams(job, strategy);
const taskId = await strategy.createTask(params);
const { resultUrl } = await strategy.pollTask(taskId);
```

### Pattern 2: Reference Image Slicing Based on Model Capabilities
**What:** Slice reference image arrays to model-specific limits before task creation
**When to use:** When different models support different numbers of reference images
**Example:**
```typescript
// Source: TypeScript array slicing + model capabilities pattern
const strategy = getModelStrategy(job.model);
const maxRefs = strategy.capabilities.maxReferenceImages; // 8 for Nano, 14 for Seedream

// Slice to model limit
const referenceImages = job.referenceImageUrls.slice(0, maxRefs);

const params: ModelGenerationParams = {
  prompt: finalPrompt,
  referenceImages, // Already sliced to model limit
  aspectRatio: job.aspectRatio,
  // Model-specific fields added based on strategy type
};
```

### Pattern 3: Model-Specific Parameter Building
**What:** Construct model-specific parameters based on GenerationJob fields
**When to use:** When different models require different parameter structures
**Example:**
```typescript
// Source: Existing strategy implementations + TypeScript type narrowing
function buildModelParams(
  job: GenerationJob,
  strategy: ModelStrategy
): ModelGenerationParams {
  const baseParams = {
    prompt: job.operation,
    referenceImages: job.referenceImageUrls.slice(0, strategy.capabilities.maxReferenceImages),
    aspectRatio: job.aspectRatio,
  };

  if (strategy.capabilities.id === 'nano-banana-pro') {
    return {
      ...baseParams,
      resolution: job.resolution || '2K',
      outputFormat: job.outputFormat?.toLowerCase() as 'png' | 'jpg',
    } as NanoBananaParams;
  } else if (strategy.capabilities.id === 'seedream-4.5-edit') {
    return {
      ...baseParams,
      quality: job.quality || 'basic',
      imageSize: job.imageSize || 'square',
    } as SeedreamParams;
  }

  throw new Error(`Unknown model: ${strategy.capabilities.id}`);
}
```

### Pattern 4: Error Classification Delegation to Strategies
**What:** Strategies handle their own error classification since they know their API
**When to use:** When different models may have different error codes/retry semantics
**Example:**
```typescript
// Source: p-retry AbortError pattern + existing retry-strategies.ts
// Current: Centralized error classification in retry-strategies.ts
// This works because both models use kie.ai API with same error codes

// Future extensibility: If models have different APIs
interface ModelStrategy {
  createTask(params: ModelGenerationParams): Promise<string>;
  pollTask(taskId: string): Promise<{ resultUrl: string }>;
  validateParams(params: ModelGenerationParams): void;
  // Optional: classifyError(error: unknown): { retryable: boolean; strategy: string }
}
```

### Anti-Patterns to Avoid
- **Hardcoding model names in queue logic:** Use job.model field and getModelStrategy() instead
- **Mixing parameter types:** Don't pass NanoBananaParams to Seedream or vice versa; use discriminated unions
- **Ignoring reference image limits:** Always slice arrays to strategy.capabilities.maxReferenceImages
- **Bypassing strategy validation:** Call strategy.validateParams() before createTask() to catch errors early
- **Forgetting to persist model:** Ensure generations table stores model field so queue knows which strategy to use

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Concurrent queue processing | Custom queue with Promise.all | p-queue with concurrency limit | p-queue handles auto-feeding, backpressure, pause/resume, and event monitoring |
| Retry with exponential backoff | setTimeout loops | p-retry with AbortError | p-retry handles jitter, retry budgets, error classification callbacks, and non-retryable errors |
| Model parameter validation | Runtime checks in queue | strategy.validateParams() | Strategies know their own parameter constraints; centralized validation causes coupling |
| Reference image slicing | Manual if-else per model | strategy.capabilities.maxReferenceImages | Capabilities object provides single source of truth; new models auto-supported |
| Cost calculation | Hardcoded pricing per model | strategy.capabilities.costPerGeneration | Already implemented in Phase 8; maintains single source of pricing truth |

**Key insight:** The Strategy pattern exists to encapsulate model-specific logic. Queue processing should be model-agnostic and delegate all model-specific operations to strategies. Don't duplicate model knowledge in the queue.

## Common Pitfalls

### Pitfall 1: Missing Model Field in GenerationJob
**What goes wrong:** Queue receives GenerationJob without model field, defaults to nano-banana-pro, ignores user's model selection
**Why it happens:** Job expansion in expandJobToGenerations() doesn't copy model from FolderOperation to GenerationJob
**How to avoid:**
1. Ensure ParsedJob.job.folders[].model is populated during parsing (Phase 2)
2. Copy folder.model || DEFAULT_MODEL to GenerationJob.model in expandJobToGenerations()
3. Persist job.model to generations.model in database insert
**Warning signs:** All generations show 'nano-banana-pro' even when user selected Seedream; cost estimates don't match execution model

### Pitfall 2: Reference Images Exceed Model Limit
**What goes wrong:** GenerationJob has 14 reference images, queue passes all 14 to Nano Banana strategy, API rejects with validation error
**Why it happens:** Job expansion doesn't slice reference arrays based on model capabilities
**How to avoid:**
1. Slice in job-manager.ts during expansion: `referenceUrls.slice(0, 8)` for Nano
2. Slice again in queue as defense-in-depth: `job.referenceImageUrls.slice(0, strategy.capabilities.maxReferenceImages)`
3. Call strategy.validateParams() before createTask() to catch violations
**Warning signs:** Generations fail immediately with "too many reference images" errors; retry attempts don't help

### Pitfall 3: Wrong Parameter Type Passed to Strategy
**What goes wrong:** Queue passes NanoBananaParams with `resolution: '2K'` to SeedreamStrategy, which expects `quality: 'basic'`
**Why it happens:** GenerationJob has all possible fields (resolution, quality, imageSize); queue doesn't build model-specific params
**How to avoid:**
1. Create buildModelParams() helper that constructs correct param type based on strategy.capabilities.id
2. Use TypeScript discriminated unions to ensure type safety
3. Let strategy.validateParams() catch mismatches before API call
**Warning signs:** TypeScript errors about missing required fields; runtime validation failures; API rejects with "unknown parameter" errors

### Pitfall 4: Cost Estimation Diverges from Execution
**What goes wrong:** Cost estimate uses nano-banana-pro pricing, but execution uses Seedream; final cost is 4x lower than estimate
**Why it happens:** Model selection happens after cost estimation, or model field isn't persisted correctly
**How to avoid:**
1. Model selection must happen during job parsing (Phase 2) or folder configuration
2. calculateCostEstimate() already uses strategy-based pricing; ensure it receives correct model
3. Verify generations.model matches jobs.model or folder-level model override
**Warning signs:** Estimated cost doesn't update when model is changed; final cost significantly different from estimate

### Pitfall 5: Polling Logic Ignores Model-Specific Response Formats
**What goes wrong:** Queue polls kie.ai task, but different models return results in different JSON structures; URL extraction fails
**Why it happens:** Assuming all models use same response format as nano-banana-pro
**How to avoid:**
1. Delegate polling to strategy.pollTask() which knows its own response format
2. Strategies handle their own URL extraction (already implemented in Phase 7)
3. Queue only cares about returned { resultUrl: string }, not response structure
**Warning signs:** "Could not extract result URL" errors; different error rates between Nano and Seedream

### Pitfall 6: Retry Logic Doesn't Account for Model-Specific Rate Limits
**What goes wrong:** Nano Banana has 100 req/min limit, Seedream has 50 req/min; queue retries Seedream too aggressively, wastes retry attempts
**Why it happens:** Centralized retry logic doesn't know about model-specific rate limits
**How to avoid:**
1. Both models currently use kie.ai API with same rate limiting (429 responses)
2. p-retry with exponential backoff + jitter already handles rate limits well
3. Future: If models have different rate limits, strategies could provide retry configuration
**Warning signs:** Excessive 429 errors for one model but not the other; retry exhaustion patterns differ by model

## Code Examples

Verified patterns from official sources:

### Queue Processing with Strategy Pattern
```typescript
// Source: Existing generation-queue.ts + strategy pattern integration
// Modified executeGeneration() to use strategies

private async executeGeneration(job: GenerationJob): Promise<GenerationResult> {
  try {
    // Step 1: Update state to 'processing'
    await this.supabase
      .from('generations')
      .update({
        state: 'processing',
        started_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    // Step 2: Prepare prompt (with optional Claude analysis)
    let finalPrompt = job.operation;
    if (job.photoMode === 'analysis' && job.referenceImageUrls.length > 0) {
      finalPrompt = await analyzeImageWithClaude(
        job.referenceImageUrls[0],
        job.operation
      );
    }

    // Step 3: Get strategy for this generation's model
    const strategy = getModelStrategy(job.model);

    // Step 4: Build model-specific parameters
    const params = buildModelParams(job, strategy, finalPrompt);

    // Step 5: Validate before API call
    strategy.validateParams(params);

    console.log(`[Queue] Using ${strategy.capabilities.displayName} for generation ${job.id}`);

    // Step 6: Create task via strategy
    const taskId = await strategy.createTask(params);
    console.log(`[Queue] Task created: ${taskId}`);

    // Step 7: Update database with task_id
    await this.supabase
      .from('generations')
      .update({ task_id: taskId })
      .eq('id', job.id);

    // Step 8: Poll for completion via strategy
    const { resultUrl } = await strategy.pollTask(taskId);

    // Step 9: Update state to 'completed'
    await this.supabase
      .from('generations')
      .update({
        state: 'completed',
        result_url: resultUrl,
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    console.log(`[Queue] Generation ${job.id} completed: ${resultUrl}`);

    return {
      id: job.id,
      state: GenerationState.COMPLETED,
      resultUrl,
    };
  } catch (error) {
    // Error handling remains the same
    const errorMessage = error instanceof Error ? error.message : String(error);
    await this.supabase
      .from('generations')
      .update({
        state: 'failed',
        error_message: errorMessage,
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    return {
      id: job.id,
      state: GenerationState.FAILED,
      errorMessage,
    };
  }
}
```

### Building Model-Specific Parameters
```typescript
// Source: TypeScript discriminated unions + strategy pattern
// Helper function to construct correct parameter type

function buildModelParams(
  job: GenerationJob,
  strategy: ModelStrategy,
  finalPrompt: string
): ModelGenerationParams {
  // Slice reference images to model limit (defense-in-depth)
  const referenceImages = job.referenceImageUrls.slice(
    0,
    strategy.capabilities.maxReferenceImages
  );

  // Base parameters common to all models
  const baseParams = {
    prompt: finalPrompt,
    referenceImages,
    aspectRatio: job.aspectRatio,
  };

  // Build model-specific parameters based on strategy ID
  switch (strategy.capabilities.id) {
    case 'nano-banana-pro':
      return {
        ...baseParams,
        resolution: job.resolution || '2K',
        outputFormat: (job.outputFormat?.toLowerCase() as 'png' | 'jpg') || 'png',
      } as NanoBananaParams;

    case 'seedream-4.5-edit':
      return {
        ...baseParams,
        quality: job.quality || 'basic',
        imageSize: job.imageSize || 'square',
      } as SeedreamParams;

    default:
      // TypeScript exhaustive check ensures this never happens
      const exhaustiveCheck: never = strategy.capabilities.id;
      throw new Error(`Unknown model ID: ${exhaustiveCheck}`);
  }
}
```

### Job Expansion with Model Selection
```typescript
// Source: Existing job-manager.ts expandJobToGenerations()
// Modified to include model field

export async function expandJobToGenerations(params: {
  jobId: string;
  parsedJob: ParsedJob;
  filesByFolder: Record<string, string[]>;
  additionalReferenceUrls?: string[];
}): Promise<GenerationJob[]> {
  const { jobId, parsedJob, filesByFolder, additionalReferenceUrls = [] } = params;
  const generationJobs: GenerationJob[] = [];
  const generationRecords: any[] = [];

  for (const folder of parsedJob.job.folders) {
    const folderPath = folder.folderPath;
    const fileUrls = filesByFolder[folderPath] || [];
    const excludedFileNames = folder.excludedFiles || [];
    const validUrls = fileUrls.filter((url) => {
      const fileName = url.split('/').pop() || '';
      return !excludedFileNames.includes(fileName);
    });

    // Get model for this folder (or use default)
    const model: ModelId = (folder as any).model || DEFAULT_MODEL;
    const strategy = getModelStrategy(model);

    // Slice reference images to model limit
    const maxRefs = strategy.capabilities.maxReferenceImages;

    for (const fileUrl of validUrls) {
      const fileName = fileUrl.split('/').pop() || '';
      const generationId = uuidv4();

      // Combine source file URL with additional reference URLs, then slice
      const allReferenceUrls = [fileUrl, ...additionalReferenceUrls].slice(0, maxRefs);

      const generationJob: GenerationJob = {
        id: generationId,
        jobId,
        folderPath,
        operation: folder.operation || parsedJob.job.globalPrompt || '',
        model, // Include model in GenerationJob
        resolution: folder.resolution,
        aspectRatio: folder.aspectRatio,
        photoMode: folder.photoMode,
        outputFormat: parsedJob.job?.outputFormat || 'PNG',
        referenceImageUrls: allReferenceUrls,
        sourceFileName: fileName,
      };

      generationJobs.push(generationJob);

      generationRecords.push({
        id: generationId,
        job_id: jobId,
        folder_path: folderPath,
        operation: generationJob.operation,
        state: 'pending',
        source_file_name: fileName,
        reference_image_urls: allReferenceUrls,
        model, // Persist model to database
        resolution: folder.resolution,
        aspect_ratio: folder.aspectRatio,
        photo_mode: folder.photoMode,
        retry_count: 0,
      });
    }
  }

  // Batch insert all generation records
  if (generationRecords.length > 0) {
    const { error } = await supabase.from('generations').insert(generationRecords);
    if (error) {
      throw new Error(`Failed to insert generation records: ${error.message}`);
    }
  }

  return generationJobs;
}
```

### Error Classification with AbortError
```typescript
// Source: p-retry documentation + existing retry-strategies.ts
// Already implemented in Phase 5, works for strategy-based queue

import { AbortError } from 'p-retry';

// In strategy.createTask() or strategy.pollTask()
if (response.status === 401 || response.status === 402 || response.status === 422) {
  // Non-retryable errors - abort immediately
  const errorText = await response.text();
  throw new AbortError(`Non-retryable error (${response.status}): ${errorText}`);
}

if (response.status === 429 || response.status >= 500) {
  // Retryable errors - throw to trigger retry
  throw new Error(`Retryable error (${response.status}): ${response.statusText}`);
}

// In polling
if (state === 'failed') {
  // Task failed permanently - abort retry
  throw new AbortError(
    `Task ${taskId} failed: ${failMsg || failCode || 'Unknown error'}`
  );
}

if (state === 'waiting' || state === 'processing') {
  // Still processing - throw to trigger retry
  throw new Error(`Task ${taskId} still ${state}`);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded model in queue | Strategy-based model selection | Phase 9 (2026-01) | Supports multiple models, extensible to new models |
| Fixed 8-image limit | Model-specific capabilities | Phase 8-9 (2026-01) | Seedream can use 14 images, Nano uses 8 |
| kie-api-client.ts direct calls | strategy.createTask() / pollTask() | Phase 9 (2026-01) | Queue is model-agnostic, strategies encapsulate API details |
| Hardcoded pricing | strategy.capabilities.costPerGeneration | Phase 8 (2026-01) | Accurate cost estimation per model |
| Single retry strategy | p-retry with AbortError | Phase 5 (2025) | Distinguishes retryable from non-retryable errors |

**Deprecated/outdated:**
- lib/queue/kie-api-client.ts: After Phase 9, createKieAITask() and pollTaskCompletion() are bypassed in favor of strategy methods. File can be removed once queue is fully migrated.
- Hardcoded `model: 'nano-banana-pro'` in generation-queue.ts: Replaced with `model: job.model` and strategy lookup.

## Open Questions

Things that couldn't be fully resolved:

1. **Should strategies provide retry configuration?**
   - What we know: Both Nano Banana and Seedream use kie.ai API with same rate limiting and error codes
   - What's unclear: If future models have different rate limits, should strategies expose retryConfig?: { retries: number; minTimeout: number }
   - Recommendation: Keep centralized retry logic in queue for now since both models use same API. If third model with different API is added, revisit and add optional strategy.getRetryConfig()

2. **Where should reference image slicing happen?**
   - What we know: Slicing can happen in job-manager.ts during expansion OR in queue during execution
   - What's unclear: Defense-in-depth (slice in both places) vs single responsibility (slice once)
   - Recommendation: Slice in both places. Job expansion should slice to prevent storing excess URLs in database; queue should slice as defense-in-depth before validation. Cost is minimal (array slice is O(n)) and prevents edge cases.

3. **Should model be selected per-folder or per-job?**
   - What we know: Database has both jobs.model and generations.model; ParsedJob has folder-level operations
   - What's unclear: UI/UX for letting users select different models per folder vs one model for whole job
   - Recommendation: Support both. Default to job-level model (jobs.model), but allow folder-level override (folder.model). Generation uses generation.model which comes from folder.model || job.model. Phase 9 focuses on queue integration; Phase 10+ can add UI for per-folder selection.

4. **How should Claude analysis mode work with Seedream?**
   - What we know: Analysis mode calls Claude to examine first reference image and enhance prompt
   - What's unclear: Does this work equally well for Seedream's 14-image capability vs Nano's 8-image?
   - Recommendation: Keep existing behavior. Analysis mode uses first reference image regardless of model. Future enhancement could analyze multiple images or provide model-specific analysis prompts, but not required for Phase 9.

## Sources

### Primary (HIGH confidence)
- Existing codebase (lib/queue/generation-queue.ts, lib/models/*, lib/job/*) - direct inspection
- p-queue GitHub repository: https://github.com/sindresorhus/p-queue - official documentation
- p-retry GitHub repository: https://github.com/sindresorhus/p-retry - official documentation

### Secondary (MEDIUM confidence)
- [A Guide to the Strategy Design Pattern in TypeScript and Node.js](https://medium.com/@robinviktorsson/a-guide-to-the-strategy-design-pattern-in-typescript-and-node-js-with-practical-examples-c3d6984a2050)
- [Strategy Pattern in TypeScript | Refactoring Guru](https://refactoring.guru/design-patterns/strategy/typescript/example)
- [Dynamic LLM selection and cost effective AI routing with Azure AI Foundry Model Router](https://techcommunity.microsoft.com/blog/azuredevcommunityblog/adaptive-model-selection-in-typescript-with-the-model-router/4465192)
- [Queue-Based Exponential Backoff: A Resilient Retry Pattern](https://dev.to/andreparis/queue-based-exponential-backoff-a-resilient-retry-pattern-for-distributed-systems-37f3)
- [P-retry Guide 2025](https://generalistprogrammer.com/tutorials/p-retry-npm-package-guide)
- [Mastering Tool Retry Strategies in 2025](https://sparkco.ai/blog/mastering-tool-retry-strategies-in-2025-a-deep-dive)

### Tertiary (LOW confidence)
- [Dynamic Pricing Algorithm: How to Adjust Prices in Real-Time](https://competera.ai/resources/articles/dynamic-pricing-algorithm) - general pricing patterns, not TypeScript-specific
- [TypeScript Array slice() Method](https://www.geeksforgeeks.org/typescript/typescript-array-slice-method/) - basic array operations

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - p-queue and p-retry are already in use and well-documented
- Architecture: HIGH - Strategy pattern already implemented in Phase 7-8; queue integration is straightforward application
- Pitfalls: HIGH - Based on direct codebase inspection and common strategy pattern mistakes

**Research date:** 2026-01-26
**Valid until:** 2026-02-26 (30 days - stable libraries, established patterns)
