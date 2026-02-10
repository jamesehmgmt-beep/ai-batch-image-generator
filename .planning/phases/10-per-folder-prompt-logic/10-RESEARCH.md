# Phase 10: Per-Folder Prompt Logic - Research

**Researched:** 2026-01-27
**Domain:** Multi-mode prompt configuration, AI parser adaptation, prompt combination strategies
**Confidence:** HIGH

## Summary

Per-folder prompt logic enables users to choose between two mutually exclusive modes: Global prompt mode (one prompt applied to all folders) or Per-Folder mode (separate prompt input per folder). This phase extends the existing v1.0 prompt parsing system with mode awareness while maintaining backward compatibility with global-only prompts.

The research identifies three critical implementation domains: (1) prompt mode selection and state management in the UI, (2) AI parser adaptation to understand per-folder configurations with different models/settings per folder, and (3) prompt combination logic with clear precedence rules when both global and folder prompts exist.

The current codebase already has foundation pieces in place: discriminated union schemas for model-specific validation (Phase 8), folder operation structures in ParsedJobSchema, and cost estimation that aggregates per-folder configurations. The prior research notes (.planning/research/ARCHITECTURE.md) documented a prompt combination strategy using prefix/suffix/only modes, which provides a proven pattern for handling global + folder prompt interactions.

**Primary recommendation:** Implement prompt mode as a top-level job configuration field ('global' | 'per-folder') that gates UI rendering and parser behavior, use explicit prompt combination modes (prefix/suffix/only) when both global and folder prompts exist, and extend the AI parser system prompt to understand per-folder mode syntax with model-specific parameter requests.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Zod | 3.x | Schema validation with discriminated unions | Already used for model-specific validation, enables compile-time type safety |
| React Hook Form | 7.x | Dynamic form state management | Already in use, handles conditional field rendering efficiently |
| TypeScript | 5.x | Type-safe prompt mode and combination logic | Project standard, prevents runtime errors in prompt composition |
| Anthropic Claude API | Current | AI prompt parsing with structured outputs | Already used for job parsing, supports tool-based structured responses |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zustand | 4.x | Lightweight state management | If per-folder form state becomes complex (optional, evaluate during implementation) |
| zod-to-json-schema | 3.x | Convert Zod schemas to JSON Schema for Claude | Already used in app/api/ai/parse/route.ts |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Explicit mode field | Infer from prompt presence | Explicit mode is clearer for users and parser, prevents ambiguity |
| Prefix/suffix/only modes | Single 'combine' boolean | Three modes provide finer control, matches prior research recommendations |
| Per-folder model in schema | Job-level model only | Per-folder model enables mixed-model jobs (Req PRMT-04) |

**Installation:**
No new dependencies required. All necessary libraries already installed in v1.0.

## Architecture Patterns

### Recommended Schema Structure
```typescript
// lib/ai/schemas/job.ts

// Prompt mode determines whether user provides one global prompt or per-folder prompts
export const PromptModeSchema = z.enum(['global', 'per-folder']);

// When both global and folder prompts exist, combination mode determines precedence
export const PromptCombinationModeSchema = z.enum(['prefix', 'suffix', 'only'])
  .default('prefix')
  .describe('prefix = global before folder, suffix = global after folder, only = ignore folder');

// Updated ParsedJobSchema
export const ParsedJobSchema = z.object({
  understood: z.boolean(),
  confidence: z.number().min(0).max(1),
  job: z.object({
    promptMode: PromptModeSchema.describe('Whether using global or per-folder prompts'),
    folders: z.array(FolderOperationSchema),
    globalPrompt: z.string().optional().describe('Prompt applied to all folders (when promptMode=global)'),
    globalPromptMode: PromptCombinationModeSchema.optional()
      .describe('How to combine global with folder prompts when both exist'),
    model: ModelSchema,
    outputFormat: z.enum(['PNG', 'JPG']).optional(),
  }).optional(),
});

// FolderOperationSchema already supports per-folder operation (from v1.0)
// Each folder can have different model, resolution, quality, aspectRatio
```

### Pattern 1: Prompt Mode Selection (UI State Management)
**What:** Top-level toggle between Global and Per-Folder modes that controls form rendering
**When to use:** At job creation start, before user enters any prompts
**Example:**
```typescript
// Source: Existing codebase pattern + React form best practices
// In job creation component

const [promptMode, setPromptMode] = useState<'global' | 'per-folder'>('global');
const { folders } = useJobContext(); // From v1.0 upload phase

return (
  <div>
    {/* Mode selector */}
    <div className="flex gap-4 mb-6">
      <button
        onClick={() => setPromptMode('global')}
        className={promptMode === 'global' ? 'active' : ''}
      >
        Global Prompt
      </button>
      <button
        onClick={() => setPromptMode('per-folder')}
        className={promptMode === 'per-folder' ? 'active' : ''}
      >
        Per-Folder Prompts
      </button>
    </div>

    {/* Conditional rendering based on mode */}
    {promptMode === 'global' ? (
      <Textarea
        placeholder="Enter prompt for all folders..."
        value={globalPrompt}
        onChange={(e) => setGlobalPrompt(e.target.value)}
      />
    ) : (
      <div className="space-y-4">
        {folders.map(folder => (
          <div key={folder}>
            <label>{folder} ({fileCountByFolder[folder]} images)</label>
            <Textarea
              placeholder={`Prompt for ${folder}...`}
              value={folderPrompts[folder] || ''}
              onChange={(e) => setFolderPrompts(prev => ({
                ...prev,
                [folder]: e.target.value
              }))}
            />
          </div>
        ))}
      </div>
    )}
  </div>
);
```

### Pattern 2: AI Parser Adaptation for Per-Folder Mode
**What:** Extend system prompt to understand per-folder syntax and generate folder-specific operations
**When to use:** When promptMode='per-folder' and user enters per-folder prompts
**Example:**
```typescript
// Source: Existing lib/ai/prompts/job-parser.ts + OpenAI prompt engineering best practices

export function buildJobParserSystemPrompt(
  fileStructure: FileStructureInfo,
  promptMode: 'global' | 'per-folder'
): string {
  const folderList = fileStructure.folders
    .map(f => `- "${f}" (${fileStructure.fileCountByFolder[f] || 0} images)`)
    .join('\n');

  const modeGuidance = promptMode === 'per-folder'
    ? `## Per-Folder Mode Active
The user has selected Per-Folder mode. Each folder will have its own prompt.

**Parse per-folder prompts:**
- User may provide prompts in format "Folder X: [prompt]" or natural language like "for folder X do Y, for folder Z do W"
- Each folder can specify different models (nano-banana-pro or seedream-4.5-edit)
- Each folder can specify different resolutions, quality levels, aspect ratios
- Extract folder-specific settings: "folder 5 in 4K" → folder "5" gets resolution: "4K"
- Extract model preferences: "use Seedream for folder products" → folder "products" gets model: "seedream-4.5-edit"

**Example:**
User: "Folder 5: swap faces to Arab women in 4K. Folder products/summer: put on model, use Seedream high quality"
Parse as:
- Folder "5": operation="Swap faces to Arab women", model="nano-banana-pro", resolution="4K"
- Folder "products/summer": operation="Put on model", model="seedream-4.5-edit", quality="high"
`
    : `## Global Mode Active
The user has selected Global mode. One prompt applies to all folders.

**Parse global prompt:**
- User provides a single prompt that applies to all uploaded folders
- All folders will use the same model, resolution, and settings unless folder-specific exclusions apply
- Extract global settings like resolution, aspect ratio from the prompt
`;

  return `You are an AI assistant that parses natural language prompts into structured image generation jobs.

## Uploaded File Structure
${folderList}

${modeGuidance}

## Your Task
Parse the user's prompt into a structured job. Extract:
- Folder names and their operations
- Model preferences (nano-banana-pro or seedream-4.5-edit)
- Resolution/quality settings
- Aspect ratios
- File exclusions

Set understood=true when you have complete information. Ask clarifying questions if needed.
`;
}
```

### Pattern 3: Prompt Combination Logic (Execution Layer)
**What:** Pure function that combines global and folder prompts based on combination mode
**When to use:** During job expansion (expandJobToGenerations) when building final prompts for API
**Example:**
```typescript
// Source: Prior research (.planning/research/ARCHITECTURE.md lines 220-247)
// Create: lib/job/prompt-builder.ts

/**
 * Build final prompt by combining global and folder-specific prompts
 * @param globalPrompt - Optional global prompt applied to all generations
 * @param folderOperation - Optional folder-specific operation
 * @param combinationMode - How to combine when both exist
 * @returns Final prompt string to send to generation API
 */
export function buildFinalPrompt(
  globalPrompt: string | undefined,
  folderOperation: string | undefined,
  combinationMode: 'prefix' | 'suffix' | 'only' = 'prefix'
): string {
  // Validation: at least one must exist
  if (!globalPrompt && !folderOperation) {
    throw new Error('Either globalPrompt or folderOperation must be provided');
  }

  // No global: use folder only
  if (!globalPrompt) {
    return folderOperation!;
  }

  // No folder or "only" mode: use global only
  if (!folderOperation || combinationMode === 'only') {
    return globalPrompt;
  }

  // Combine based on mode
  if (combinationMode === 'prefix') {
    return `${globalPrompt}\n\n${folderOperation}`;
  }

  if (combinationMode === 'suffix') {
    return `${folderOperation}\n\n${globalPrompt}`;
  }

  // Fallback (should not reach here)
  return folderOperation;
}

// Usage in job-manager.ts expandJobToGenerations
for (const folder of parsedJob.job.folders) {
  const finalPrompt = buildFinalPrompt(
    parsedJob.job.globalPrompt,
    folder.operation,
    parsedJob.job.globalPromptMode || 'prefix'
  );

  const generationJob: GenerationJob = {
    id: generationId,
    operation: finalPrompt, // Combined prompt
    model: folder.model || parsedJob.job.model || DEFAULT_MODEL,
    // ...rest of fields
  };
}
```

### Anti-Patterns to Avoid
- **Inferring mode from prompt presence:** Don't auto-detect mode by checking if folderPrompts exist. Explicit user selection prevents ambiguity and allows parser to validate correctly.
- **Silent fallback to global:** When per-folder mode is active but a folder has no prompt, fail validation or ask user for clarification. Don't silently use global prompt in per-folder mode.
- **Mixing modes in UI:** Don't show both global and per-folder inputs simultaneously. Mutually exclusive modes (toggle/tabs) make intent clear.
- **String concatenation without separator:** Always use clear separators (\n\n) between global and folder prompts for AI model clarity.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dynamic form field rendering based on mode | Custom show/hide logic per field | Conditional rendering with React state | React already handles this efficiently, type-safe with TypeScript |
| Schema validation for optional fields | Manual if/else validation | Zod discriminated unions with .optional() | Zod provides runtime + compile-time safety, already proven in Phase 8 |
| Multi-turn conversation with AI parser | Custom conversation management | Existing ConversationMessage[] pattern from v1.0 | Already implemented in app/api/ai/parse/route.ts |
| Prompt string composition | Template literals everywhere | Dedicated prompt-builder.ts utility | Centralized logic enables testing, prevents inconsistency |

**Key insight:** The codebase already has 90% of the infrastructure needed. Don't rebuild schema patterns (discriminated unions), conversation flows (ConversationMessage), or form state (job-context.tsx). Extend what exists with mode awareness.

## Common Pitfalls

### Pitfall 1: Global + Folder Prompt Ambiguity
**What goes wrong:** User provides both a global prompt and folder-specific prompts in natural language, expecting combination, but system interprets as replacement. Example: "Add sunglasses to all photos, and for folder 5 make them blue" — user expects blue sunglasses in folder 5, but system only applies "make them blue" (ignores global).

**Why it happens:** The current v1.0 code uses fallback logic: `const operation = folder.operation || parsedJob.job.globalPrompt || ''` (job-manager.ts:112). This is OR logic, not AND logic. Without explicit combination mode, the AI parser cannot infer user intent.

**How to avoid:**
1. Add promptMode field to ParsedJobSchema as top-level configuration
2. When promptMode='per-folder' AND user mentions global concepts, AI parser asks: "Should folder prompts combine with or replace this global instruction?"
3. Implement buildFinalPrompt utility with explicit combination modes
4. Update job-manager.ts to call buildFinalPrompt instead of fallback operator

**Warning signs:**
- User says "also" or "in addition to" but only folder prompt is used
- Cost estimation shows different operations per folder when user expected consistency
- Test cases where globalPrompt exists but isn't reflected in final generations

### Pitfall 2: Per-Folder Model Validation Conflicts
**What goes wrong:** User specifies per-folder prompts with mixed models (Nano Banana for folder A, Seedream for folder B), but Zod validation fails because discriminated union expects consistent model field structure.

**Why it happens:** FolderOperationSchema uses discriminated union on 'model' field (Phase 8). When parsing array of folders with different models, each must independently satisfy its discriminator's schema. If parser provides resolution for Seedream or quality for Nano Banana, validation fails.

**How to avoid:**
1. AI parser system prompt must document model-specific parameters clearly
2. Parser should explicitly set undefined for non-applicable fields: `{ model: 'seedream-4.5-edit', quality: 'high', resolution: undefined }`
3. Add validation test cases with mixed-model folder arrays
4. System prompt examples should show per-folder model variation

**Warning signs:**
- Zod validation errors like "Expected undefined, received string" for model-specific fields
- ParsedJob fails validation despite AI returning confident parsed=true
- Different folders in same job have different model but share resolution/quality fields

### Pitfall 3: UI State Desync Between Mode and Prompts
**What goes wrong:** User toggles from Global mode to Per-Folder mode, but previously entered global prompt persists in state and gets sent to parser, confusing it about which mode is active.

**Why it happens:** React state updates aren't atomic. Changing promptMode doesn't automatically clear globalPrompt or folderPrompts. AI parser receives mixed signals: promptMode='per-folder' but globalPrompt has content.

**How to avoid:**
1. Mode toggle handler clears opposing mode's state:
   ```typescript
   const switchToPerFolder = () => {
     setPromptMode('per-folder');
     setGlobalPrompt(''); // Clear global
   };
   const switchToGlobal = () => {
     setPromptMode('global');
     setFolderPrompts({}); // Clear all folder prompts
   };
   ```
2. Add confirmation dialog if user has entered prompts: "Switching modes will clear your current prompts. Continue?"
3. Parser request validation: if promptMode='global', reject if folderPrompts has content

**Warning signs:**
- Parser asks clarifying questions about mode when it should be clear
- Cost estimation uses wrong operation text
- User reports "I switched modes but it's still using the old prompt"

### Pitfall 4: Folder Reference Ambiguity in Per-Folder Mode
**What goes wrong:** User enters per-folder prompts like "Folder 5: swap faces. Products: put on model." Parser misidentifies "Products" as folder name when actual path is "products/summer".

**Why it happens:** Folder matching logic is case-sensitive and path-sensitive. User uses shorthand or partial names, expecting fuzzy matching. Current parser matches exact strings.

**How to avoid:**
1. System prompt includes exact folder list with full paths
2. Parser performs case-insensitive prefix matching: "Products" matches "products/summer" if no exact match
3. When ambiguous, parser asks clarifying question with exact folder options
4. UI shows folder names prominently above each per-folder prompt input

**Warning signs:**
- Parser asks "Which folder did you mean?" for folders that seem obvious
- Folder prompts assigned to wrong folders in ParsedJob
- User uploads "products/summer" and "products/winter" but prompt "Products: X" only applies to one

## Code Examples

Verified patterns from existing codebase and official sources:

### Conditional Textarea Rendering Based on Mode
```typescript
// Source: React best practices + existing app/(protected)/create-job/page.tsx patterns
// Location: app/(protected)/create-job/page.tsx (to be modified)

const [promptMode, setPromptMode] = useState<'global' | 'per-folder'>('global');
const [globalPrompt, setGlobalPrompt] = useState('');
const [folderPrompts, setFolderPrompts] = useState<Record<string, string>>({});
const { folders, fileCountByFolder } = useJobContext();

// Mode toggle with state clearing
const handleModeChange = (newMode: 'global' | 'per-folder') => {
  if (newMode === promptMode) return;

  // Confirm if user has entered content
  const hasContent = promptMode === 'global' ? globalPrompt.trim() : Object.keys(folderPrompts).length > 0;
  if (hasContent) {
    const confirmed = confirm('Switching modes will clear your current prompts. Continue?');
    if (!confirmed) return;
  }

  setPromptMode(newMode);
  if (newMode === 'global') {
    setFolderPrompts({});
  } else {
    setGlobalPrompt('');
  }
};

return (
  <div className="space-y-6">
    {/* Mode selector */}
    <div className="flex gap-2">
      <Button
        variant={promptMode === 'global' ? 'default' : 'outline'}
        onClick={() => handleModeChange('global')}
      >
        Global Prompt
      </Button>
      <Button
        variant={promptMode === 'per-folder' ? 'default' : 'outline'}
        onClick={() => handleModeChange('per-folder')}
      >
        Per-Folder Prompts
      </Button>
    </div>

    {/* Conditional input rendering */}
    {promptMode === 'global' && (
      <div>
        <Label>Prompt for all folders</Label>
        <Textarea
          value={globalPrompt}
          onChange={(e) => setGlobalPrompt(e.target.value)}
          placeholder="Describe what to do with all images..."
          rows={4}
        />
      </div>
    )}

    {promptMode === 'per-folder' && (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Enter a prompt for each folder. Each can use different models and settings.
        </p>
        {folders.map(folder => (
          <div key={folder} className="border rounded-lg p-4">
            <Label className="font-semibold">
              {folder}
              <span className="text-muted-foreground ml-2">
                ({fileCountByFolder[folder]} images)
              </span>
            </Label>
            <Textarea
              value={folderPrompts[folder] || ''}
              onChange={(e) => setFolderPrompts(prev => ({
                ...prev,
                [folder]: e.target.value
              }))}
              placeholder={`What to do with ${folder}...`}
              rows={3}
            />
          </div>
        ))}
      </div>
    )}
  </div>
);
```

### Zod Schema with Prompt Mode Discrimination
```typescript
// Source: Existing lib/ai/schemas/job.ts + Zod discriminated union docs
// Location: lib/ai/schemas/job.ts (to be extended)

import { z } from 'zod';

export const PromptModeSchema = z.enum(['global', 'per-folder']);

export const PromptCombinationModeSchema = z.enum(['prefix', 'suffix', 'only'])
  .default('prefix');

export const ParsedJobSchema = z.object({
  understood: z.boolean(),
  confidence: z.number().min(0).max(1),
  clarifyingQuestions: z.array(ClarifyingQuestionSchema).optional(),
  interpretation: z.string().optional(),
  job: z.object({
    promptMode: PromptModeSchema,
    folders: z.array(FolderOperationSchema).min(1),
    globalPrompt: z.string().optional(),
    globalPromptMode: PromptCombinationModeSchema.optional(),
    model: ModelSchema,
    outputFormat: z.enum(['PNG', 'JPG']).optional(),
  }).optional(),
});

// Validation ensures consistency
export const ConfirmedJobSchema = z.object({
  understood: z.literal(true),
  confidence: z.number().min(0.8),
  interpretation: z.string(),
  job: z.object({
    promptMode: PromptModeSchema,
    folders: z.array(FolderOperationSchema).min(1),
    globalPrompt: z.string().optional(),
    globalPromptMode: PromptCombinationModeSchema.optional(),
    model: ModelSchema,
    outputFormat: z.enum(['PNG', 'JPG']).optional(),
  }),
});
```

### AI Parser System Prompt Extension
```typescript
// Source: Existing lib/ai/prompts/job-parser.ts + OpenAI prompt engineering guide
// Location: lib/ai/prompts/job-parser.ts (to be modified)

export function buildJobParserSystemPrompt(
  fileStructure: FileStructureInfo,
  promptMode: 'global' | 'per-folder'
): string {
  const folderList = fileStructure.folders
    .map(f => `- "${f}" (${fileStructure.fileCountByFolder[f] || 0} images)`)
    .join('\n');

  if (promptMode === 'per-folder') {
    return `You are an AI assistant parsing per-folder prompts into structured jobs.

## Uploaded Folders
${folderList}

## Per-Folder Mode Active
The user will provide a prompt for EACH folder. Parse each folder's prompt into a FolderOperation.

**Folder-specific settings:**
- Each folder can use different models: 'nano-banana-pro' or 'seedream-4.5-edit'
- Nano Banana folders: extract resolution (1K/2K/4K)
- Seedream folders: extract quality (basic/high) and imageSize
- Extract aspect ratios, exclusions, generation counts per folder

**Parsing examples:**
User provides: "Folder 5: swap faces to Arab women in 4K. Folder products: put dress on model using Seedream high quality"

Parse as:
{
  understood: true,
  job: {
    promptMode: "per-folder",
    folders: [
      {
        folderPath: "5",
        operation: "Swap faces to Arab women",
        model: "nano-banana-pro",
        resolution: "4K",
        aspectRatio: "auto",
        photoMode: "reference"
      },
      {
        folderPath: "products",
        operation: "Put dress on model",
        model: "seedream-4.5-edit",
        quality: "high",
        imageSize: "landscape_16_9",
        aspectRatio: "auto",
        photoMode: "analysis"
      }
    ],
    model: "nano-banana-pro" // Job-level default
  }
}

**Important:** Each folder object must match its model's schema:
- Nano Banana: include 'resolution', set quality/imageSize to undefined
- Seedream: include 'quality' and 'imageSize', set resolution to undefined

Set understood=true when all folders have clear operations. Ask clarifying questions if any folder's intent is unclear.
`;
  } else {
    // Global mode (existing v1.0 prompt)
    return `You are an AI assistant parsing a global prompt into structured jobs.

## Uploaded Folders
${folderList}

## Global Mode Active
The user will provide ONE prompt that applies to ALL folders.

Parse the prompt and create FolderOperation objects for each uploaded folder, all using the same operation text unless folder-specific exclusions are mentioned.

[...existing global mode prompt logic...]
`;
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Global prompt only (v1.0) | Global OR Per-Folder mode (v2.0) | Phase 10 | Enables folder-specific model selection, operations per folder |
| Fallback logic (folder OR global) | Explicit combination modes (prefix/suffix/only) | Phase 10 | Resolves prompt ambiguity, user controls precedence |
| Single model per job | Per-folder model selection | Phase 7-9 | Mixed-model jobs (Nano + Seedream in same job) |
| Inferred prompt intent | Explicit promptMode field | Phase 10 | Parser knows exactly what to extract, reduces clarifying questions |

**Deprecated/outdated:**
- Inferring mode from presence of folder.operation: Replaced with explicit promptMode field
- Simple string concatenation for prompts: Replaced with buildFinalPrompt utility and combination modes

## Open Questions

Things that couldn't be fully resolved:

1. **Should per-folder mode allow optional global prompt for shared styling?**
   - What we know: Requirements say modes are "mutually exclusive" (PRMT-01), but prior research documented combination modes (ARCHITECTURE.md)
   - What's unclear: Whether per-folder mode can have OPTIONAL global prompt that acts as prefix/suffix to all folder prompts
   - Recommendation: Start with strict mutual exclusivity (Phase 10), add optional global-in-per-folder in future phase if users request it. Keeps implementation simpler and matches requirement PRMT-01 exactly.

2. **How should cost estimation display per-folder prompts in summary?**
   - What we know: Existing cost-estimation.ts aggregates by model and folder, UI shows byFolder breakdown
   - What's unclear: Whether to show full prompt text per folder in cost summary (could be verbose) or just operation count
   - Recommendation: Show truncated prompt (first 50 chars) + model/settings per folder. Link to full prompt review in separate expandable section.

3. **Should AI parser validate that all folders have prompts in per-folder mode?**
   - What we know: User might forget a folder when entering many per-folder prompts
   - What's unclear: Fail validation, or apply a default "process as-is" operation to forgotten folders
   - Recommendation: Parser should set understood=false and ask "I don't see a prompt for folder X. What should I do with it?" rather than assume.

4. **Can user switch modes after parsing but before execution?**
   - What we know: User might parse in global mode, see preview, then want per-folder customization
   - What's unclear: Whether to allow mode switch after ParsedJob exists, or require re-upload
   - Recommendation: Allow mode switch in 'awaiting_confirmation' state, but clear parsedJob and return to prompt entry. Show warning: "Switching modes will require re-entering prompts."

## Sources

### Primary (HIGH confidence)
- Existing codebase: lib/ai/schemas/job.ts, lib/ai/prompts/job-parser.ts, lib/job/job-manager.ts — Verified patterns for discriminated unions, parser system prompts, job expansion logic
- Prior research: .planning/research/ARCHITECTURE.md (lines 204-247), .planning/research/PITFALLS.md (lines 87-128) — Documented prompt combination strategy and pitfalls
- Zod documentation: [Union and Discriminated Unions](https://deepwiki.com/colinhacks/zod/3.6-union-and-discriminated-unions) — O(1) validation for discriminated unions

### Secondary (MEDIUM confidence)
- [Complex Form with Zod, NextJS and TypeScript - Discriminated Union](https://peturgeorgievv.com/blog/complex-form-with-zod-nextjs-and-typescript-discriminated-union) — Practical example of Zod discriminated unions in forms
- [Parsing Discriminated Unions with Zod](https://timkapitein.nl/blog/parsing-discriminated-unions-with-zod) — Type-safe parsing patterns
- [React Hook Form Multi-Step Tutorial](https://www.buildwithmatija.com/blog/master-multi-step-forms-build-a-dynamic-react-form-in-6-simple-steps) — Dynamic form validation with Zod
- [Mapping User Intent to Prompt](https://medium.com/agentic-ux/mapping-users-intent-to-prompt-ux-flow-9a9fb65c568b) — User intent parsing in AI systems

### Tertiary (LOW confidence)
- [LangChain Prompting Patterns](https://zilliz.com/blog/prompting-langchain) — Prefix/suffix prompt patterns (validated against prior research)
- [AI Prompt Validation Strategies](https://www.promptpanda.io/blog/ai-prompt-validation/) — Validation approaches (marked for validation during implementation)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in use, no new dependencies
- Architecture: HIGH - Existing patterns (discriminated unions, parser prompts) proven in Phases 7-8, prior research documented combination strategy
- Pitfalls: HIGH - Identified from existing code analysis (job-manager.ts:112 fallback logic) and prior research notes

**Research date:** 2026-01-27
**Valid until:** 2026-02-27 (30 days - stable domain, core patterns unlikely to change)

**Research domains covered:**
- Prompt mode selection and UI state management
- AI parser adaptation for per-folder configurations
- Schema validation with discriminated unions for mixed models
- Prompt combination strategies (prefix/suffix/only)
- Form conditional rendering patterns
- Cost estimation display for per-folder jobs

**Dependencies validated:**
- Phase 7: Model strategy infrastructure (model field in FolderOperation)
- Phase 8: Discriminated union schemas (model-specific validation)
- Phase 9: Queue integration (model-aware parameter building)
