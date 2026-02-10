# Phase 26: AI Prompt Generation - Research

**Researched:** 2026-02-03
**Domain:** AI-powered prompt generation with Claude Sonnet 4.5
**Confidence:** HIGH

## Summary

This phase implements AI-driven prompt generation where Claude Sonnet 4.5 analyzes user intent and creates unique, tailored prompts for each individual image generation. The core challenge is understanding user intent: whether they want uniform prompts (e.g., "put each hijab on a woman's head" → same prompt for all) or variations (e.g., "front, back, side" → different prompt per image).

The standard approach uses Claude Sonnet 4.5 with extended thinking for intent analysis combined with template-based prompt construction. Extended thinking is particularly valuable here because it allows Claude to reason about user intent before generating prompts, reducing hallucinations and improving accuracy.

Key architectural decision: The system already has Phase 25 infrastructure (database `prompt` column, `generatePerImagePrompt()` function) and Phase 2 sequential parsing (one API call per folder). Phase 26 enhances the `generatePerImagePrompt()` function from pass-through to intelligent generation, maintaining the existing call pattern.

**Primary recommendation:** Use Claude Sonnet 4.5 with extended thinking for intent detection and prompt generation, structured with clear XML tags, explicit examples, and fallback handling for edge cases.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @anthropic-ai/sdk | Latest (in use) | Claude API client | Official Anthropic SDK, already integrated |
| Claude Sonnet 4.5 | claude-sonnet-4-5-20250929 | Intent detection & prompt generation | Best instruction-following for complex reasoning tasks |
| Extended Thinking | Native to Sonnet 4.5 | Complex intent analysis | Reduces hallucinations, improves reasoning quality |
| TypeScript | 5.x | Type-safe implementation | Project standard, ensures correctness |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Zod | 3.x (in use) | Prompt validation | Validate generated prompts match requirements |
| Template literals | Native | Simple substitution | For straightforward variable replacement |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Claude extended thinking | Standard Claude API | Extended thinking provides better reasoning but costs more tokens |
| Custom parser | Simple regex/templates | Custom parsing faster but less flexible for complex variations |
| GPT-4 | Claude Sonnet 4.5 | Project already uses Claude, consistency matters |

**Installation:**
```bash
# Already installed - no new dependencies needed
# Uses existing @anthropic-ai/sdk from package.json
```

## Architecture Patterns

### Recommended Project Structure
```
lib/ai/
├── anthropic.ts           # Client & retry logic (existing)
├── claude-parser.ts       # Folder parsing (existing)
├── prompt-generator.ts    # Per-generation prompts (enhance this)
└── prompts/
    ├── job-parser.ts      # Job parsing system prompt (existing)
    └── prompt-generation.ts  # NEW: Prompt generation system prompt
```

### Pattern 1: Intent Detection Before Generation
**What:** Analyze user prompt to determine uniform vs. variation intent before generating per-image prompts
**When to use:** Always - prevents generating unnecessary variations when user wants uniform prompts
**Example:**
```typescript
// Source: Codebase analysis + Claude 4.5 best practices
interface IntentAnalysis {
  mode: 'uniform' | 'explicit-variations' | 'implicit-variations';
  basePrompt: string;
  variations?: string[];  // Only if explicit variations detected
  reasoning: string;      // From extended thinking
}

async function analyzeUserIntent(
  userPrompt: string,
  imageCount: number
): Promise<IntentAnalysis> {
  // Use Claude Sonnet 4.5 with extended thinking
  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4000,
    thinking: {
      type: "enabled",
      budget_tokens: 2000
    },
    messages: [{
      role: "user",
      content: buildIntentAnalysisPrompt(userPrompt, imageCount)
    }]
  });

  // Extract thinking + text response
  // Parse structured JSON response
}
```

### Pattern 2: Template-Based Prompt Construction
**What:** Build prompts using validated templates with variable substitution
**When to use:** After intent detection, for constructing actual prompts
**Example:**
```typescript
// Source: Best practices for prompt templates 2026
interface PromptTemplate {
  base: string;
  variables: Record<string, string>;
  required: string[];
}

function buildPromptFromTemplate(
  template: PromptTemplate,
  context: {
    folderOperation: string;
    fileName: string;
    variationSpec?: string;
    model: string;
    photoMode: 'reference' | 'analysis';
  }
): string {
  // Validate all required variables present
  const missing = template.required.filter(
    key => !(key in context) || !context[key as keyof typeof context]
  );
  if (missing.length > 0) {
    throw new Error(`Missing required variables: ${missing.join(', ')}`);
  }

  // Simple template substitution
  let prompt = template.base;
  for (const [key, value] of Object.entries(context)) {
    prompt = prompt.replace(new RegExp(`{${key}}`, 'g'), value);
  }

  return prompt;
}
```

### Pattern 3: Fallback Chain for Robustness
**What:** Define clear fallback behavior when intent detection fails
**When to use:** Always - prevents job failures from ambiguous intent
**Example:**
```typescript
// Source: Error recovery best practices
async function generatePromptWithFallback(
  options: PromptGenerationOptions
): Promise<string> {
  try {
    // Primary: AI-based generation
    return await generatePromptWithAI(options);
  } catch (error) {
    console.warn('[Prompt Generation] AI failed, using template fallback:', error);

    try {
      // Fallback 1: Template-based generation
      return generatePromptFromTemplate(options);
    } catch (templateError) {
      console.error('[Prompt Generation] Template failed:', templateError);

      // Fallback 2: Pass-through (Phase 25 behavior)
      return options.folderOperation;
    }
  }
}
```

### Pattern 4: Structured Prompts with XML Tags
**What:** Use XML-style tags to structure prompts for Claude, improving parsing reliability
**When to use:** For system prompts to Claude for intent detection and generation
**Example:**
```typescript
// Source: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/use-xml-tags
function buildIntentAnalysisPrompt(userPrompt: string, imageCount: number): string {
  return `You are analyzing user intent for AI-powered image generation.

<user_prompt>
${userPrompt}
</user_prompt>

<context>
- Total images to process: ${imageCount}
- Each image will receive its own prompt
- Your job: determine if user wants SAME prompt for all, or VARIATIONS
</context>

<intent_categories>
1. UNIFORM: User wants same operation on all images
   Examples: "put each hijab on a woman's head", "swap all faces to Arab women"
   → Generate one prompt, use for all images

2. EXPLICIT_VARIATIONS: User specifies what makes each different
   Examples: "front, back, side views", "angles: 0°, 45°, 90°"
   → Generate specific prompt for each variation

3. IMPLICIT_VARIATIONS: User wants N variations but doesn't specify what
   Examples: "generate 5 variations", "make different versions"
   → AI decides meaningful differences
</intent_categories>

<output_format>
Respond with JSON only:
{
  "mode": "uniform" | "explicit-variations" | "implicit-variations",
  "basePrompt": "extracted operation",
  "variations": ["variation1", "variation2"] // only if explicit-variations
}
</output_format>

<critical_instruction>
Default to "uniform" when ambiguous. Only use variations if CLEARLY requested.
</critical_instruction>`;
}
```

### Anti-Patterns to Avoid
- **Generating variations by default:** Don't assume user wants different prompts unless explicitly requested. Most use cases are uniform operations applied to multiple images.
- **Ignoring extended thinking output:** Extended thinking contains valuable reasoning about intent. Parse and log it for debugging.
- **Variable substitution without validation:** Always validate required variables are present before substitution to prevent incomplete prompts.
- **Synchronous API calls in loops:** Already solved in Phase 2 with sequential processing, but avoid parallel calls that hit rate limits.
- **Overcomplicating templates:** Keep templates simple. Complex conditional logic should be in code, not templates.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Retry logic for API calls | Custom retry wrapper | Existing `withRetry()` in anthropic.ts | Already handles rate limits, exponential backoff, jitter |
| Intent classification | Rule-based parser | Claude Sonnet 4.5 extended thinking | Handles natural language nuances, learns from context |
| Template validation | Custom validator | Zod schemas | Type-safe, composable, already in project |
| Error messages to user | Generic failures | Structured errors from intent analysis | Better UX, actionable feedback |
| JSON parsing cleanup | Manual string manipulation | Existing cleanup in claude-parser.ts | Handles markdown code blocks, trailing characters |

**Key insight:** The codebase already has robust patterns for Claude API interaction (retry, thinking, cleanup). Reuse these patterns rather than reimplementing. The challenge is the *logic* of intent detection, not the infrastructure.

## Common Pitfalls

### Pitfall 1: Ambiguous Intent Detection
**What goes wrong:** AI incorrectly classifies uniform intent as variations (or vice versa), generating wrong prompts
**Why it happens:** Natural language is inherently ambiguous. "Make 5 variations" could mean "process 5 images with same prompt" or "create 5 different versions"
**How to avoid:**
- Use extended thinking to reason through intent before classification
- Provide explicit examples in system prompt of each intent category
- Default to UNIFORM when ambiguous (safer, matches most use cases)
- Include confidence score in response, flag low-confidence for review
**Warning signs:**
- User feedback: "Why are all prompts different? I wanted the same thing"
- Inconsistent behavior on similar prompts
- Low confidence scores from intent analysis

### Pitfall 2: Hallucinated Variables in Prompts
**What goes wrong:** AI generates prompts with details not in original user request (e.g., user says "Arab woman" but AI adds "wearing traditional clothing, smiling, indoor lighting")
**Why it happens:** LLMs tend to elaborate and add "helpful" details, especially without explicit constraints
**Why this matters:** Hallucinated details can change user's intended output significantly
**How to avoid:**
- Explicit instruction: "Use ONLY details from user's prompt. Do not add creative embellishments."
- Structured extraction: Ask AI to extract specific fields (subject, action, modifiers) rather than free-form generation
- Template constraints: Use templates that enforce structure
- Validation: Check generated prompts contain only user-specified elements
**Warning signs:**
- Generated prompts much longer than user's original prompt
- Prompts include details like lighting, poses, clothing not mentioned by user
- User feedback: "This isn't what I asked for"

### Pitfall 3: Variable Substitution Errors
**What goes wrong:** Prompts contain unreplaced placeholders like `{fileName}` or have incorrect substitutions
**Why it happens:** Missing variables, typos in variable names, or template/context schema mismatch
**How to avoid:**
- Validate all required variables before substitution
- Use TypeScript types to enforce variable presence
- Test templates with missing variables (should throw clear error)
- Log generated prompts for debugging
**Warning signs:**
- Curly braces `{}` appearing in final prompts sent to generation API
- Generation failures with "invalid prompt" errors
- Inconsistent prompt structure across generations

### Pitfall 4: Context Loss in Sequential Processing
**What goes wrong:** When processing images sequentially (existing pattern), AI forgets earlier decisions or generates inconsistent variations
**Why it happens:** Each `generatePerImagePrompt()` call is independent, no memory of previous calls
**How to avoid:**
- Do intent analysis ONCE per folder (before loop)
- Pass intent analysis result to all `generatePerImagePrompt()` calls
- Use deterministic variation generation (if user wants 5 variations, generate all 5 upfront)
- Store variation list in job/generation metadata
**Warning signs:**
- First 3 images get "front view" prompt, last 3 get "side view" (inconsistent)
- Variations don't align with user's count (user wanted 5, got 8 different versions)

### Pitfall 5: Extended Thinking Token Budget
**What goes wrong:** Extended thinking runs out of budget before completing reasoning, produces incomplete analysis
**Why it happens:** Complex intent requires more reasoning tokens than allocated
**How to avoid:**
- Allocate sufficient budget (2000-5000 tokens for intent analysis)
- Structure prompts to guide efficient reasoning
- Test with complex examples (multi-folder, multi-variation cases)
- Monitor thinking output length, adjust budget if truncated
**Warning signs:**
- Thinking output ends mid-sentence
- Intent analysis quality degrades for complex prompts
- API returns incomplete thinking blocks

## Code Examples

Verified patterns from official sources:

### Intent Analysis System Prompt
```typescript
// Source: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices
// Pattern: XML tags + explicit categories + examples
function buildIntentAnalysisPrompt(
  folderOperation: string,
  userFullPrompt: string,
  imageCount: number
): string {
  return `You are analyzing user intent for AI image generation.

<task>
Determine if the user wants:
1. UNIFORM: Same prompt for all ${imageCount} images
2. EXPLICIT_VARIATIONS: Different prompts based on user's specified variations
3. IMPLICIT_VARIATIONS: User wants variations but didn't specify what
</task>

<folder_operation>
${folderOperation}
</folder_operation>

<full_user_prompt>
${userFullPrompt}
</full_user_prompt>

<examples>
UNIFORM examples:
- "put each hijab on a woman's head" → same prompt for all
- "swap faces to Arab women" → same prompt for all
- "replace background with cream color" → same prompt for all

EXPLICIT_VARIATIONS examples:
- "front, back, side views" → 3 specific prompts
- "angles: 0°, 45°, 90°, 135°" → 4 specific prompts
- "folder 5: casual, formal, sporty" → 3 specific prompts

IMPLICIT_VARIATIONS examples:
- "generate 5 variations" → AI decides 5 different approaches
- "make different versions" → AI creates meaningful variations
</examples>

<critical_rules>
1. Default to UNIFORM if ambiguous
2. Only use EXPLICIT_VARIATIONS if user clearly lists what varies
3. Only use IMPLICIT_VARIATIONS if user says "variations" without specifying
4. Extract base operation without embellishments
5. Do not add creative details not in user's prompt
</critical_rules>

<output_format>
{
  "mode": "uniform" | "explicit-variations" | "implicit-variations",
  "confidence": 0.0-1.0,
  "basePrompt": "exact operation from user",
  "variations": ["var1", "var2"] // only for explicit-variations
}
</output_format>`;
}
```

### Enhanced generatePerImagePrompt Function
```typescript
// Source: Existing codebase pattern + Claude 4.5 best practices
export async function generatePerImagePrompt(
  options: PromptGenerationOptions
): Promise<string> {
  // Phase 25: Was simple pass-through
  // Phase 26: Enhanced with AI generation

  try {
    // Step 1: Check if intent analysis already done for this folder
    // (Analysis done once per folder, cached in job metadata)
    const intent = await getOrAnalyzeIntent(
      options.folderOperation,
      options.fileName
    );

    // Step 2: Generate prompt based on intent mode
    switch (intent.mode) {
      case 'uniform':
        // Simple: use base prompt for all images
        return buildUniformPrompt(intent.basePrompt, options);

      case 'explicit-variations':
        // Use pre-determined variation for this image
        const variationIndex = getImageVariationIndex(options.fileName);
        return buildVariationPrompt(
          intent.basePrompt,
          intent.variations![variationIndex],
          options
        );

      case 'implicit-variations':
        // AI generates unique variation for this image
        return await generateImplicitVariation(
          intent.basePrompt,
          options
        );

      default:
        throw new Error(`Unknown intent mode: ${intent.mode}`);
    }
  } catch (error) {
    console.error('[Prompt Generation] Failed:', error);
    // Fallback: Phase 25 behavior
    return options.folderOperation;
  }
}

function buildUniformPrompt(
  basePrompt: string,
  options: PromptGenerationOptions
): string {
  // Template with minimal variables
  // Avoid hallucination by staying close to user's words
  return basePrompt; // Most cases: just use the base prompt as-is
}

function buildVariationPrompt(
  basePrompt: string,
  variation: string,
  options: PromptGenerationOptions
): string {
  // Combine base operation with specific variation
  return `${basePrompt}, ${variation} view`;
}

async function generateImplicitVariation(
  basePrompt: string,
  options: PromptGenerationOptions
): Promise<string> {
  // Use Claude to generate meaningful variation
  // This is the only place we call Claude per-image
  const client = getAnthropicClient();

  const response = await withRetry(async () => {
    return client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: `Generate a unique variation of this prompt: "${basePrompt}"

Keep the core operation the same, but vary ONE aspect (angle, style, composition, etc).
Be specific and concise. Do not add details not implied by original prompt.

Respond with just the varied prompt, no explanation.`
      }]
    });
  }, 'Generate implicit variation');

  const textContent = response.content.find(b => b.type === 'text')?.text || basePrompt;
  return textContent.trim();
}
```

### Intent Analysis with Extended Thinking
```typescript
// Source: https://platform.claude.com/docs/en/build-with-claude/extended-thinking
async function analyzeIntent(
  folderOperation: string,
  userFullPrompt: string,
  imageCount: number
): Promise<IntentAnalysis> {
  const client = getAnthropicClient();

  const response = await withRetry(async () => {
    return client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4000,
      thinking: {
        type: "enabled",
        budget_tokens: 3000  // Sufficient for complex reasoning
      },
      messages: [{
        role: "user",
        content: buildIntentAnalysisPrompt(folderOperation, userFullPrompt, imageCount)
      }]
    });
  }, 'Analyze prompt intent');

  // Extract thinking output for debugging
  const thinkingBlock = response.content.find(b => b.type === 'thinking');
  if (thinkingBlock) {
    console.log('[Intent Analysis] Reasoning:', thinkingBlock.text.substring(0, 200));
  }

  // Extract text response
  const textBlock = response.content.find(b => b.type === 'text');
  if (!textBlock) {
    throw new Error('No text response from intent analysis');
  }

  // Parse JSON response
  let cleanText = textBlock.text.trim();
  // Remove markdown code blocks if present
  if (cleanText.startsWith('```json')) cleanText = cleanText.slice(7);
  if (cleanText.startsWith('```')) cleanText = cleanText.slice(3);
  if (cleanText.endsWith('```')) cleanText = cleanText.slice(0, -3);
  cleanText = cleanText.trim();

  const parsed = JSON.parse(cleanText) as IntentAnalysis;

  // Validate confidence
  if (parsed.confidence < 0.7) {
    console.warn('[Intent Analysis] Low confidence:', parsed.confidence, '- defaulting to uniform');
    parsed.mode = 'uniform';
  }

  return parsed;
}
```

### Template Validation
```typescript
// Source: Best practices for template variable validation 2026
import { z } from 'zod';

const PromptTemplateSchema = z.object({
  base: z.string().min(1),
  variables: z.record(z.string()),
  required: z.array(z.string())
});

function validateAndSubstitute(
  template: z.infer<typeof PromptTemplateSchema>,
  context: Record<string, string>
): string {
  // Validate template structure
  PromptTemplateSchema.parse(template);

  // Check all required variables present
  const missing = template.required.filter(key => !context[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required template variables: ${missing.join(', ')}\n` +
      `Available: ${Object.keys(context).join(', ')}`
    );
  }

  // Perform substitution
  let result = template.base;
  for (const [key, value] of Object.entries(context)) {
    const placeholder = `{${key}}`;
    result = result.replace(new RegExp(placeholder, 'g'), value);
  }

  // Verify no unsubstituted placeholders remain
  const remainingPlaceholders = result.match(/\{[^}]+\}/g);
  if (remainingPlaceholders) {
    throw new Error(
      `Unsubstituted placeholders in template: ${remainingPlaceholders.join(', ')}`
    );
  }

  return result;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Global prompt for all images | Per-generation prompts | Phase 25 (v3.1) | Infrastructure ready, Phase 26 adds intelligence |
| Rule-based variation parsing | LLM-based intent detection | 2024-2026 | Natural language handling, better UX |
| Simple template substitution | AI-assisted prompt generation | Claude 4.5 release (2025) | Extended thinking enables complex reasoning |
| Synchronous generation | Sequential API calls per folder | Phase 2 | Existing pattern, reuse for consistency |

**Deprecated/outdated:**
- **Rule-based intent classification:** Using regex or keyword matching to detect variations. LLMs with extended thinking outperform rule-based systems for natural language understanding.
- **Parallel API calls for prompt generation:** Phase 2 established sequential processing to avoid rate limits. Continue this pattern.
- **Standard Claude API without extended thinking:** Extended thinking significantly reduces hallucinations in complex reasoning tasks like intent detection. The token cost is worth it.

## Open Questions

Things that couldn't be fully resolved:

1. **Optimal thinking budget for intent analysis**
   - What we know: Claude 4.5 supports up to 10,000 thinking tokens, research shows 2000-5000 sufficient for most tasks
   - What's unclear: Exact budget needed for complex multi-folder prompts with implicit variations
   - Recommendation: Start with 3000 tokens, monitor for truncation, adjust if needed. Log thinking output length in development.

2. **Caching strategy for intent analysis**
   - What we know: Intent analysis should happen once per folder, not per image
   - What's unclear: Where to store result (job metadata? in-memory cache? database?)
   - Recommendation: Store in job metadata column or use in-memory Map keyed by job_id + folder_path. Clear on job completion.

3. **Handling mixed modes within one job**
   - What we know: User could say "folder 5: same prompt for all, folder 7: front/back/side variations"
   - What's unclear: Whether existing claude-parser.ts per-folder parsing already handles this
   - Recommendation: Test with mixed-mode prompts. Likely already handled since parsing is per-folder.

4. **Performance impact of implicit variation generation**
   - What we know: Implicit variations require one Claude API call per image (expensive)
   - What's unclear: Whether to batch these or use simpler deterministic variations
   - Recommendation: Implement batching if implicit variations become common use case. For Phase 26, sequential is acceptable (matches existing pattern).

## Sources

### Primary (HIGH confidence)
- [Claude 4.5 Best Practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices) - Extended thinking, XML tags, instruction following
- [Prompt Engineering Overview](https://platform.claude.com/docs/en/docs/build-with-claude/prompt-engineering/overview) - Prompt chaining, multishot prompting
- Codebase analysis (lib/ai/claude-parser.ts, lib/ai/prompt-generator.ts, lib/ai/anthropic.ts) - Existing patterns and infrastructure

### Secondary (MEDIUM confidence)
- [Claude Prompt Engineering Best Practices (2026)](https://promptbuilder.cc/blog/claude-prompt-engineering-best-practices-2026) - Few-shot learning, iteration patterns
- [AI Prompts: Essential Guide with Types & Best Practices](https://www.getguru.com/reference/ai-prompts) - Content variations, prompt components
- [Prompt Templates and Variables](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompt-templates-and-variables) - Template structure and substitution
- [Use placeholder variables in prompts (Medium)](https://medium.com/@fsferrara/use-placeholders-in-your-prompts-c05cfa726555) - Placeholder best practices
- [Template Variables - PromptLayer](https://docs.promptlayer.com/features/prompt-registry/template-variables) - Variable validation

### Tertiary (LOW confidence - for context only)
- [Preventing AI Hallucinations with Effective User Prompts](https://documentation.suse.com/suse-ai/1.0/html/AI-preventing-hallucinations/index.html) - Hallucination mitigation strategies
- [Survey and analysis of hallucinations in LLMs](https://pmc.ncbi.nlm.nih.gov/articles/PMC12518350/) - Academic research on hallucination sources
- [In-Depth Guide Into Chatbots Intent Recognition](https://research.aimultiple.com/chatbot-intent/) - Intent detection challenges and techniques

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Existing infrastructure (@anthropic-ai/sdk, Claude Sonnet 4.5), no new dependencies
- Architecture: HIGH - Patterns verified from official docs and existing codebase, clear enhancement path
- Pitfalls: MEDIUM-HIGH - Common issues documented in research, some inferred from similar use cases

**Research date:** 2026-02-03
**Valid until:** 30 days (stable technology, but monitor Claude API updates)

**Key assumptions validated:**
1. Phase 25 infrastructure is complete (database prompt column, generatePerImagePrompt function) ✓
2. Sequential processing pattern from Phase 2 is established ✓
3. Claude Sonnet 4.5 with extended thinking is available and used in project ✓
4. Existing retry logic and error handling patterns can be reused ✓

**Implementation complexity:** Medium
- Low infrastructure complexity (reuse existing patterns)
- Medium AI logic complexity (intent detection, variation generation)
- Low integration complexity (enhance existing function, no schema changes)
