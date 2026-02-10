# Feature Landscape: Multi-Model Support & Per-Folder Prompts

**Domain:** Bulk AI Image Generation Tools
**Researched:** 2026-01-26
**Confidence:** MEDIUM (WebSearch verified with multiple sources, some patterns inferred from general UX trends)

## Context

This research focuses on **NEW v2.0 features** being added to an existing bulk image generation app:
1. Multi-model switching (Nano Banana Pro ↔ Seedream 4.5 Edit)
2. Per-folder prompt configuration
3. Delete individual results from batches

**Existing v1.0 features (already built):**
- Folder upload with structure preservation (500+ images)
- AI prompt parsing with clarifying questions
- 20-concurrent queue management
- Real-time progress tracking
- Resilient retry (never skips)
- Streaming ZIP downloads
- Job history browsing
- PNG/JPEG format selection

## Table Stakes

Features users expect when adding these capabilities. Missing = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Model selector visible on main screen** | Industry standard (Freepik, Renderforest, BestPhotoAI all show model toggle prominently) | Low | Radio buttons or dropdown at top of config form |
| **UI updates when model changes** | Different models have different capabilities (8 vs 14 refs, different aspect ratios) | Medium | Conditional form fields, validation updates |
| **Visual indication of model differences** | Users need to understand why they'd choose one over another | Low | Tooltip or help text explaining model capabilities |
| **Prompt validation per model** | Models have different constraints (aspect ratios, quality settings) | Medium | Form validation updates dynamically based on selected model |
| **Per-folder prompt as alternative to global** | Batch processing tools (Stable Diffusion WebUI, ComfyUI) offer folder-level control | Medium | Either global OR per-folder, not both simultaneously |
| **Clear indicator which prompt mode is active** | Users must understand whether they're using global or per-folder prompts | Low | Visual toggle or tabs |
| **Delete button on individual results** | ChatGPT, gallery tools all have per-item deletion | Low | Single-click delete with confirmation |
| **Batch selection for deletion** | Users expect to select multiple and delete at once | Medium | Checkbox selection + bulk action |
| **Immediate visual feedback on delete** | Result should disappear from UI instantly | Low | Optimistic UI update |

## Differentiators

Features that set product apart. Not expected, but highly valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **AI prompt adaptation per model** | Auto-adjust AI parsing based on selected model's capabilities | High | Claude could rewrite prompts to match model constraints |
| **Model comparison mode** | Generate same image with both models side-by-side | Medium | Queue same task twice with different models |
| **Per-folder model selection** | Different folders use different models in same job | High | Extends per-folder prompts to include model choice |
| **Smart model recommendation** | AI suggests best model based on prompt content | Medium | "This prompt needs 12 refs → use Seedream" |
| **Cost comparison before execution** | Show estimated cost difference between models | Low | Extend existing cost estimation to compare models |
| **Undo delete** | Restore deleted results from trash | Medium | Soft delete with restoration period |
| **Folder-level result filtering** | View results by source folder | Low | Filter UI on results page |
| **Preview prompt before global→per-folder conversion** | Show what per-folder prompts would look like before committing | Medium | Clarifying question workflow extension |

## Anti-Features

Features to explicitly NOT build. Common mistakes in this domain.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Model auto-switching mid-job** | Creates unpredictable results, users lose control | Lock model choice at job creation time |
| **Global AND per-folder prompts simultaneously** | Confusing merge semantics, unclear precedence | Force exclusive choice: global OR per-folder |
| **Model-specific UI completely separate** | Duplicates code, creates inconsistent UX | Shared UI with conditional fields based on model |
| **Delete without confirmation on large batches** | Accidental deletion too easy | Always confirm bulk deletion (>5 items) |
| **Permanent immediate deletion** | No recovery from mistakes | Soft delete or "Deleted" folder with 30-day retention |
| **Per-image prompts** | Too granular for bulk tool, defeats automation purpose | Stop at folder-level, not individual images |
| **Model mixing within single generation** | APIs don't support this, technically infeasible | One model per generation task |

## Feature Dependencies

```
Multi-Model Switching:
  ├─ Model Selector (required first)
  ├─ Dynamic UI Updates (depends on Model Selector)
  ├─ Prompt Validation (depends on Dynamic UI)
  └─ Cost Estimation Updates (depends on Model Selector)

Per-Folder Prompts:
  ├─ Global/Folder Mode Toggle (required first)
  ├─ Folder List with Prompt Fields (depends on Toggle)
  ├─ AI Parsing for Multiple Prompts (depends on Folder List)
  └─ Pre-Execution Summary Update (depends on AI Parsing)

Delete Individual Results:
  ├─ Delete Button UI (required first)
  ├─ Batch Selection (parallel to Delete Button)
  ├─ Soft Delete Storage (required for Undo)
  └─ Undo Feature (depends on Soft Delete)

Cross-Feature Dependencies:
  Per-Folder Model Selection → requires both Multi-Model + Per-Folder features
  Model Comparison Mode → requires Multi-Model + Job Execution updates
```

## Existing v1.0 Integration Points

New features must integrate with existing v1.0 systems:

| v1.0 System | Integration Required | Complexity |
|-------------|---------------------|------------|
| **AI Prompt Parser** | Must handle per-folder prompts as array instead of single string | Medium |
| **Cost Estimation** | Must calculate based on selected model's pricing | Low |
| **Queue Manager** | No changes needed (model ID just part of task data) | None |
| **Job State** | Must store model choice and prompt mode (global vs folder) | Low |
| **Results Storage** | Must support soft delete flag and deletion timestamp | Low |
| **Download System** | Should respect deleted results (don't include in ZIP) | Low |
| **Job History** | Should show which model was used per job | Low |

## UX Patterns from Research

### Multi-Model Switching Patterns (2026)

**Pattern A: Unified Platform with Model Dropdown**
- Source: [Freepik AI Image Generator](https://www.bentoml.com/blog/a-guide-to-open-source-image-generation-models)
- Choose from multiple models (Nano Banana Pro, Flux, Seedream, etc.) in single dropdown
- Form fields update based on model capabilities
- Common in production tools (Artlist, Renderforest)

**Pattern B: Model Comparison Interface**
- Source: [T3 Chat multi-model comparison](https://medium.com/@future_agi/10-prompt-management-platforms-for-ai-applications-787cc34ee420)
- Side-by-side results from different models
- Switch models mid-conversation or branch for comparison
- More common in chat interfaces than image tools

**Pattern C: Workflow-Based Model Loading**
- Source: [ComfyUI batch processing](https://apatero.com/blog/automate-images-videos-comfyui-workflow-guide-2025)
- Dynamic model loading based on prompt analysis
- Switch nodes cycle through different models
- Complex workflow tools, high overhead

**Recommendation for BulkImageGen:** Pattern A (Unified Platform)
- Simple dropdown or radio buttons at top of job creation form
- Form validates and shows/hides fields based on selected model
- Lock choice at job creation (no mid-job switching)

### Per-Folder Prompt Patterns

**Pattern A: Folder-Level Configuration UI**
- Source: [Juma Prompt Builder with folders](https://juma.ai/blog/ai-prompt-generators)
- Folders organize prompts by project/topic
- Each folder has associated prompt
- Common in prompt management tools (PromptHub, PromptLayer)

**Pattern B: Batch Processing with Input/Output Folders**
- Source: [Stable Diffusion WebUI Extras tab](https://stable-diffusion-art.com/automatic1111/)
- Specify input folder and output folder on server
- Single prompt applied to all images in folder
- Limited to one prompt type per batch

**Pattern C: Permutation-Based Batch Generation**
- Source: [Midjourney permutations](https://weirdwonderfulai.art/resources/create-multiple-prompts-in-midjourney-permutations/)
- Curly braces `{}` with comma-separated options
- Generates multiple variations from template
- Limited to 40 jobs, 16 concurrent

**Recommendation for BulkImageGen:** Pattern A (Folder-Level Configuration)
- Toggle at top: "Global Prompt" vs "Per-Folder Prompts"
- When per-folder selected, show list of uploaded folders with prompt field for each
- AI parses each folder prompt separately
- Pre-execution summary shows breakdown per folder

### Delete Individual Results Patterns

**Pattern A: Gallery View with Delete Buttons**
- Source: [WordPress media gallery bulk actions](https://www.infophilic.com/delete-multiple-images-wordpress-media-gallery/)
- Checkbox on each item for selection
- "Delete Selected" bulk action button
- Confirmation modal for bulk operations

**Pattern B: Conversation-Level Deletion**
- Source: [ChatGPT image library deletion](https://community.openai.com/t/add-a-delete-button-to-the-image-library-in-chatgpt/1234507)
- Cannot delete individual images, only entire conversations
- User-requested feature, not yet implemented
- Anti-pattern: too coarse-grained

**Pattern C: Soft Delete with Trash Folder**
- Source: [Google Photos deletion patterns](https://support.google.com/photos/thread/11921610/how-to-bulk-delete-a-bunch-of-photos)
- Deleted items move to trash
- 30-day retention before permanent deletion
- Undo available during retention period

**Recommendation for BulkImageGen:** Pattern A + Pattern C (Gallery with Soft Delete)
- Checkbox selection on results page
- Individual delete button (X or trash icon)
- Bulk delete for multiple selections
- Soft delete: move to "Deleted" state, exclude from downloads
- Optional: Trash view with undo (30-day retention)

## Adaptive UI Patterns (2026 Trend)

**Dynamic Form Validation:**
- Source: [AI-powered adaptive interfaces](https://bitskingdom.com/blog/ux-trends-2026-ai-zero-ui-adaptive-design/)
- Forms show/hide fields based on previous answers
- Real-time validation updates based on context
- Becoming standard in 2026 AI tools

**Model-Specific Field Adaptation:**
When Nano Banana Pro selected:
- Aspect ratio: Show 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9, auto
- Quality: Show 1K, 2K, 4K options
- Max references: Validate ≤8 images

When Seedream 4.5 Edit selected:
- Aspect ratio: Show 1:1, 4:3, 3:4, 16:9, 9:16, 2:3, 3:2, 21:9
- Quality: Show basic (2K), high (4K) options
- Max references: Validate ≤14 images

## MVP Recommendation (v2.0)

Prioritize these features for v2.0 initial release:

1. **Multi-Model Switching (Core)**
   - Model selector (radio or dropdown)
   - Dynamic aspect ratio/quality field updates
   - Cost estimation per model
   - Job history shows model used

2. **Per-Folder Prompts (Core)**
   - Global/Per-Folder mode toggle
   - Folder list with prompt fields (when per-folder selected)
   - AI parsing handles array of folder prompts
   - Pre-execution summary shows per-folder breakdown

3. **Delete Individual Results (Core)**
   - Checkbox selection on results
   - Delete button per result
   - Bulk delete action
   - Immediate UI removal (optimistic update)

Defer to post-v2.0:

- **Model Comparison Mode**: Valuable but complex, requires dual job execution
- **Per-Folder Model Selection**: Requires both base features stable first
- **Smart Model Recommendation**: Nice-to-have AI enhancement
- **Undo Delete**: Soft delete foundation can be added, but undo UI deferred
- **AI Prompt Adaptation**: Advanced feature, requires model-specific prompt engineering

## Confidence Assessment

| Area | Confidence | Reasoning |
|------|-----------|-----------|
| Multi-Model UI Patterns | MEDIUM | Freepik, Renderforest, BestPhotoAI examples verified via WebSearch. Common pattern across 2026 tools. |
| Per-Folder Prompts | MEDIUM | ComfyUI, Stable Diffusion WebUI, Juma patterns verified. Folder-level config is standard. |
| Delete Patterns | HIGH | WordPress, gallery tools widely documented. Pattern is universal across media management. |
| Adaptive UI Trends | MEDIUM | 2026 UX trends verified via multiple sources. Dynamic forms becoming standard. |
| Model-Specific Constraints | HIGH | User provided exact model specs (8 vs 14 refs, aspect ratios, quality options) in project context. |

## Sources

### Multi-Model Switching
- [The Best Open-Source Image Generation Models in 2026](https://www.bentoml.com/blog/a-guide-to-open-source-image-generation-models)
- [Best AI Image Generators in 2026: Models, Tools & Use-Case](https://www.template.net/business/best-ai-image-generators-in-2026/)
- [Best AI Image Generators in 2026: Complete Comparison Guide](https://wavespeed.ai/blog/posts/best-ai-image-generators-2026/)
- [9 Top All-in-One AI Platforms for Multiple AI Models (2026)](https://peerlist.io/vinishbhaskar/articles/top-all-in-one-ai-platforms)

### Batch Processing & Per-Folder Prompts
- [ComfyUI Automation Guide 2025 - Batch Images & Videos Workflows](https://apatero.com/blog/automate-images-videos-comfyui-workflow-guide-2025)
- [Batch Process 1000+ Images ComfyUI Guide 2025](https://apatero.com/blog/batch-process-1000-images-comfyui-guide-2025)
- [Stable Diffusion Web UI: Your Ultimate Guide](https://www.cubix.co/blog/stable-diffusion-web-ui/)
- [Midjourney Batch Image Generation Tool](https://www.midjourneybot.com/doc/110-midjourney-batch-image-generation.html)
- [Juma (Team-GPT) Prompt Builder with folders](https://juma.ai/blog/ai-prompt-generators)
- [10 Prompt Management Platforms for AI Applications](https://medium.com/@future_agi/10-prompt-management-platforms-for-ai-applications-787cc34ee420)

### Delete Patterns & Gallery Management
- [How to Delete Multiple Images in WordPress Media Gallery](https://www.infophilic.com/delete-multiple-images-wordpress-media-gallery/)
- [Add a "Delete" Button to the Image Library in ChatGPT](https://community.openai.com/t/add-a-delete-button-to-the-image-library-in-chatgpt/1234507)
- [How to bulk delete a bunch of photos? - Google Photos Community](https://support.google.com/photos/thread/11921610/how-to-bulk-delete-a-bunch-of-photos?hl=en)
- [ComfyUI: Isolating An Image From a Batch](https://medium.com/@yushantripleseven/comfyui-isolating-an-image-from-a-batch-7062f275c113)

### Adaptive UI & 2026 Trends
- [UX Trends 2026: AI, Zero UI, and the Future of Adaptive Design](https://bitskingdom.com/blog/ux-trends-2026-ai-zero-ui-adaptive-design/)
- [6 Best AI Tools for UI Design That Actually Work in 2026](https://emergent.sh/learn/best-ai-tools-for-ui-design)
- [The Complete Guide to Generative UI Frameworks in 2026](https://medium.com/@akshaychame2/the-complete-guide-to-generative-ui-frameworks-in-2026-fde71c4fa8cc)
- [Prompt Augmentation: UX Design Patterns for Better AI Prompting](https://www.uxtigers.com/post/prompt-augmentation)

---
*Research completed: 2026-01-26*
*Focus: v2.0 feature additions to existing bulk image generation app*
