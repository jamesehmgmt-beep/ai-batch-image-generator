# Phase 13: Bug Fixes - Research

**Researched:** 2026-01-29
**Domain:** Next.js API Routes, Supabase Queries, Client-Server Data Flow
**Confidence:** HIGH

## Summary

The "failed to fetch generations" error on the preview page has been traced through the full flow from cost estimation to preview. The bug occurs when the preview page calls `/api/job/${jobId}/generations` and the API returns a non-OK response.

**Root cause analysis** reveals several potential failure points in the chain:
1. The API route at `/api/job/[jobId]/generations/route.ts` returns 500 when Supabase query fails
2. Generation records may fail to be created in `/api/job/create/route.ts` (line 216-223) but errors are only logged, not propagated
3. Schema validation in job creation (line 62) may reject folders with invalid structure

The bug is most likely caused by **generation record creation failing silently** - the job is created but with 0 generations, causing the preview page to show an empty state that looks like an error.

**Primary recommendation:** Add proper error propagation and debugging to the job creation flow, ensuring generation insert failures surface to the user.

## Standard Stack

This phase uses existing stack - no new libraries needed.

### Core (Already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js 15 | 15.x | App Router, API Routes | Framework in use |
| Supabase | @supabase/supabase-js | Database queries | Already configured |
| Zod | 3.x | Schema validation | Type safety |

## Architecture Patterns

### Current Data Flow
```
[Cost Page]
    → handlePreviewGenerations()
    → POST /api/job/create
        → createJob() - creates job record
        → INSERT generations - creates generation records
        → Returns { job: { id, ... } }
    → router.push(`/job/preview/${job.id}`)

[Preview Page]
    → useEffect on mount
    → GET /api/job/${jobId}
    → GET /api/job/${jobId}/generations
        → Supabase query with deleted_at IS NULL filter
        → Returns { generations: [...] }
    → setGenerations(data.generations)
```

### Error Propagation Pattern (Current - Problematic)
```typescript
// app/api/job/create/route.ts lines 216-223
if (genError) {
  console.error('[Job Create] Error creating generations:', genError);
  // Don't fail the job creation, just log the error  <-- SILENT FAILURE
}
```

### Error Propagation Pattern (Recommended)
```typescript
if (genError) {
  console.error('[Job Create] Error creating generations:', genError);
  return NextResponse.json({
    success: false,
    error: `Failed to create generations: ${genError.message}`,
    job: { id: job.id }  // Still return job for debugging
  }, { status: 500 });
}
```

## Bug Analysis

### Primary Bug: Silent Generation Insert Failure

**Location:** `app/api/job/create/route.ts` lines 212-234

**What happens:**
1. Job record is created successfully (line 105-109)
2. Generation records are prepared (lines 113-206)
3. Insert is attempted (lines 216-218)
4. If insert fails, error is ONLY logged (lines 220-223)
5. Response returns success with job ID
6. Preview page tries to fetch generations
7. Supabase returns empty array (no generations exist)
8. Preview page shows "0 generations" or error state

**Evidence:**
- Line 220-223 shows explicit comment: "Don't fail the job creation, just log the error"
- This is a design decision, not an oversight, but causes confusing UX

### Secondary Bug: Schema Validation Rejection

**Location:** `app/api/job/create/route.ts` line 62

**What happens:**
1. User modifies prompt mode via PromptModeSelector
2. PromptModeSelector creates folder objects (lines 41-62)
3. Folder objects may not match discriminated union schema exactly
4. Zod validation rejects with "Invalid parsedJob schema"
5. API returns 400, cost page shows error

**Schema requirement:**
```typescript
// FolderOperationSchema is discriminated union on 'model' field
// Each folder MUST have model: 'nano-banana-pro' OR 'seedream-4.5-edit'
```

**Potential issue in PromptModeSelector:**
```typescript
// components/job/prompt-mode-selector.tsx lines 51-60
return {
  folderPath,
  operation: globalPromptValue,
  model: jobModel,  // Must match discriminator exactly
  // ... other fields
};
```

### Tertiary Bug: Missing Error Details in Preview

**Location:** `app/(protected)/job/preview/[jobId]/page.tsx` lines 53-56

**Current behavior:**
```typescript
const res = await fetch(`/api/job/${jobId}/generations`);
if (!res.ok) {
  throw new Error('Failed to fetch generations');  // Generic message
}
```

**Problem:** The actual error from the API is discarded, making debugging difficult.

## Reproduction Steps

Based on code analysis, the bug likely reproduces as follows:

1. Upload images to a folder structure
2. Enter a prompt and get job parsed
3. Navigate to Cost Estimation page
4. Change to "Per-Folder Prompts" tab in PromptModeSelector
5. Click "Preview Generations"
6. Observe "failed to fetch generations" error

**Hypothesis:** The per-folder mode creates folder entries that may:
- Have empty operations (no prompt text)
- Not match the discriminated union schema
- Cause generation records to not be created

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Error tracking | Custom logging | Console + error response | Already works, just needs propagation |
| Schema validation | Manual checks | Zod safeParse | Already in place, provides details |

## Common Pitfalls

### Pitfall 1: Swallowing Errors Silently
**What goes wrong:** Errors are logged but not returned to client
**Why it happens:** "Graceful degradation" mindset - try to succeed anyway
**How to avoid:** Always propagate errors that affect user-visible state
**Warning signs:** Console shows errors but UI shows success/empty state

### Pitfall 2: Generic Error Messages
**What goes wrong:** "Failed to fetch generations" doesn't help debugging
**Why it happens:** Security concern about exposing internals
**How to avoid:** Include error details in development, sanitize in production
**Warning signs:** User reports error but logs don't correlate

### Pitfall 3: Discriminated Union Schema Strictness
**What goes wrong:** Runtime type doesn't match schema discriminator
**Why it happens:** TypeScript doesn't enforce discriminated unions at runtime
**How to avoid:** Use safeParse and handle validation errors explicitly
**Warning signs:** Zod errors mention "Invalid discriminator value"

## Code Examples

### Fix 1: Propagate Generation Insert Errors
```typescript
// app/api/job/create/route.ts - Replace lines 212-234
if (actualGenerationCount > 0) {
  const { createServerSupabaseClient } = await import('@/lib/supabase-server');
  const supabase = createServerSupabaseClient();

  const { error: genError } = await supabase
    .from('generations')
    .insert(generationRecords);

  if (genError) {
    console.error('[Job Create] Error creating generations:', genError);
    // Return error to client instead of swallowing
    return NextResponse.json(
      {
        success: false,
        error: `Failed to create generation records: ${genError.message}`,
        jobId: job.id,
        details: { generationCount: actualGenerationCount }
      },
      { status: 500 }
    );
  }
}
```

### Fix 2: Include Error Details in Preview Page
```typescript
// app/(protected)/job/preview/[jobId]/page.tsx - Replace lines 53-56
const res = await fetch(`/api/job/${jobId}/generations`);
if (!res.ok) {
  const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
  throw new Error(errorData.error || `Failed to fetch generations (${res.status})`);
}
```

### Fix 3: Handle Empty Generations Gracefully
```typescript
// app/(protected)/job/preview/[jobId]/page.tsx - After line 59
const data = await res.json();
console.log('[Preview] Fetched generations:', data.generations?.length, data);

if (!data.generations || data.generations.length === 0) {
  // Check if this is expected (job just created) vs error condition
  const jobRes = await fetch(`/api/job/${jobId}`);
  const jobData = await jobRes.json();

  if (jobData.job?.totalGenerations === 0) {
    setError('No generations were created. Check your folder and prompt configuration.');
  } else {
    setError(`Expected ${jobData.job?.totalGenerations} generations but found 0. This may indicate a creation error.`);
  }
  return;
}
```

### Fix 4: Validate Folder Schema Before Submission
```typescript
// app/(protected)/job/cost/page.tsx - In handlePreviewGenerations, before API call
// Validate each folder matches schema
import { FolderOperationSchema } from '@/lib/ai/schemas/job';

for (const folder of parsedJob.job.folders) {
  const validation = FolderOperationSchema.safeParse(folder);
  if (!validation.success) {
    setError(`Invalid folder configuration for "${folder.folderPath}": ${validation.error.issues[0]?.message}`);
    return;
  }
}
```

## Investigation Checklist

To confirm the bug, check these in sequence:

1. **Check browser console** during reproduction
   - Look for red network errors to `/api/job/create` or `/api/job/[id]/generations`
   - Note the HTTP status code (400 vs 500)

2. **Check server logs** for `[Job Create]` messages
   - "Zod validation failed" = schema issue
   - "Error creating generations" = Supabase insert issue
   - "filesByFolder is empty" = data passing issue

3. **Check Supabase** directly
   - Query `jobs` table for recent job ID
   - Query `generations` table for that job_id
   - If job exists but no generations = silent insert failure

4. **Check parsed job structure**
   - Add `console.log('[Cost Page] parsedJob:', JSON.stringify(parsedJob, null, 2))` before API call
   - Verify each folder has valid `model` discriminator

## Open Questions

1. **Is the discriminated union causing validation failures?**
   - What we know: Schema requires exact model match
   - What's unclear: Whether PromptModeSelector always sets model correctly
   - Recommendation: Add logging before Zod validation to see input

2. **Is Supabase RLS blocking inserts?**
   - What we know: Server uses service key (bypasses RLS)
   - What's unclear: Any other permission issues
   - Recommendation: Check Supabase logs for permission errors

3. **Does the bug occur with Global Prompt only?**
   - What we know: User reports it happens when picking global OR folder prompt
   - What's unclear: Is this both modes or user confusion?
   - Recommendation: Test both modes explicitly

## Sources

### Primary (HIGH confidence)
- `app/api/job/create/route.ts` - Direct code analysis
- `app/api/job/[jobId]/generations/route.ts` - Direct code analysis
- `app/(protected)/job/preview/[jobId]/page.tsx` - Direct code analysis
- `lib/ai/schemas/job.ts` - Schema definition

### Secondary (MEDIUM confidence)
- `components/job/prompt-mode-selector.tsx` - Folder creation logic
- `lib/job/job-manager.ts` - Generation expansion logic

## Metadata

**Confidence breakdown:**
- Bug location: HIGH - Code analysis clearly shows error handling gaps
- Root cause: MEDIUM - Multiple potential causes, need testing to confirm
- Fix approach: HIGH - Standard error propagation patterns

**Research date:** 2026-01-29
**Valid until:** Until bug is fixed (this is investigation, not library research)
