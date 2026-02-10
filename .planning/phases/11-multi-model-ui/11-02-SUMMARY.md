---
phase: 11
plan: 02
subsystem: ui-job-configuration
tags: [react, context, tabs, forms, multi-model]
requires: [lib/session/job-context.tsx, components/ui/tabs.tsx, components/ui/card.tsx]
provides:
  - PromptModeSelector component with mode toggle
  - PerFolderPrompts component with dynamic folder inputs
  - Global and per-folder prompt UI switching
affects: [app/(protected)/job/new, components/job/job-configurator]
key-files:
  created:
    - components/job/prompt-mode-selector.tsx
    - components/job/per-folder-prompts.tsx
  modified: []
decisions:
  - id: tabs-over-radio
    desc: Use shadcn/ui Tabs for mode toggle instead of radio buttons
    rationale: Better UX, clear visual separation between modes
  - id: reconcile-from-context-folders
    desc: Always iterate over context.folders, not parsedJob.job.folders
    rationale: context.folders is source of truth for uploaded folders
  - id: empty-textarea-placeholder
    desc: Show empty textarea for folders not in parsedJob instead of hiding
    rationale: User can immediately start typing, avoids confusion
  - id: copy-global-on-switch
    desc: Copy global prompt to folders when switching to per-folder mode
    rationale: Gives users a starting point instead of blank inputs
  - id: preserve-folder-operations
    desc: Keep folder operations when switching back to global mode
    rationale: User might toggle modes while exploring options
  - id: model-specific-defaults-on-add
    desc: New folder entries inherit model defaults from job.model
    rationale: Ensures correct resolution/quality/imageSize fields for model type
tech-stack:
  added: []
  patterns: [controlled-inputs, auto-resize-textarea, context-reconciliation]
metrics:
  duration: 3 minutes
  commits: 3
  files_created: 2
  lines_added: 304
completed: 2026-01-27
---

# Phase 11 Plan 02: Prompt Mode Selector & Per-Folder Prompts Summary

**One-liner:** Tabs toggle between global prompt and per-folder prompts with dynamic folder inputs and proper context reconciliation

## What Was Built

Created two reusable components for multi-prompt UI:

**PromptModeSelector:**
- Tabs component with Globe and Folders icons
- Two modes: "Global Prompt" and "Per-Folder Prompts"
- GlobalPromptInput for single shared prompt (auto-resize textarea)
- Updates parsedJob.job.promptMode in JobContext
- Copies global prompt to folders when switching to per-folder mode
- Preserves folder operations when switching back to global

**PerFolderPrompts:**
- Dynamic list of folder prompt cards
- Iterates over context.folders (source of truth for uploads)
- Each folder shows Textarea with existing operation or empty placeholder
- Handles reconciliation between uploaded folders and parsedJob entries
- Adds new folder entries with model-specific defaults when editing
- Validation warnings for empty folder prompts
- Badge showing file count per folder

## Key Design Decisions

**Reconciliation Strategy:**
- context.folders is the authoritative list (what's actually uploaded)
- parsedJob.job.folders may lag behind or be incomplete
- For each uploaded folder:
  - If match found in parsedJob → use that operation
  - If no match found → show empty textarea with placeholder
  - On first edit of unmatched folder → addNewFolder creates entry

**Mode Switching Behavior:**
- Global → Per-folder: Copy global prompt to all folders as starting point
- Per-folder → Global: Keep folder operations (user might switch back)
- This allows users to explore both modes without losing work

**Model-Specific Defaults:**
When adding new folder entry:
- Inherit job.model from parsedJob
- Nano Banana: Add resolution='2K'
- Seedream: Add quality='basic', imageSize='landscape_16_9'
- Ensures discriminated union validation passes

## Technical Implementation

**PromptModeSelector Structure:**
```tsx
<Tabs value={currentMode} onValueChange={handleModeChange}>
  <TabsList>
    <TabsTrigger value="global">Global Prompt</TabsTrigger>
    <TabsTrigger value="per-folder">Per-Folder Prompts</TabsTrigger>
  </TabsList>
  <TabsContent value="global">
    <GlobalPromptInput />
  </TabsContent>
  <TabsContent value="per-folder">
    <PerFolderPrompts />
  </TabsContent>
</Tabs>
```

**PerFolderPrompts Reconciliation:**
```tsx
{folders.map((folderPath) => {
  const parsedFolder = parsedJob?.job?.folders?.find(f => f.folderPath === folderPath);
  const currentPrompt = parsedFolder?.operation ?? '';
  // Empty string for unmatched folders → controlled input
})}
```

**Auto-Resize Pattern:**
Both components use same pattern as prompt-input.tsx:
```tsx
useEffect(() => {
  const textarea = textareaRef.current;
  if (textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }
}, [value]);
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript errors in PromptModeSelector**
- Found during: Task 1 verification
- Issue: handleModeChange parameter type incompatible with Tabs onValueChange
- Issue: Accessing prev.job fields directly caused "possibly undefined" errors
- Fix:
  - Changed parameter from typed union to string with type assertion
  - Extracted prev.job.globalPrompt, prev.job.model to local variables
- Files modified: components/job/prompt-mode-selector.tsx
- Commit: 4619ab5

## Integration Points

**JobContext Integration:**
- useJobContext() hook provides folders, fileCountByFolder, parsedJob
- updateParsedJob() updater function for state changes
- folders array is authoritative source for uploaded folders

**Schema Integration:**
- FolderOperation discriminated union validation
- PromptModeSchema ('global' | 'per-folder')
- Model-specific fields (resolution, quality, imageSize)

**UI Components:**
- shadcn/ui Tabs, TabsList, TabsTrigger, TabsContent
- Card, CardHeader, CardTitle, CardDescription, CardContent
- Textarea with controlled input pattern
- Badge for file counts
- Lucide icons: Globe, Folders, Folder

## Files Changed

**Created:**
- `components/job/prompt-mode-selector.tsx` (143 lines)
- `components/job/per-folder-prompts.tsx` (161 lines)

**Modified:**
- None

## Testing Notes

**Manual verification needed:**
1. Toggle between modes preserves data correctly
2. Folders list matches uploaded folders (not parsedJob)
3. Empty folders show placeholder, not crash
4. Adding new folder creates entry with correct model defaults
5. Validation warnings appear for empty prompts
6. Auto-resize works for all textareas

**Edge cases handled:**
- Folder in uploads but not in parsedJob → empty textarea
- Switching modes multiple times → data preserved
- Empty global prompt → no copy to folders
- Model-specific defaults for both Nano Banana and Seedream

## Next Phase Readiness

**Blockers:** None

**Concerns:** None

**Follow-up work:**
- Phase 11-03: Integrate these components into job creation flow
- Wire up to prompt parsing API with multi-prompt support
- Add UI for prompt combination modes (prefix/suffix/only)

**Dependencies for next phase:**
- These components are standalone and ready for integration
- JobContext already updated with required state
- Schemas support prompt modes and per-folder operations

## Performance

- Duration: 3 minutes
- Commits: 3 (2 features + 1 bug fix)
- Files created: 2
- Lines added: 304

## Success Criteria

- [x] PromptModeSelector.tsx exports PromptModeSelector with Tabs toggle
- [x] PerFolderPrompts.tsx exports PerFolderPrompts with dynamic folder inputs
- [x] Both components use JobContext for state management
- [x] Mode toggle updates promptMode field correctly
- [x] Per-folder prompts are editable and sync to folder.operation
- [x] Folders not yet in parsedJob display empty textarea with placeholder (not crash)
- [x] TypeScript compiles without errors
