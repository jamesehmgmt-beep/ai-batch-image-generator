# Phase 15: Interpretation Confirmation UI - Research

**Researched:** 2026-01-30
**Domain:** Multi-step form confirmation, AI interpretation review UI
**Confidence:** HIGH

## Summary

Phase 15 implements an interpretation confirmation step between AI prompt parsing (Phase 14) and final cost estimation. This is a critical "review before submit" pattern where users verify AI's understanding before proceeding with job creation.

The research reveals this should follow established multi-step form UX patterns: display a comprehensive summary of AI interpretation, allow inline corrections, and provide clear approve/edit actions. The key insight from 2026 UX research is that this step is where users catch mistakes — making it both comprehensive (show everything) and actionable (allow direct corrections without backtracking).

**Primary recommendation:** Build a dedicated confirmation page between review and cost pages that displays a summary card with generation counts and per-image model assignments, allows inline editing of assignments/exclusions, and offers two paths forward: approve to continue or edit prompt to go back.

## Standard Stack

The project already has the necessary libraries installed. No additional dependencies required.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React 19 | ^19.2.3 | UI framework | Already in use, provides hooks for state management |
| Next.js 16 | ^16.1.4 | App Router framework | Already in use, provides routing and page structure |
| Zod | ^4.3.6 | Schema validation | Already validates ParsedJob schema from Phase 14 |
| shadcn/ui | (components) | UI components | Card, Badge, Button already established in codebase |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | ^0.563.0 | Icons | Eye (view), Edit (edit mode), Check (approve), AlertTriangle (warnings) |
| class-variance-authority | ^0.7.1 | Component variants | Badge variants for model types, status indicators |
| tailwind-merge | ^3.4.0 | Class merging | Conditional styling for edit/view states |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom confirmation | react-hook-form | Overkill - we're displaying, not collecting new data |
| New page route | Modal/Dialog | Page route better for multi-step flow context |
| Separate components | All-in-one component | Separation matches existing pattern (ParsedJobReview, FolderOperationEditor) |

**Installation:**
No new packages needed. All dependencies already installed.

## Architecture Patterns

### Recommended Project Structure
```
app/(protected)/job/
├── review/page.tsx           # Existing: AI prompt entry
├── confirm/page.tsx          # NEW: Interpretation confirmation (Phase 15)
├── cost/page.tsx             # Existing: Cost estimation
└── preview/[jobId]/page.tsx  # Existing: Generation preview

components/job/
├── interpretation-summary.tsx  # NEW: Summary card with counts
├── per-image-assignments.tsx   # NEW: Display/edit per-image model assignments
├── folder-exclusions.tsx       # NEW: Display/edit exclusions
└── parsed-job-review.tsx       # Existing: Read-only review component
```

### Pattern 1: Confirmation Summary Card
**What:** Summary card displaying total generation count, breakdown by model, and breakdown by folder with counts.

**When to use:** Top of confirmation page to give users immediate overview of what AI understood.

**Example:**
```typescript
// components/job/interpretation-summary.tsx
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { calculateGenerationCount } from '@/lib/job/generation-count';

interface InterpretationSummaryProps {
  job: ParsedJob['job'];
  fileCountByFolder: Record<string, number>;
}

export function InterpretationSummary({ job, fileCountByFolder }: InterpretationSummaryProps) {
  // Calculate total generations using Phase 14 logic
  const totalGenerations = job.folders.reduce((sum, folder) => {
    const count = calculateGenerationCount(folder, fileCountByFolder[folder.folderPath] || 0);
    return sum + count;
  }, 0);

  // Group by model for multi-model jobs
  const byModel = job.folders.reduce((acc, folder) => {
    const model = folder.model;
    const count = calculateGenerationCount(folder, fileCountByFolder[folder.folderPath] || 0);
    acc[model] = (acc[model] || 0) + count;
    return acc;
  }, {} as Record<string, number>);

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader>
        <CardTitle>AI Interpretation Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="text-2xl font-bold">{totalGenerations} generations</div>
          {Object.entries(byModel).map(([model, count]) => (
            <div key={model}>
              <Badge>{model}</Badge>: {count} images
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

### Pattern 2: Per-Image Assignment Display/Editor
**What:** Component showing which specific images are assigned to which models, with inline editing capability.

**When to use:** When folder has imageOperations array (per-image model assignments from Phase 14).

**Example:**
```typescript
// components/job/per-image-assignments.tsx
interface PerImageAssignmentsProps {
  folderPath: string;
  imageOperations: ImageOperation[];
  isEditable: boolean;
  onChange?: (updated: ImageOperation[]) => void;
}

export function PerImageAssignments({
  folderPath,
  imageOperations,
  isEditable,
  onChange
}: PerImageAssignmentsProps) {
  if (!imageOperations || imageOperations.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">Per-Image Assignments</h4>
      {imageOperations.map((op, idx) => (
        <div key={idx} className="flex items-center gap-2 p-2 bg-muted rounded">
          <span className="text-sm">{op.fileName}</span>
          {isEditable ? (
            <Select
              value={op.model}
              onValueChange={(model) => {
                const updated = [...imageOperations];
                updated[idx] = { ...op, model };
                onChange?.(updated);
              }}
            >
              {/* Model options */}
            </Select>
          ) : (
            <Badge variant="secondary">{op.model}</Badge>
          )}
          {/* Display model-specific params (resolution/quality) */}
        </div>
      ))}
    </div>
  );
}
```

### Pattern 3: View/Edit Mode Toggle
**What:** Toggle between read-only summary view and editable correction mode.

**When to use:** Confirmation page where users can approve summary OR make corrections.

**Example:**
```typescript
// app/(protected)/job/confirm/page.tsx
export default function ConfirmPage() {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const { parsedJob, setParsedJob } = useJobContext();

  return (
    <div>
      {/* Mode toggle */}
      <div className="flex gap-2">
        <Button
          variant={mode === 'view' ? 'default' : 'outline'}
          onClick={() => setMode('view')}
        >
          <Eye className="w-4 h-4 mr-2" />
          View Summary
        </Button>
        <Button
          variant={mode === 'edit' ? 'default' : 'outline'}
          onClick={() => setMode('edit')}
        >
          <Edit className="w-4 h-4 mr-2" />
          Edit Assignments
        </Button>
      </div>

      {/* Conditional rendering based on mode */}
      {mode === 'view' ? (
        <InterpretationSummary job={parsedJob.job} />
      ) : (
        <EditableAssignments job={parsedJob.job} onChange={setParsedJob} />
      )}

      {/* Actions */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={() => router.push('/job/review')}>
          Edit Prompt
        </Button>
        <Button onClick={() => router.push('/job/cost')}>
          <Check className="w-4 h-4 mr-2" />
          Approve & Continue
        </Button>
      </div>
    </div>
  );
}
```

### Anti-Patterns to Avoid

- **Forcing navigation backward:** Don't require users to go back to review page to edit. Allow inline corrections (see Pattern 2).
- **Modal dialogs for confirmation:** Use a dedicated page route, not a modal. Multi-step flows benefit from URL state and browser navigation.
- **Hiding generation counts:** Users need to see EXACTLY how many images will be generated before approving. Make this prominent.
- **Editing without context:** When in edit mode, still show the interpretation text so users understand what AI thought.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Generation count calculation | Custom logic in component | calculateGenerationCount() from Phase 14 | Already handles generationCount, imageOperations, and excludedFiles priority logic |
| Model-specific parameter display | Hardcoded conditionals | Discriminated union type guards | TypeScript narrows types automatically |
| Inline editing state | Manual useState for each field | Job context updater pattern | Follows existing pattern in review page |
| Badge color coding | Custom CSS classes | Badge variant prop | Existing shadcn/ui variants (default, secondary, outline, destructive) |

**Key insight:** Phase 14 delivered the generation count calculation logic. Phase 15's UI displays that logic's results — don't recalculate, just present.

## Common Pitfalls

### Pitfall 1: Synchronization Between Summary and Edits
**What goes wrong:** User edits an assignment in edit mode, but summary card doesn't update immediately.

**Why it happens:** State updates not propagated to all components.

**How to avoid:** Use job context as single source of truth. All edits update context, all displays read from context.

**Warning signs:** Summary shows different count than editor displays. User has to refresh to see changes.

**Prevention:**
```typescript
// BAD: Local state diverges from context
const [localJob, setLocalJob] = useState(parsedJob);

// GOOD: Single source of truth
const { parsedJob, updateParsedJob } = useJobContext();
const handleChange = (updated) => {
  updateParsedJob((current) => ({ ...current, job: updated }));
};
```

### Pitfall 2: Not Showing What Changed
**What goes wrong:** User makes edits but can't tell what they changed from original.

**Why it happens:** No visual indication of edited fields.

**How to avoid:** Store original parsed job on mount, compare current to original, highlight differences.

**Warning signs:** User asks "did I already change this?" or makes duplicate edits.

**Prevention:**
```typescript
const [originalJob] = useState(parsedJob); // Capture on mount
const hasChanges = JSON.stringify(parsedJob) !== JSON.stringify(originalJob);

// Show indicator
{hasChanges && (
  <Badge variant="secondary">Modified</Badge>
)}
```

### Pitfall 3: Confusing Per-Image Operations with Exclusions
**What goes wrong:** Showing both imageOperations and excludedFiles in UI when they're mutually exclusive.

**Why it happens:** Schema allows both, but logic uses only one (Phase 14 schema comment: "Mutually exclusive with excludedFiles").

**How to avoid:** If folder.imageOperations exists, don't show excludedFiles UI. Display exclusions only for folders without per-image operations.

**Warning signs:** UI shows "3 excluded files" but also "4 per-image assignments" when only 4 files exist.

**Prevention:**
```typescript
// Display logic
{folder.imageOperations?.length > 0 ? (
  <PerImageAssignments operations={folder.imageOperations} />
) : (
  <ExcludedFilesList files={folder.excludedFiles} />
)}
```

### Pitfall 4: Hiding AI Interpretation in Edit Mode
**What goes wrong:** User switches to edit mode, interpretation text disappears, user forgets what AI understood.

**Why it happens:** Designer thinks edit mode = hide read-only content.

**How to avoid:** Keep interpretation.text visible in both modes. It provides context for why AI made certain assignments.

**Warning signs:** User switches to edit, makes changes, then switches back to view to re-read interpretation.

**Prevention:**
```typescript
// Always show interpretation
{parsedJob.interpretation && (
  <div className="p-3 bg-muted rounded-lg sticky top-0">
    <p className="text-sm text-muted-foreground">{parsedJob.interpretation}</p>
  </div>
)}

{/* Then show view or edit content below */}
```

## Code Examples

Verified patterns from the codebase:

### Using Job Context
```typescript
// Source: app/(protected)/job/review/page.tsx
import { useJobContext } from '@/lib/session/job-context';

export default function ConfirmPage() {
  const { parsedJob, setParsedJob } = useJobContext();

  const handleUpdate = (updated: ParsedJob) => {
    setParsedJob(updated);
  };
}
```

### Calculating Total Generations
```typescript
// Source: lib/job/generation-count.ts
import { calculateGenerationCount } from '@/lib/job/generation-count';

const totalGenerations = parsedJob.job.folders.reduce((sum, folder) => {
  const count = calculateGenerationCount(
    folder,
    fileCountByFolder[folder.folderPath] || 0
  );
  return sum + count;
}, 0);
```

### Card-Based Layout Pattern
```typescript
// Source: components/job/parsed-job-review.tsx
<Card>
  <CardHeader>
    <CardTitle>Folder Operations ({job.folders.length})</CardTitle>
  </CardHeader>
  <CardContent>
    {job.folders.map((folder, idx) => (
      <FolderCard key={idx} folder={folder} />
    ))}
  </CardContent>
</Card>
```

### Badge Variants for Status
```typescript
// Source: components/job/parsed-job-review.tsx
<Badge variant="secondary">{operation.resolution}</Badge>
<Badge variant="outline">{operation.aspectRatio}</Badge>
<Badge variant={operation.photoMode === 'reference' ? 'default' : 'secondary'}>
  {operation.photoMode}
</Badge>
```

### Navigation Between Steps
```typescript
// Source: app/(protected)/job/cost/page.tsx
import { useRouter } from 'next/navigation';

const router = useRouter();

// Back to previous step
<Button variant="outline" onClick={() => router.push('/job/review')}>
  Back to Review
</Button>

// Forward to next step
<Button onClick={() => router.push('/job/cost')}>
  Continue to Cost
</Button>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Modal confirmation dialogs | Dedicated confirmation pages | React Router v6+, Next.js App Router | Better URL state, browser history, mobile UX |
| All fields editable | Summary view + edit mode toggle | Modern form UX (2024+) | Less overwhelming, clearer intent |
| Text-based summaries | Visual breakdown with counts | Data-heavy UX patterns (2025+) | Faster scanning, easier verification |
| Post-submit reviews | Pre-submit confirmation | AI/agent UX patterns (2026) | Catch errors before execution |

**Deprecated/outdated:**
- **Confirmation modals:** Replaced by dedicated pages in multi-step flows (better mobile UX, URL state)
- **"Are you sure?" yes/no prompts:** Replaced by summary + approve pattern (shows WHAT user is approving)
- **Forcing backward navigation:** Replaced by inline editing (68% of sites still do this wrong per Baymard research)

**2026 AI-specific pattern:**
The Review Paradox (NN/g State of UX 2026): Designing the "Audit Interface" is the new UX challenge. For AI interpretation confirmations, this means summarizing complex parsing logic into a glanceable confidence check. This phase implements that pattern: AI's multi-step interpretation (folders, models, exclusions, per-image ops) summarized into a single scannable summary + inline corrections.

## Open Questions

Things that couldn't be fully resolved:

1. **How to display imageOperations in summary view?**
   - What we know: Schema exists (Phase 14), calculation logic exists (calculateGenerationCount)
   - What's unclear: Best UX for showing "file1.jpg → nano-banana, file2.jpg → seedream" in compact summary
   - Recommendation: Start with table layout in edit mode, compact badge list in view mode. User testing will reveal preference.

2. **Should confirmation auto-calculate cost preview?**
   - What we know: Cost calculation exists (lib/job/cost-estimation.ts), next page is dedicated cost page
   - What's unclear: Does showing approximate cost on confirmation page reduce abandonment or create confusion?
   - Recommendation: Show generation count only on confirmation. Dedicated cost page shows full breakdown. Follows multi-step progressive disclosure pattern.

3. **How to handle very large folders (100+ images with per-image ops)?**
   - What we know: imageOperations is an array, could be 100+ items
   - What's unclear: UX for displaying 100 image assignments without overwhelming
   - Recommendation: Use virtualized list (@tanstack/react-virtual already installed) if >20 assignments, collapsed accordion otherwise.

## Sources

### Primary (HIGH confidence)
- Phase 14 implementation: lib/ai/schemas/job.ts, lib/job/generation-count.ts, lib/types/job.ts
- Existing patterns: app/(protected)/job/review/page.tsx, components/job/parsed-job-review.tsx
- shadcn/ui documentation: https://ui.shadcn.com/docs/components/form (React Hook Form + Zod patterns)

### Secondary (MEDIUM confidence)
- [Multi-step form UX patterns](https://www.smashingmagazine.com/2024/12/creating-effective-multistep-form-better-user-experience/) - Smashing Magazine 2024
- [Review step design patterns](https://baymard.com/checkout-usability/benchmark/step-type/order-review) - Baymard Institute (714 examples showing 68% send users backward incorrectly)
- [State of UX 2026](https://www.nngroup.com/articles/state-of-ux-2026/) - NN/g on AI Review Paradox and Audit Interface design
- [Inline editing patterns](https://www.emgoto.com/react-inline-edit/) - React inline edit component patterns

### Tertiary (LOW confidence)
- [React confirmation dialogs](https://www.dhiwise.com/post/how-react-confirmation-dialogs-enhance-user-experience-in-apps) - General patterns, not specific to multi-step forms
- [Stepper UI examples](https://www.eleken.co/blog-posts/stepper-ui-examples) - Progress indicator patterns, not confirmation-specific

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All dependencies already installed, no new libraries needed
- Architecture: HIGH - Follows existing app/(protected)/job/* page structure
- Patterns: HIGH - View/edit toggle exists in review page, can replicate
- Code examples: HIGH - All extracted from current codebase
- Pitfalls: MEDIUM - Based on research + Baymard data, but not validated in this specific codebase

**Research date:** 2026-01-30
**Valid until:** 2026-03-01 (30 days - UI patterns stable, Next.js 16 unlikely to change App Router fundamentals)
