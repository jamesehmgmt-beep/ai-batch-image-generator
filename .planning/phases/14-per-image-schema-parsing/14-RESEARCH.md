# Phase 14: Per-Image Schema & Parsing - Research

**Researched:** 2026-01-29
**Domain:** AI parsing for per-image operations, Zod schema design, structured outputs
**Confidence:** HIGH

## Summary

Phase 14 adds per-image model selection capability to the AI parser, allowing users to say "use Seedream for X.jpg, Nano Banana for Y.jpg" and have the AI correctly assign different models to different images within the same folder. This requires extending the existing Zod schema to support image-level operations, updating the AI system prompt with per-image examples, and ensuring generation count accuracy.

The current architecture already uses Zod discriminated unions for model-specific folder validation (NanoBananaFolderSchema vs SeedreamFolderSchema). This same pattern extends naturally to per-image operations by adding an optional `imageOperations` array field to folders, where each item specifies a filename and its model/settings.

The critical insight is that generation count mismatches (reported bug: 12 expected vs 28 actual) occur because the job expansion logic doesn't properly reconcile explicit generation counts with per-image exclusions and inclusions. The fix requires explicit tracking of which images are processed vs skipped.

**Primary recommendation:** Extend FolderOperation schema with optional `imageOperations: Array<{ fileName, model, ...settings }>` using discriminated unions, update AI prompt with per-image examples, and fix generation count logic to accurately count included images.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Zod | 3.x | Schema validation with discriminated unions | Already used for model-specific validation, TypeScript-first with excellent inference |
| Anthropic SDK | Latest | Claude API with structured outputs | Native support for JSON schema validation, structured outputs GA since Nov 2025 |
| zod-to-json-schema | Latest | Convert Zod schemas to JSON Schema | Bridge between Zod (TypeScript) and Claude's JSON Schema requirement |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| TypeScript | 5.x | Type safety for discriminated unions | Already in use, ensures compile-time validation of schema logic |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Zod discriminated unions | Regular unions | Discriminated unions provide O(1) lookup vs sequential validation, better error messages |
| Anthropic structured outputs | Manual JSON parsing | Structured outputs guarantee valid JSON 100% of time, no retry logic needed |

**Installation:**
```bash
# Already installed in project
npm install zod zod-to-json-schema @anthropic-ai/sdk
```

## Architecture Patterns

### Recommended Schema Structure

Current architecture uses folder-level discriminated unions. Extend to support image-level overrides:

```
FolderOperation {
  folderPath: string
  operation: string (folder-level default)
  model: 'nano-banana-pro' | 'seedream-4.5-edit'
  excludedFiles?: string[]
  imageOperations?: Array<ImageOperation>  // NEW: per-image overrides
}

ImageOperation (discriminated union on 'model') {
  fileName: string
  model: ModelId
  operation?: string  // optional override of folder operation
  // Model-specific fields (same as folder-level)
}
```

### Pattern 1: Discriminated Union Extension
**What:** Add per-image operations as optional array field, each item uses same discriminated union pattern as folders
**When to use:** When users specify different models or settings for specific files within a folder
**Example:**
```typescript
// Current folder-level schema
const BaseFolderOperationSchema = z.object({
  folderPath: z.string(),
  operation: z.string(),
  excludedFiles: z.array(z.string()).optional(),
  // ... other fields
});

// NEW: Per-image operation schema (mirrors folder structure)
const BaseImageOperationSchema = z.object({
  fileName: z.string().describe('Specific file like "X.jpg" or "product-1.png"'),
  operation: z.string().optional().describe('Override folder operation for this file'),
});

const NanoBananaImageSchema = BaseImageOperationSchema.extend({
  model: z.literal('nano-banana-pro'),
  resolution: ResolutionSchema.default('2K'),
  quality: z.undefined().optional(),
  imageSize: z.undefined().optional(),
});

const SeedreamImageSchema = BaseImageOperationSchema.extend({
  model: z.literal('seedream-4.5-edit'),
  quality: SeedreamQualitySchema.default('basic'),
  imageSize: SeedreamImageSizeSchema.default('landscape_16_9'),
  resolution: z.undefined().optional(),
});

const ImageOperationSchema = z.discriminatedUnion('model', [
  NanoBananaImageSchema,
  SeedreamImageSchema,
]);

// Add to folder schema
const ExtendedFolderSchema = BaseFolderOperationSchema.extend({
  imageOperations: z.array(ImageOperationSchema).optional()
    .describe('Per-image overrides: different models or settings for specific files'),
});
```

### Pattern 2: Generation Count Reconciliation
**What:** Accurately count generations by reconciling explicit counts, exclusions, and per-image inclusions
**When to use:** During job creation and expansion to ensure preview matches execution
**Example:**
```typescript
// Source: Current codebase pattern, extended for per-image operations
function calculateGenerationCount(
  folder: FolderOperation,
  totalFiles: number
): number {
  // Case 1: Explicit generation count (user said "make 5 images")
  if (folder.generationCount && folder.generationCount > 0) {
    return folder.generationCount;
  }

  // Case 2: Per-image operations specified
  if (folder.imageOperations && folder.imageOperations.length > 0) {
    // Only count files explicitly listed in imageOperations
    return folder.imageOperations.length;
  }

  // Case 3: Default 1-per-file behavior with exclusions
  const excludedCount = folder.excludedFiles?.length || 0;
  return Math.max(0, totalFiles - excludedCount);
}
```

### Pattern 3: AI Prompt Enhancement for Per-Image Parsing
**What:** Extend system prompt with examples of per-image instructions and expected schema output
**When to use:** In buildJobParserSystemPrompt when constructing AI parser instructions
**Example:**
```typescript
// Add to job-parser.ts system prompt
const perImageGuidance = `
## Per-Image Operations (NEW)

Users can assign different models or settings to specific images within a folder.

**Syntax patterns:**
- "use Seedream for X.jpg, Nano Banana for Y.jpg"
- "process A.jpg with Seedream high quality, B.jpg with Nano Banana 4K"
- "for folder 5: use Seedream on product-1.jpg and product-2.jpg, skip the rest"

**Parse as imageOperations array:**
User: "for folder 5, use Seedream for dress.jpg and Nano Banana 4K for model.jpg"
Parse:
{
  understood: true,
  job: {
    folders: [{
      folderPath: "5",
      operation: "Process images",  // folder-level default
      model: "nano-banana-pro",     // folder-level default
      imageOperations: [
        {
          fileName: "dress.jpg",
          model: "seedream-4.5-edit",
          quality: "basic",
          imageSize: "landscape_16_9"
        },
        {
          fileName: "model.jpg",
          model: "nano-banana-pro",
          resolution: "4K"
        }
      ]
    }]
  }
}

**Generation Count Rules with Per-Image:**
- If imageOperations specified: count = imageOperations.length
- If excludedFiles specified: count = totalFiles - excludedFiles.length
- If generationCount specified: use that exact number
- Default: 1 per file in folder
`;
```

### Anti-Patterns to Avoid

- **Mixing imageOperations with excludedFiles**: If user specifies imageOperations (explicit inclusion), excludedFiles becomes ambiguous. Choose one or the other.
- **Per-image operations without fileName validation**: Always validate that specified fileNames exist in the uploaded folder structure.
- **Ignoring discriminated union requirements**: Every image operation MUST have a model field and model-specific fields (resolution for Nano, quality/imageSize for Seedream).
- **Over/under-counting generations**: Job expansion must use the same counting logic as cost estimation to avoid preview mismatches.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Schema validation for discriminated types | Manual type checking with if/else | Zod discriminatedUnion | O(1) lookup, automatic TypeScript inference, better error messages |
| JSON schema conversion | Manual schema writing | zod-to-json-schema | Automatic conversion, maintains type safety, handles complex schemas |
| AI structured output validation | Prompt engineering + manual parsing | Anthropic structured outputs API | Guaranteed valid JSON, no retry logic, 100% schema compliance |
| Array filtering for exclusions | Manual loops with conditionals | TypeScript Array.filter() with includes | Cleaner code, functional approach, type-safe |

**Key insight:** The Anthropic structured outputs feature (GA Nov 2025) uses constrained decoding to guarantee schema-compliant responses. This eliminates the entire class of "retry on invalid JSON" bugs. Use it instead of manual validation.

## Common Pitfalls

### Pitfall 1: Generation Count Mismatch (PARS-04)
**What goes wrong:** Cost estimation shows 12 generations, preview shows 28. User creates job expecting 12, gets charged for 28.
**Why it happens:** Two different counting algorithms:
  - Cost estimation: counts based on parsed schema
  - Job expansion: counts based on actual file expansion logic
  - Exclusions, per-image ops, and explicit counts not reconciled consistently
**How to avoid:**
  - Extract counting logic into pure function `calculateGenerationCount(folder, fileCount)`
  - Use SAME function in both cost estimation and job expansion
  - Write unit tests with exclusion edge cases
**Warning signs:**
  - Preview count != cost estimate count
  - User reports "more/fewer images than expected"

### Pitfall 2: Missing Model Field in Discriminated Union
**What goes wrong:** Zod validation fails with cryptic "discriminator not found" error
**Why it happens:** AI response doesn't include `model` field on every folder/image operation, breaking discriminated union
**How to avoid:**
  - Current code (app/api/ai/parse/route.ts:248) adds model field if missing - keep this normalization
  - Update AI prompt to emphasize: "EVERY folder and imageOperation MUST include model field"
  - Add validation in normalization step to log warnings if model is missing
**Warning signs:**
  - 500 error from /api/ai/parse
  - Zod error mentioning "discriminator" or "invalid_union_discriminator"

### Pitfall 3: File Name Matching Ambiguity
**What goes wrong:** User says "use Seedream for product.jpg" but folder has "Product.jpg" (capital P). AI parsing works, but job expansion can't find file.
**Why it happens:** Case-sensitive file matching on case-insensitive filesystems (Windows) leads to mismatches
**How to avoid:**
  - Normalize all file names to lowercase during upload metadata collection
  - Or: Use case-insensitive matching in job expansion (`fileName.toLowerCase() === uploadedFile.toLowerCase()`)
  - Document in AI prompt: "File names are case-sensitive, match exactly as uploaded"
**Warning signs:**
  - imageOperations specified but generations skipped
  - Preview shows 0 generations when user expected some

### Pitfall 4: excludedFiles + imageOperations Conflict
**What goes wrong:** User specifies both `excludedFiles: ["A.jpg"]` and `imageOperations: [{ fileName: "A.jpg", ... }]`. Should A.jpg be processed or excluded?
**Why it happens:** Schema allows both fields simultaneously, creating logical contradiction
**How to avoid:**
  - Document in schema description: "Do NOT use both excludedFiles and imageOperations - they are mutually exclusive"
  - Add validation in normalization: if imageOperations exists, clear excludedFiles and log warning
  - Update AI prompt: "If user specifies per-image operations, ignore any exclusion instructions"
**Warning signs:**
  - AI confidence drops when user specifies both
  - User confused why excluded file was processed

### Pitfall 5: AI Prompt Token Inflation
**What goes wrong:** Adding per-image examples to system prompt increases token count, raising costs and potentially hitting context limits
**Why it happens:** Structured outputs inject additional system prompt explaining schema (per Anthropic docs)
**How to avoid:**
  - Keep per-image examples concise (1-2 examples, not 10)
  - Use prompt caching for system prompt (Anthropic feature - cache lasts 5 min)
  - Monitor input token counts in API responses
**Warning signs:**
  - Input token count jumps significantly after adding per-image support
  - Prompts failing with "context length exceeded" errors

## Code Examples

Verified patterns from official sources:

### Discriminated Union with Arrays (Zod Official Docs)
```typescript
// Source: https://zod.dev/api
const ImageOperationSchema = z.discriminatedUnion('model', [
  z.object({
    fileName: z.string(),
    model: z.literal('nano-banana-pro'),
    resolution: z.enum(['1K', '2K', '4K'])
  }),
  z.object({
    fileName: z.string(),
    model: z.literal('seedream-4.5-edit'),
    quality: z.enum(['basic', 'high']),
    imageSize: z.string()
  }),
]);

const FolderWithImageOps = z.object({
  folderPath: z.string(),
  imageOperations: z.array(ImageOperationSchema).optional()
});

// Type inference works automatically
type ImageOp = z.infer<typeof ImageOperationSchema>;
```

### Structured Outputs with Complex Schema (Anthropic Docs)
```typescript
// Source: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

const response = await client.messages.create({
  model: "claude-sonnet-4-5",
  max_tokens: 4096,
  messages: [{ role: "user", content: promptText }],
  output_config: {
    format: zodOutputFormat(ParsedJobSchema)
  },
});

// Guaranteed valid JSON matching schema
const parsed = response.content[0].text;
```

### Generation Count with Exclusions (Current Codebase)
```typescript
// Source: lib/job/job-manager.ts:40-56 (current implementation)
// Calculate total generations
let totalGenerations = 0;
for (const folder of parsedJob.job.folders) {
  const generationCount = (folder as any).generationCount as number | undefined;

  if (generationCount && generationCount > 0) {
    // User specified exact count
    totalGenerations += generationCount;
  } else {
    // Default: 1 per input image (minus exclusions)
    const folderCount = fileCountByFolder[folder.folderPath] || 0;
    const excludedCount = folder.excludedFiles?.length || 0;
    totalGenerations += Math.max(0, folderCount - excludedCount);
  }
}
```

### Array Filtering for Excluded Files (TypeScript/MDN)
```typescript
// Source: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter
const fileUrls = filesByFolder[folderPath] || [];
const excludedFileNames = folder.excludedFiles || [];

// Filter out excluded files
const validUrls = fileUrls.filter((url) => {
  const fileName = url.split('/').pop() || '';
  return !excludedFileNames.includes(fileName);
});

// For per-image operations: filter to ONLY included files
const includedUrls = fileUrls.filter((url) => {
  const fileName = url.split('/').pop() || '';
  return folder.imageOperations?.some(op => op.fileName === fileName);
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual JSON parsing with try/catch | Anthropic structured outputs API | Nov 2025 (GA) | 100% valid JSON, no retry logic needed |
| Regular Zod unions (sequential validation) | Discriminated unions (O(1) lookup) | Already in use | Faster validation, better error messages |
| Folder-level model selection only | Per-image model selection | Phase 14 (this phase) | Users can mix models within folder |
| Unclear generation count logic | Explicit counting function | Phase 14 (this phase) | Preview matches execution |

**Deprecated/outdated:**
- Beta header `structured-outputs-2025-11-13`: No longer required as of GA release (still works for transition period)
- `output_format` parameter: Moved to `output_config.format` in GA API

## Open Questions

Things that couldn't be fully resolved:

1. **Should per-image operations support per-image prompts?**
   - What we know: Requirements explicitly exclude this (REQUIREMENTS.md: "Per-image prompts (different operation per image) - Too granular")
   - What's unclear: Users might naturally expect "use Seedream for X.jpg with prompt 'foo'" syntax
   - Recommendation: Start with per-image MODEL only (as scoped), add prompt override in future if users request it. Document limitation clearly in UI.

2. **How to handle file name typos in per-image instructions?**
   - What we know: AI parsing will accept any fileName string, validation happens during job expansion
   - What's unclear: Should AI validate fileNames against uploaded structure, or should job expansion handle gracefully?
   - Recommendation: Add validation in normalization step (app/api/ai/parse/route.ts) to check fileName against folders array, add clarifying question if mismatch.

3. **Performance impact of discriminated union arrays at scale?**
   - What we know: Discriminated unions are O(1) per item, arrays iterate O(n)
   - What's unclear: At what folder size (100 files? 1000?) does validation become slow?
   - Recommendation: Assume reasonable limits (< 100 images per folder) for v2.1, add performance testing if users report issues.

4. **Should excludedFiles and imageOperations be mutually exclusive in schema?**
   - What we know: Logically they conflict (exclude all except these vs include only these)
   - What's unclear: Should schema enforce mutual exclusivity with Zod .refine(), or handle in business logic?
   - Recommendation: Handle in normalization (clear excludedFiles if imageOperations exists), add warning log. Avoid complex Zod refinements that make JSON schema conversion harder.

## Sources

### Primary (HIGH confidence)
- [Anthropic Structured Outputs API Docs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) - Official documentation for JSON outputs and strict tool use
- [Zod API Documentation](https://zod.dev/api) - Discriminated unions, array schemas, type inference
- Current codebase - lib/ai/schemas/job.ts, lib/job/job-manager.ts, app/api/ai/parse/route.ts

### Secondary (MEDIUM confidence)
- [Structured outputs in LLMs (LeewayHertz)](https://www.leewayhertz.com/structured-outputs-in-llms/) - General patterns for structured entity extraction
- [TypeScript Array filter() (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter) - Array filtering patterns for exclusions

### Tertiary (LOW confidence)
- WebSearch results on per-file AI parsing patterns - No specific authoritative sources found for this exact use case
- General prompt engineering patterns - Synthesized from multiple sources, not specific to per-image operations

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Zod and Anthropic SDK already in use, patterns proven
- Architecture: HIGH - Discriminated union pattern already working for folders, direct extension to images
- Pitfalls: HIGH - Generation count mismatch is real user-reported bug, other pitfalls derived from code analysis
- Code examples: HIGH - All examples from official docs or current codebase
- AI prompt patterns: MEDIUM - Per-image parsing is novel, no established patterns found in research

**Research date:** 2026-01-29
**Valid until:** 2026-02-28 (30 days - stable domain, Zod/Claude API unlikely to change significantly)

**Key technical decisions validated:**
1. Extend discriminated union pattern to per-image operations: VALIDATED (same pattern as folder-level, proven to work)
2. Use Anthropic structured outputs for guaranteed valid JSON: VALIDATED (GA feature, officially recommended)
3. Extract generation count logic into pure function: VALIDATED (eliminates mismatch bug)
4. Add per-image examples to AI system prompt: VALIDATED (standard prompt engineering practice)
