# Phase 11: Multi-Model UI - Research

**Researched:** 2026-01-26
**Domain:** React dynamic forms with model-specific validation, discriminated unions, and per-item configuration
**Confidence:** HIGH

## Summary

This phase implements UI for multi-model selection with dynamic form fields that change based on the selected model, plus per-folder prompt mode where each uploaded folder gets its own prompt input. The core technical challenge is coordinating discriminated union validation (already implemented in Zod schemas) with React form state management to provide type-safe, model-specific UIs.

**Key architectural insight:** The backend infrastructure already exists (ModelStrategy pattern, discriminated union schemas, prompt-builder utilities). This phase is purely UI - presenting existing backend capabilities to users and managing local form state until submission.

**Primary recommendation:** Use controlled component pattern with React useState for form state management. Leverage existing Zod schemas to derive UI constraints (available options per model). Use shadcn/ui Select for model picker and conditional rendering for model-specific fields. For per-folder prompts, render dynamic array of inputs mapped from uploaded folders.

## Standard Stack

The project already uses these libraries - no new dependencies needed:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React 19.2.3 | 19.2.3 | Component state management | Built-in useState/useContext sufficient for form state |
| Zod 4.3.6 | 4.3.6 | Schema validation with discriminated unions | Already used for FolderOperationSchema model discrimination |
| TypeScript 5.9.3 | 5.9.3 | Type safety for form state | Infer types from Zod schemas for compile-time safety |
| Next.js 16.1.4 | 16.1.4 | App Router with React Server Components | Existing framework |

### UI Components (shadcn/ui)
| Component | Purpose | Already Installed |
|-----------|---------|-------------------|
| Select | Model dropdown selector | Yes (@radix-ui/react-select 2.2.6) |
| Card | Section containers | Yes |
| Input/Textarea | Prompt text inputs | Yes |
| Badge | Model/tier indicators | Yes |
| Tabs | Potential prompt mode switcher | Yes (@radix-ui/react-tabs 1.1.13) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| useState | React Hook Form | RHF adds overhead (useFieldArray, register pattern). Current form is simple - model + prompts. useState is sufficient and already used throughout codebase. |
| Controlled inputs | Uncontrolled (refs) | Uncontrolled pattern doesn't fit - need real-time cost updates and validation feedback as user changes model/settings. |
| Custom Toggle | RadioGroup primitive | RadioGroup enforces single selection semantics. If model selector is 2 options, could work, but Select is more extensible for future models. |

**Installation:** No new packages needed. All dependencies already in package.json.

## Architecture Patterns

### Current Codebase State Management Pattern

**Established pattern from lib/session/job-context.tsx:**
```typescript
// Global context for job session state
const JobContext = createContext<JobSession | null>(null);

interface JobSession {
  parsedJob: ParsedJob | null;
  setParsedJob: (job: ParsedJob | null) => void;
  updateParsedJob: (updater: (job: ParsedJob) => ParsedJob) => void;
  // ... other session data
}
```

This phase should follow the same pattern:
- **Job state lives in JobContext** (already includes parsedJob with model discriminated unions)
- **Local component state for UI interactions** (dropdown open/closed, validation errors)
- **Call updateParsedJob** to modify job configuration, triggering cost recalculation

### Pattern 1: Model Selector with Dynamic Field Rendering

**What:** Controlled Select component that updates parsedJob.job.model, triggering conditional field rendering.

**When to use:** Main job configuration screen where user picks model before reviewing.

**Example:**
```typescript
// Source: Existing codebase pattern + React discriminated union forms
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useJobContext } from '@/lib/session/job-context';
import { NANO_BANANA_CAPABILITIES, SEEDREAM_CAPABILITIES } from '@/lib/models/types';

function ModelSelector() {
  const { parsedJob, updateParsedJob } = useJobContext();
  const currentModel = parsedJob?.job?.model || 'nano-banana-pro';

  const handleModelChange = (newModel: ModelId) => {
    updateParsedJob((job) => {
      if (!job.job) return job;

      // Update model and reset model-specific fields to defaults
      const updatedFolders = job.job.folders.map(folder => {
        if (newModel === 'nano-banana-pro') {
          // Switching TO Nano Banana: add resolution, remove Seedream fields
          return {
            ...folder,
            model: newModel,
            resolution: '2K' as const,
            quality: undefined,
            imageSize: undefined,
          };
        } else {
          // Switching TO Seedream: add quality/imageSize, remove Nano fields
          return {
            ...folder,
            model: newModel,
            quality: 'basic' as const,
            imageSize: 'landscape_16_9' as const,
            resolution: undefined,
          };
        }
      });

      return {
        ...job,
        job: {
          ...job.job,
          model: newModel,
          folders: updatedFolders,
        },
      };
    });
  };

  return (
    <div className="space-y-2">
      <Label>Image Generation Model</Label>
      <Select value={currentModel} onValueChange={handleModelChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="nano-banana-pro">
            {NANO_BANANA_CAPABILITIES.displayName}
          </SelectItem>
          <SelectItem value="seedream-4.5-edit">
            {SEEDREAM_CAPABILITIES.displayName}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
```

### Pattern 2: Conditional Model-Specific Fields

**What:** Render different fields based on parsedJob.job.model discriminator.

**When to use:** Immediately after model selector, showing relevant configuration options.

**Example:**
```typescript
// Source: React conditional rendering + Zod discriminated union pattern
function ModelSpecificSettings() {
  const { parsedJob, updateParsedJob } = useJobContext();
  const model = parsedJob?.job?.model || 'nano-banana-pro';

  // Get first folder's settings as representative (or iterate for per-folder)
  const folder = parsedJob?.job?.folders[0];

  if (model === 'nano-banana-pro') {
    return (
      <div className="space-y-4">
        <div>
          <Label>Resolution</Label>
          <Select
            value={folder?.resolution || '2K'}
            onValueChange={(res) => updateFolderField(0, 'resolution', res)}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1K">1K ($0.134/image)</SelectItem>
              <SelectItem value="2K">2K ($0.134/image)</SelectItem>
              <SelectItem value="4K">4K ($0.24/image)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Aspect Ratio</Label>
          <Select
            value={folder?.aspectRatio || 'auto'}
            onValueChange={(ar) => updateFolderField(0, 'aspectRatio', ar)}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {NANO_BANANA_CAPABILITIES.supportedAspectRatios.map(ar => (
                <SelectItem key={ar} value={ar}>{ar}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  // Seedream model
  return (
    <div className="space-y-4">
      <div>
        <Label>Quality</Label>
        <Select
          value={(folder as any)?.quality || 'basic'}
          onValueChange={(q) => updateFolderField(0, 'quality', q)}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="basic">Basic ($0.032/image)</SelectItem>
            <SelectItem value="high">High ($0.032/image)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Image Size</Label>
        <Select
          value={(folder as any)?.imageSize || 'landscape_16_9'}
          onValueChange={(size) => updateFolderField(0, 'imageSize', size)}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {SEEDREAM_CAPABILITIES.supportedAspectRatios.map(size => (
              <SelectItem key={size} value={size}>
                {size.replace(/_/g, ' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
```

### Pattern 3: Per-Folder Prompt Inputs

**What:** Dynamic array of prompt inputs, one per uploaded folder, rendered with Array.map().

**When to use:** When parsedJob.job.promptMode === 'per-folder'.

**Example:**
```typescript
// Source: React dynamic lists pattern from useFieldArray concept
function PerFolderPrompts() {
  const { parsedJob, updateParsedJob, folders, fileCountByFolder } = useJobContext();

  if (parsedJob?.job?.promptMode !== 'per-folder') return null;

  const handlePromptChange = (folderPath: string, newPrompt: string) => {
    updateParsedJob((job) => {
      if (!job.job) return job;

      const updatedFolders = job.job.folders.map(folder =>
        folder.folderPath === folderPath
          ? { ...folder, operation: newPrompt }
          : folder
      );

      return {
        ...job,
        job: {
          ...job.job,
          folders: updatedFolders,
        },
      };
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>Per-Folder Prompts</Label>
        <Badge variant="secondary">
          {folders.length} folders
        </Badge>
      </div>

      {folders.map((folderPath) => {
        const folder = parsedJob.job?.folders.find(f => f.folderPath === folderPath);
        const fileCount = fileCountByFolder[folderPath] || 0;

        return (
          <Card key={folderPath}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>{folderPath}</span>
                <Badge variant="outline">{fileCount} images</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder={`What should we do with images in ${folderPath}?`}
                value={folder?.operation || ''}
                onChange={(e) => handlePromptChange(folderPath, e.target.value)}
                rows={3}
              />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
```

### Pattern 4: Prompt Mode Switcher

**What:** Toggle between 'global' (one prompt for all) and 'per-folder' (one prompt per folder).

**When to use:** At the top of prompt input section, before showing prompt fields.

**Example:**
```typescript
// Source: Tabs component pattern from shadcn/ui
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

function PromptModeSelector() {
  const { parsedJob, updateParsedJob } = useJobContext();
  const mode = parsedJob?.job?.promptMode || 'global';

  const handleModeChange = (newMode: 'global' | 'per-folder') => {
    updateParsedJob((job) => {
      if (!job.job) return job;

      return {
        ...job,
        job: {
          ...job.job,
          promptMode: newMode,
          // If switching to per-folder, split global prompt to folders
          // If switching to global, could merge folder prompts (or keep separate)
        },
      };
    });
  };

  return (
    <Tabs value={mode} onValueChange={handleModeChange}>
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="global">
          Global Prompt
        </TabsTrigger>
        <TabsTrigger value="per-folder">
          Per-Folder Prompts
        </TabsTrigger>
      </TabsList>

      <TabsContent value="global">
        <GlobalPromptInput />
      </TabsContent>

      <TabsContent value="per-folder">
        <PerFolderPrompts />
      </TabsContent>
    </Tabs>
  );
}
```

### Pattern 5: Cost Breakdown by Model

**What:** Extend existing CostEstimate component to show model-specific pricing.

**When to use:** Cost estimation page, showing breakdown by model when multiple models used.

**Example:**
```typescript
// Source: Existing components/job/cost-estimate.tsx + byModel field
function ModelCostBreakdown({ breakdown }: { breakdown: CostBreakdown }) {
  // breakdown.byModel already exists from calculateCostEstimate
  const { byModel } = breakdown;

  if (byModel.length <= 1) {
    // Only one model used, no need for breakdown
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="w-4 h-4" />
          By Model
        </CardTitle>
        <CardDescription>Cost breakdown by generation model</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {byModel.map((modelData) => (
          <div key={modelData.model} className="flex items-center justify-between py-2">
            <div className="flex items-center gap-3">
              <span className="font-medium">
                {modelData.model === 'nano-banana-pro'
                  ? 'Nano Banana Pro'
                  : 'Seedream 4.5 Edit'}
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">
                {modelData.imageCount} images
              </span>
              <span className="text-muted-foreground">
                @ {formatCost(modelData.costPerImage)}/avg
              </span>
              <span className="font-medium">
                {formatCost(modelData.totalCost)}
              </span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
```

### Anti-Patterns to Avoid

**1. Storing UI state in JobContext**
- Don't: Put dropdown open/closed, hover states, validation errors in global context
- Do: Keep transient UI state local with useState, only lift confirmed job changes to context

**2. Type assertions for discriminated unions**
- Don't: `(folder as NanoBananaFolder).resolution` everywhere without checking model
- Do: Check model first: `if (folder.model === 'nano-banana-pro') { folder.resolution }`
- TypeScript narrows the type automatically after discriminator check

**3. Manual field synchronization**
- Don't: Manually track which fields to show/hide based on separate state variable
- Do: Single source of truth (parsedJob.job.model), derive UI from that

**4. Forgetting to clear model-specific fields on switch**
- Don't: Leave `resolution` field populated when switching to Seedream
- Do: Explicitly set `resolution: undefined` and add `quality: 'basic'` when switching models
- This ensures Zod discriminated union validation passes

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Form validation for discriminated unions | Custom validation per model | Zod discriminatedUnion (already implemented) | FolderOperationSchema already handles model-specific validation. Schemas in lib/ai/schemas/job.ts are the single source of truth. |
| Cost calculation by model | UI-side multiplication | lib/job/cost-estimation.ts calculateCostEstimate | Already implements strategy pattern, reads from ModelCapabilities. Don't duplicate logic. |
| Model capabilities data | Hard-coded in UI | NANO_BANANA_CAPABILITIES, SEEDREAM_CAPABILITIES from lib/models/types.ts | Centralized source of truth for supported aspect ratios, max reference images, pricing. |
| Prompt combination logic | String concatenation in component | lib/job/prompt-builder.ts buildFinalPrompt | Handles prefix/suffix/only modes correctly with proper separators. |
| Model strategy creation | Direct instantiation | getModelStrategy() from lib/models/model-factory.ts | Factory pattern already implemented, returns correct strategy instance. |

**Key insight:** Phase 7-10 already built the model infrastructure. This phase is pure presentation layer - don't re-implement business logic in UI.

## Common Pitfalls

### Pitfall 1: Discriminated Union Type Narrowing

**What goes wrong:** TypeScript doesn't narrow folder.resolution type access, causing errors like "Property 'resolution' does not exist on type 'FolderOperation'".

**Why it happens:** FolderOperation is a discriminated union. TypeScript needs explicit model check before accessing model-specific fields.

**How to avoid:**
```typescript
// BAD: Direct access without checking discriminator
const resolution = folder.resolution; // Type error!

// GOOD: Check discriminator first
if (folder.model === 'nano-banana-pro') {
  const resolution = folder.resolution; // TypeScript knows this is valid
}

// GOOD: Type guard for reusable logic
function isNanoBananaFolder(folder: FolderOperation): folder is NanoBananaFolder {
  return folder.model === 'nano-banana-pro';
}

if (isNanoBananaFolder(folder)) {
  const resolution = folder.resolution; // Narrowed type
}
```

**Warning signs:**
- TypeScript errors about accessing model-specific fields
- Using `(folder as NanoBananaFolder).resolution` repeatedly

### Pitfall 2: Incomplete Field Updates on Model Switch

**What goes wrong:** User switches from Nano to Seedream. UI shows quality dropdown, but folder object still has `resolution: '4K'` and missing `quality`. Zod validation fails at submission.

**Why it happens:** Discriminated union validation requires:
- Nano folders: `resolution` present, `quality` and `imageSize` undefined
- Seedream folders: `quality` and `imageSize` present, `resolution` undefined

Partial updates break this contract.

**How to avoid:**
```typescript
// BAD: Only adding new fields
const updatedFolder = {
  ...folder,
  model: 'seedream-4.5-edit',
  quality: 'basic',
  imageSize: 'landscape_16_9',
  // resolution still present! Zod validation fails
};

// GOOD: Explicitly clear old model's fields
const updatedFolder = {
  ...folder,
  model: 'seedream-4.5-edit',
  quality: 'basic' as const,
  imageSize: 'landscape_16_9' as const,
  resolution: undefined, // Clear Nano field
};
```

**Prevention:** Use helper function for model switching that handles all field transitions.

**Warning signs:**
- Form looks correct but submission fails with Zod validation error
- Console shows "Invalid discriminated union" or similar

### Pitfall 3: Cost Calculation Out of Sync

**What goes wrong:** User changes model or resolution, but cost display doesn't update. Or cost updates but uses wrong pricing tier.

**Why it happens:** Cost calculation depends on parsedJob.job.folders, but calculation might be cached or not re-triggered on model change.

**How to avoid:**
```typescript
// Derive cost in useMemo with correct dependencies
const costBreakdown = useMemo<CostBreakdown | null>(() => {
  if (!parsedJob?.job) return null;
  return calculateCostEstimate(parsedJob.job.folders, fileCountByFolder);
}, [parsedJob?.job, fileCountByFolder]); // parsedJob.job changes when model/settings change

// NOT just [parsedJob] - that's the outer object, job might not trigger re-calc
```

**Prevention:**
- Use `parsedJob?.job` (the nested job object) as dependency, not just `parsedJob`
- Test cost updates by switching models multiple times
- Verify cost matches expected pricing from ModelCapabilities

**Warning signs:**
- Cost is zero or shows old value after model switch
- Cost uses wrong per-image price (e.g., $0.134 for Seedream which should be $0.032)

### Pitfall 4: Per-Folder Prompt State Desync

**What goes wrong:** User enters prompts for 3 folders. Then uploads more files, now 5 folders. Old 3 folders have prompts, new 2 folders don't. UI shows 5 inputs but only 3 have values. User doesn't notice missing prompts, submits, generation fails for 2 folders.

**Why it happens:** folders array in JobContext comes from upload phase. parsedJob.job.folders comes from AI parsing. These can get out of sync if uploads change after parsing.

**How to avoid:**
```typescript
// Reconcile uploaded folders with parsed folders on render
const reconcileFolders = () => {
  const uploadedFolders = folders; // From JobContext (upload phase)
  const parsedFolders = parsedJob?.job?.folders || []; // From AI parsing

  // Create map of parsed folders by path
  const parsedMap = new Map(parsedFolders.map(f => [f.folderPath, f]));

  // For each uploaded folder, find matching parsed folder or create placeholder
  return uploadedFolders.map(folderPath => {
    const parsed = parsedMap.get(folderPath);
    if (parsed) return parsed;

    // Missing parsed folder - create default
    return {
      folderPath,
      operation: '', // User must fill this
      model: parsedJob?.job?.model || 'nano-banana-pro',
      resolution: '2K',
      aspectRatio: 'auto',
      photoMode: 'reference',
    };
  });
};
```

**Prevention:**
- Always derive folder list from JobContext.folders (source of truth for uploads)
- Show validation error if any folder has empty operation in per-folder mode
- Consider warning badge "X folders need prompts"

**Warning signs:**
- Missing folder in prompt list
- Empty operations in parsedJob.job.folders at submission
- More uploaded folders than parsed folders

### Pitfall 5: Model Selector Doesn't Update All Folders

**What goes wrong:** User has 5 folders parsed. Changes model selector from Nano to Seedream. First folder updates but folders 2-5 still have `model: 'nano-banana-pro'` with `resolution` field. Mixed models break cost calculation or generation.

**Why it happens:** updateParsedJob only updates `job.model` (the default), not individual folder models.

**How to avoid:**
```typescript
// Update ALL folders when changing default model
const handleModelChange = (newModel: ModelId) => {
  updateParsedJob((job) => {
    if (!job.job) return job;

    // Map ALL folders, not just first
    const updatedFolders = job.job.folders.map(folder => {
      if (newModel === 'nano-banana-pro') {
        return {
          ...folder,
          model: newModel,
          resolution: folder.resolution || '2K', // Preserve if exists
          quality: undefined,
          imageSize: undefined,
        };
      } else {
        return {
          ...folder,
          model: newModel,
          quality: (folder as any).quality || 'basic',
          imageSize: (folder as any).imageSize || 'landscape_16_9',
          resolution: undefined,
        };
      }
    });

    return {
      ...job,
      job: {
        ...job.job,
        model: newModel, // Update default
        folders: updatedFolders, // Update all folder instances
      },
    };
  });
};
```

**Prevention:**
- Always update ALL folders in job.folders array, not just job.model
- Test with multiple folders (3+) to catch array update bugs
- Log folder models to console after switch to verify consistency

**Warning signs:**
- Cost breakdown shows mixed models when only one selected
- Generation fails for some folders but not others
- Zod validation error mentioning unexpected fields

## Code Examples

Verified patterns from official sources:

### Dynamic Form Fields Based on Selection
```typescript
// Source: React Hook Form + discriminated union pattern
// https://dev.to/csar_zoleko_e6c3bb497f0d/dynamic-forms-with-discriminatedunion-and-react-hook-form-276a
// Adapted for useState pattern (no RHF needed)

function DynamicModelFields() {
  const { parsedJob, updateParsedJob } = useJobContext();
  const model = parsedJob?.job?.model || 'nano-banana-pro';

  // Derive available options from capabilities
  const capabilities = model === 'nano-banana-pro'
    ? NANO_BANANA_CAPABILITIES
    : SEEDREAM_CAPABILITIES;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Model Settings</CardTitle>
        <CardDescription>
          Configure {capabilities.displayName} parameters
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Model-specific fields appear here based on discriminator */}
        {model === 'nano-banana-pro' ? (
          <NanoBananaFields />
        ) : (
          <SeedreamFields />
        )}

        {/* Common fields (aspectRatio, photoMode) */}
        <CommonFields capabilities={capabilities} />
      </CardContent>
    </Card>
  );
}
```

### Model Selector with Capability Display
```typescript
// Source: shadcn/ui Select + AI model selector pattern
// https://www.shadcn.io/ai/model-selector
// Simplified for 2 models (no search needed)

import { ChipIcon, SparklesIcon } from 'lucide-react';

function ModelSelector() {
  const { parsedJob, updateParsedJob } = useJobContext();
  const currentModel = parsedJob?.job?.model || 'nano-banana-pro';

  const models = [
    {
      id: 'nano-banana-pro' as const,
      name: 'Nano Banana Pro',
      description: '3 resolutions, 11 aspect ratios',
      icon: ChipIcon,
      capabilities: NANO_BANANA_CAPABILITIES,
    },
    {
      id: 'seedream-4.5-edit' as const,
      name: 'Seedream 4.5 Edit',
      description: '2 quality tiers, 9 preset sizes',
      icon: SparklesIcon,
      capabilities: SEEDREAM_CAPABILITIES,
    },
  ];

  return (
    <Select value={currentModel} onValueChange={handleModelChange}>
      <SelectTrigger className="w-full">
        <SelectValue>
          {models.find(m => m.id === currentModel)?.name}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {models.map((model) => {
          const Icon = model.icon;
          return (
            <SelectItem key={model.id} value={model.id}>
              <div className="flex items-center gap-3">
                <Icon className="w-4 h-4" />
                <div className="flex flex-col">
                  <span className="font-medium">{model.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {model.description}
                  </span>
                </div>
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
```

### Per-Folder Prompt Array Rendering
```typescript
// Source: React array rendering pattern
// https://goshacmd.com/array-form-inputs/

function PerFolderPromptList() {
  const { folders, fileCountByFolder, parsedJob, updateParsedJob } = useJobContext();

  // Reconcile uploaded folders with parsed job folders
  const folderData = folders.map(folderPath => {
    const parsed = parsedJob?.job?.folders.find(f => f.folderPath === folderPath);
    return {
      folderPath,
      operation: parsed?.operation || '',
      fileCount: fileCountByFolder[folderPath] || 0,
    };
  });

  const updateFolderPrompt = (folderPath: string, newPrompt: string) => {
    updateParsedJob((job) => {
      if (!job.job) return job;

      const folderIndex = job.job.folders.findIndex(f => f.folderPath === folderPath);
      if (folderIndex === -1) {
        // Folder not in parsed job yet, add it
        const newFolder: FolderOperation = {
          folderPath,
          operation: newPrompt,
          model: job.job.model,
          resolution: job.job.model === 'nano-banana-pro' ? '2K' : undefined,
          quality: job.job.model === 'seedream-4.5-edit' ? 'basic' : undefined,
          imageSize: job.job.model === 'seedream-4.5-edit' ? 'landscape_16_9' : undefined,
          aspectRatio: 'auto',
          photoMode: 'reference',
        };
        return {
          ...job,
          job: {
            ...job.job,
            folders: [...job.job.folders, newFolder],
          },
        };
      } else {
        // Update existing folder
        const updatedFolders = [...job.job.folders];
        updatedFolders[folderIndex] = {
          ...updatedFolders[folderIndex],
          operation: newPrompt,
        };
        return {
          ...job,
          job: {
            ...job.job,
            folders: updatedFolders,
          },
        };
      }
    });
  };

  return (
    <div className="space-y-3">
      {folderData.map(({ folderPath, operation, fileCount }) => (
        <Card key={folderPath}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Folder className="w-4 h-4" />
                {folderPath}
              </div>
              <Badge variant="secondary">{fileCount} images</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder={`Prompt for ${folderPath}...`}
              value={operation}
              onChange={(e) => updateFolderPrompt(folderPath, e.target.value)}
              rows={2}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

### Prompt Mode Toggle with Tabs
```typescript
// Source: shadcn/ui Tabs component
// https://ui.shadcn.com/docs/components/tabs

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

function PromptModeInterface() {
  const { parsedJob, updateParsedJob } = useJobContext();
  const mode = parsedJob?.job?.promptMode || 'global';

  const handleModeChange = (newMode: 'global' | 'per-folder') => {
    updateParsedJob((job) => {
      if (!job.job) return job;

      // When switching to per-folder, distribute global prompt to all folders
      let updatedFolders = job.job.folders;
      if (newMode === 'per-folder' && job.job.globalPrompt) {
        updatedFolders = job.job.folders.map(folder => ({
          ...folder,
          operation: folder.operation || job.job.globalPrompt || '',
        }));
      }

      return {
        ...job,
        job: {
          ...job.job,
          promptMode: newMode,
          folders: updatedFolders,
        },
      };
    });
  };

  return (
    <Tabs value={mode} onValueChange={handleModeChange}>
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="global">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4" />
            Global Prompt
          </div>
        </TabsTrigger>
        <TabsTrigger value="per-folder">
          <div className="flex items-center gap-2">
            <Folders className="w-4 h-4" />
            Per-Folder Prompts
          </div>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="global" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Global Prompt</CardTitle>
            <CardDescription>
              Applied to all {parsedJob?.job?.folders.length || 0} folders
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Describe what you want to do with all images..."
              value={parsedJob?.job?.globalPrompt || ''}
              onChange={(e) => updateParsedJob((job) => ({
                ...job,
                job: job.job ? {
                  ...job.job,
                  globalPrompt: e.target.value,
                } : undefined,
              }))}
              rows={4}
            />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="per-folder" className="space-y-4">
        <PerFolderPromptList />
      </TabsContent>
    </Tabs>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| React Hook Form for all forms | useState for simple forms | 2025-2026 | React 19's improved rendering + simpler forms don't need RHF overhead. Use RHF for complex multi-step forms with heavy validation, useState for model selector + prompts. |
| Manual discriminated union handling | Zod discriminatedUnion | Zod 3.x (2022+) | Type-safe model-specific validation. O(1) discriminator lookup. Must explicitly set undefined for unused model fields. |
| Context for all state | Context + useState hybrid | React 18+ | Context for cross-component state (job session). useState for local UI state (dropdown open). Avoids context re-render cascade. |
| Separate aspect ratio lists | Derive from ModelCapabilities | Phase 7 implementation | Single source of truth. UI reads supportedAspectRatios from NANO_BANANA_CAPABILITIES. No hardcoded arrays. |
| String concat for prompts | buildFinalPrompt utility | Phase 10 implementation | Handles prefix/suffix/only modes. Proper separators. Centralized logic. |

**Deprecated/outdated:**
- **React Hook Form with schema resolver for simple forms**: Overkill when form has 3-5 fields. useState + manual Zod validation on submit is sufficient and more direct.
- **useReducer for form state**: useState is clearer for model selector + prompts. useReducer adds indirection without benefit for this case.
- **Uncontrolled inputs with refs**: Need real-time cost updates, so controlled inputs required.

## Open Questions

Things that couldn't be fully resolved:

1. **UI placement: Where does model selector appear?**
   - What we know: Cost page exists (app/(protected)/job/cost/page.tsx). Review page exists. Job creation flow goes Upload → Parse → Review → Cost → Execute.
   - What's unclear: Does model selector appear on Review page (before cost) or Cost page (alongside cost breakdown)? Or both?
   - Recommendation: Model selector on Cost page (user sees cost impact immediately). Review page shows parsed job with current model, user can edit on Cost page.

2. **Global vs Per-Folder prompt mode: When does user choose?**
   - What we know: PromptModeSchema defaults to 'global'. AI parser can detect per-folder intent from natural language.
   - What's unclear: Should UI provide explicit mode toggle, or rely on AI detection? If toggle exists, where does it appear?
   - Recommendation: Provide explicit toggle on Review page. User can override AI's detection. Tabs component for clear mode switching.

3. **Model-specific settings: Global or per-folder?**
   - What we know: Schema allows per-folder model (`folder.model`). Also job-level default (`job.model`).
   - What's unclear: Can user set different models for different folders in UI? Or is model selector global with per-folder prompt only?
   - Recommendation: Phase 11 implements global model selector (all folders use same model). Future phase can add per-folder model if needed. Simpler UX for v1.

4. **Cost breakdown by model: Show when single model selected?**
   - What we know: CostBreakdown has byModel field. Current cost-estimate.tsx shows byResolution breakdown.
   - What's unclear: If user only uses Nano Banana (single model), should "By Model" section appear? Or only show when mixed models?
   - Recommendation: Only show "By Model" section if byModel.length > 1. Reduces visual clutter for single-model jobs (95% of cases initially).

## Sources

### Primary (HIGH confidence)
- Existing codebase files (lib/models/types.ts, lib/ai/schemas/job.ts, lib/job/cost-estimation.ts, lib/job/prompt-builder.ts) - Authoritative source for schema structure and model capabilities
- React 19 official documentation - Built-in hooks (useState, useContext)
- Zod official documentation (zod.dev/api) - Discriminated union validation
- shadcn/ui component documentation:
  - [Toggle Group](https://ui.shadcn.com/docs/components/toggle-group) - Model selector alternative
  - [Radio Group](https://ui.shadcn.com/docs/components/radio-group) - Single selection pattern
  - [Select](https://ui.shadcn.com/docs/components/select) - Dropdown component (already in use)
  - [Tabs](https://ui.shadcn.com/docs/components/tabs) - Prompt mode switcher

### Secondary (MEDIUM confidence)
- [Complex Form with Zod, NextJS and TypeScript - Discriminated Union](https://peturgeorgievv.com/blog/complex-form-with-zod-nextjs-and-typescript-discriminated-union) - Pattern for handling discriminated unions in forms
- [Dynamic forms with discriminatedUnion and React Hook Form](https://dev.to/csar_zoleko_e6c3bb497f0d/dynamic-forms-with-discriminatedunion-and-react-hook-form-276a) - Field array patterns (adapted for useState)
- [React State Management in 2025: What You Actually Need](https://www.developerway.com/posts/react-state-management-2025) - useState vs Context guidance
- [Making dynamic form inputs with React](https://goshacmd.com/array-form-inputs/) - Array of inputs pattern
- [React AI Model Selector](https://www.shadcn.io/ai/model-selector) - Model selection UI pattern

### Tertiary (LOW confidence)
- WebSearch results for "React dynamic form fields TypeScript 2026" - General patterns, not specific to discriminated unions
- WebSearch results for "cost estimation breakdown UI pattern" - More about project costs than UI patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new dependencies, all libraries already in package.json
- Architecture: HIGH - Existing patterns from job-context.tsx and cost-estimation.ts clearly define approach
- Pitfalls: HIGH - Discriminated union pitfalls verified from Zod documentation and TypeScript behavior

**Research date:** 2026-01-26
**Valid until:** ~60 days (React patterns stable, Zod stable, shadcn/ui components stable)
