# Phase 21: Claude Sonnet 4.5 Migration - Research

**Researched:** 2026-01-31
**Domain:** AI Provider Migration (Gemini to Claude), Extended Thinking API
**Confidence:** HIGH

## Summary

This phase replaces the current Gemini-based AI parsing with Claude Sonnet 4.5 using extended thinking for thorough analysis of natural language prompts. The project already has the Anthropic SDK installed (`@anthropic-ai/sdk@^0.71.2`) and a basic client setup in `lib/ai/anthropic.ts`. The current model constant is set to `claude-sonnet-4-5-20250929`.

The migration involves creating a new `claude-parser.ts` that mirrors the structure of `gemini-parser.ts` but uses the Claude API with extended thinking enabled. Extended thinking allows Claude to perform step-by-step reasoning before producing the final parsed output, which is ideal for complex prompt parsing scenarios where understanding nuanced folder operations and model-specific settings is critical.

The key API difference is that Claude's Messages API returns content blocks (thinking blocks and text blocks) rather than Gemini's single text response, requiring adjusted response parsing logic.

**Primary recommendation:** Create `lib/ai/claude-parser.ts` using the existing Anthropic client, enable extended thinking with a 10,000 token budget, and structure responses to extract JSON from text content blocks.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @anthropic-ai/sdk | ^0.71.2 | Official Anthropic SDK | Already installed, official TypeScript SDK |
| zod | existing | Schema validation | Already used for job parsing schemas |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| - | - | No additional libraries needed | Anthropic SDK handles all Claude API needs |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Direct API | @anthropic-ai/sdk | SDK provides type safety, error handling, streaming helpers |
| Claude Haiku 4.5 | Sonnet 4.5 | Haiku is faster/cheaper but less capable for complex parsing |

**Installation:**
```bash
# Already installed - no action needed
npm install @anthropic-ai/sdk
```

## Architecture Patterns

### Recommended Project Structure
```
lib/ai/
  anthropic.ts           # Client singleton (EXISTS)
  claude-parser.ts       # NEW: Parser with extended thinking
  gemini.ts              # KEEP for fallback/comparison
  gemini-parser.ts       # KEEP for fallback/comparison
  schemas/
    job.ts               # Shared Zod schemas (EXISTS)
  prompts/
    job-parser.ts        # System prompts (EXISTS)
```

### Pattern 1: Extended Thinking for Complex Parsing
**What:** Use Claude's extended thinking feature to allow the model to reason through complex prompts before producing structured output
**When to use:** When parsing natural language requires understanding context, folder references, and inferring photoMode/model from context
**Example:**
```typescript
// Source: platform.claude.com/docs/en/docs/build-with-claude/extended-thinking

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const response = await client.messages.create({
  model: "claude-sonnet-4-5-20250929",
  max_tokens: 16000,
  thinking: {
    type: "enabled",
    budget_tokens: 10000  // Allow thorough reasoning
  },
  messages: [{
    role: "user",
    content: prompt
  }]
});

// Extract text content (skip thinking blocks)
for (const block of response.content) {
  if (block.type === "text") {
    const json = JSON.parse(block.text);
  }
}
```

### Pattern 2: Per-Folder Sequential Processing
**What:** Process folders sequentially to maintain context and avoid rate limits
**When to use:** When making multiple API calls for different folders
**Example:**
```typescript
// Source: Current gemini-parser.ts pattern - adapt for Claude

async function parseWithClaude(
  folders: string[],
  userPrompt: string
): Promise<FolderParseResult[]> {
  const results: FolderParseResult[] = [];

  // Sequential processing to avoid rate limits
  for (const folder of folders) {
    const result = await parseSingleFolder(folder, userPrompt);
    results.push(result);
  }

  return results;
}
```

### Pattern 3: Response Content Block Handling
**What:** Claude returns an array of content blocks (thinking and text), not a single string
**When to use:** Always when parsing Claude responses
**Example:**
```typescript
// Source: platform.claude.com/docs/en/docs/build-with-claude/extended-thinking

interface ContentBlock {
  type: "thinking" | "text" | "redacted_thinking";
  thinking?: string;  // For thinking blocks
  text?: string;      // For text blocks
  signature?: string; // For thinking blocks
}

function extractTextFromResponse(content: ContentBlock[]): string {
  for (const block of content) {
    if (block.type === "text" && block.text) {
      return block.text;
    }
  }
  throw new Error("No text content in response");
}
```

### Anti-Patterns to Avoid
- **Setting temperature with extended thinking:** Extended thinking is incompatible with temperature parameter - remove it
- **Pre-filling assistant responses:** Cannot pre-fill when thinking is enabled
- **Using tool_choice with thinking:** Only `auto` or `none` allowed, not `any` or specific tool

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Retry logic | Custom retry wrapper | Copy existing `withRetry` pattern from gemini.ts | Consistent retry behavior, already tested |
| JSON extraction | Regex parsing | JSON.parse with cleanup | Handles edge cases better |
| Token counting | Manual estimation | response.usage object | Accurate billing data |
| Rate limiting | Custom throttler | Sequential processing + retry | Simpler, sufficient for per-folder calls |

**Key insight:** The current `gemini.ts` retry logic is well-designed and should be adapted for Claude with the same error categories.

## Common Pitfalls

### Pitfall 1: Thinking Budget Too Low
**What goes wrong:** Claude truncates reasoning, leading to poor parsing decisions
**Why it happens:** budget_tokens set too low (minimum is 1,024)
**How to avoid:** Start with 10,000 tokens, adjust based on complexity
**Warning signs:** Incomplete reasoning, poor confidence scores, inconsistent outputs

### Pitfall 2: Expecting Gemini Response Format
**What goes wrong:** Code assumes single text string, gets array of content blocks
**Why it happens:** Gemini returns `response.text()`, Claude returns `response.content[]`
**How to avoid:** Always iterate through content blocks, filter by type
**Warning signs:** TypeError when accessing `.text`, undefined values

### Pitfall 3: Ignoring Thinking Block Requirements for Multi-Turn
**What goes wrong:** Conversation context breaks when continuing with tool results
**Why it happens:** Thinking blocks must be passed back unmodified for tool use
**How to avoid:** For this phase: single-turn only (no tool use). If adding tools later, preserve thinking blocks
**Warning signs:** Loss of reasoning context, degraded follow-up responses

### Pitfall 4: max_tokens Too Low for Thinking
**What goes wrong:** Request fails or thinking is truncated
**Why it happens:** `max_tokens` must exceed `budget_tokens`
**How to avoid:** Set `max_tokens` to at least `budget_tokens + expected_output_tokens`
**Warning signs:** API errors, truncated output

### Pitfall 5: Streaming Complexity with Thinking
**What goes wrong:** Streaming handler doesn't correctly handle thinking_delta events
**Why it happens:** Thinking uses different event types than regular text
**How to avoid:** Use non-streaming for parsing (simpler), or handle `thinking_delta` and `text_delta` separately
**Warning signs:** Missing content, garbled output

## Code Examples

Verified patterns from official sources:

### Basic Message with Extended Thinking
```typescript
// Source: platform.claude.com/docs/en/docs/build-with-claude/extended-thinking

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const response = await client.messages.create({
  model: "claude-sonnet-4-5-20250929",
  max_tokens: 16000,
  thinking: {
    type: "enabled",
    budget_tokens: 10000
  },
  messages: [{
    role: "user",
    content: "Parse this prompt into a structured job..."
  }]
});

// Process response content blocks
for (const block of response.content) {
  if (block.type === "thinking") {
    console.log(`Reasoning: ${block.thinking}`);
  } else if (block.type === "text") {
    console.log(`Response: ${block.text}`);
  }
}
```

### Retry Logic Adapted from Gemini Pattern
```typescript
// Source: Adapted from lib/ai/gemini.ts

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 2000;
const RATE_LIMIT_DELAY_MS = 30000;

function isRetryableError(error: unknown): boolean {
  if (error instanceof Anthropic.APIError) {
    // Rate limits (429) and server errors (5xx)
    return error.status === 429 || error.status >= 500;
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('429') ||
      message.includes('rate limit') ||
      message.includes('overloaded') ||
      message.includes('network') ||
      message.includes('timeout')
    );
  }
  return false;
}

async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error)) throw error;

      const isRateLimit = error instanceof Anthropic.RateLimitError;
      const delay = isRateLimit
        ? RATE_LIMIT_DELAY_MS + Math.random() * 5000
        : BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 1000;

      console.warn(
        `[Claude] ${operationName} failed (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${Math.round(delay / 1000)}s`
      );
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
```

### Complete Parser Function Structure
```typescript
// Source: Pattern adapted from gemini-parser.ts + Claude API docs

import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicClient, CLAUDE_MODEL } from './anthropic';
import { buildFolderParserPrompt } from './prompts/folder-parser';
import { ParsedJobSchema } from './schemas/job';
import type { z } from 'zod';

type ParsedJob = z.infer<typeof ParsedJobSchema>;

interface FolderParseResult {
  folderPath: string;
  understood: boolean;
  confidence: number;
  interpretation: string;
  clarifyingQuestions?: Array<{
    question: string;
    context?: string;
    options?: string[];
  }>;
  folderOperation?: {
    folderPath: string;
    operation: string;
    model: 'nano-banana-pro' | 'seedream-4.5-edit';
    photoMode: 'reference' | 'analysis';
    aspectRatio: string;
    resolution?: string;
    quality?: string;
    imageSize?: string;
    excludedFiles?: string[];
    generationCount?: number;
  };
}

async function parseSingleFolderWithClaude(
  folderPath: string,
  fileCount: number,
  userPrompt: string
): Promise<FolderParseResult> {
  const client = getAnthropicClient();
  const prompt = buildFolderParserPrompt(folderPath, fileCount, userPrompt);

  console.log(`[Claude] Parsing folder "${folderPath}" (${fileCount} images)`);

  const response = await withRetry(async () => {
    return client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      thinking: {
        type: "enabled",
        budget_tokens: 10000
      },
      messages: [{
        role: "user",
        content: prompt
      }]
    });
  }, `Parse folder ${folderPath}`);

  // Extract text content from response
  let textContent = '';
  for (const block of response.content) {
    if (block.type === "text") {
      textContent = block.text;
      break;
    }
  }

  console.log(`[Claude] Raw response for folder "${folderPath}":`, textContent.substring(0, 500));

  try {
    // Clean up response (same as Gemini parser)
    let cleanText = textContent.trim();
    if (cleanText.startsWith('```json')) {
      cleanText = cleanText.slice(7);
    }
    if (cleanText.startsWith('```')) {
      cleanText = cleanText.slice(3);
    }
    if (cleanText.endsWith('```')) {
      cleanText = cleanText.slice(0, -3);
    }
    cleanText = cleanText.trim();

    const parsed = JSON.parse(cleanText) as FolderParseResult;
    parsed.folderPath = folderPath;

    // ... normalization logic same as gemini-parser.ts ...

    return parsed;
  } catch (e) {
    console.error(`[Claude] Failed to parse JSON for folder ${folderPath}:`, e);
    return {
      folderPath,
      understood: false,
      confidence: 0,
      interpretation: `Failed to parse AI response for folder ${folderPath}. Please try rephrasing.`,
      clarifyingQuestions: [{
        question: `What would you like to do with folder "${folderPath}"?`,
        options: ['Face swap', 'Background replacement', 'Product photo', 'Other']
      }]
    };
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Gemini 2.0 Flash | Claude Sonnet 4.5 | Phase 21 | Better reasoning via extended thinking |
| Single text response | Content blocks array | Claude API v1 | Requires different parsing logic |
| No explicit reasoning | Extended thinking | Sonnet 4.5 | Visible reasoning improves debuggability |

**Deprecated/outdated:**
- Claude Sonnet 3.7: Still supported but 4.5 has better extended thinking and summarized output
- Full thinking output: Claude 4 models return summarized thinking (except 3.7)

## API Differences: Gemini vs Claude

| Aspect | Gemini | Claude |
|--------|--------|--------|
| SDK | `@google/generative-ai` | `@anthropic-ai/sdk` |
| Response | `response.text()` | `response.content[]` blocks |
| Temperature | 0.0-2.0 | 0.0-1.0 (disabled with thinking) |
| Structured Output | `responseMimeType: 'application/json'` | Must instruct in prompt |
| Max Tokens | `maxOutputTokens` | `max_tokens` |
| System Prompt | In `generationConfig` | Separate `system` parameter |
| Thinking | Not available | `thinking: { type: "enabled", budget_tokens }` |

## Open Questions

Things that couldn't be fully resolved:

1. **Optimal thinking budget for this use case**
   - What we know: Minimum 1,024 tokens, docs suggest 10k+ for complex tasks
   - What's unclear: Exact optimal value for folder parsing prompts
   - Recommendation: Start with 10,000, monitor and adjust based on output quality

2. **Streaming vs non-streaming for parsing**
   - What we know: Streaming adds complexity with thinking deltas
   - What's unclear: Performance benefit for parsing use case
   - Recommendation: Use non-streaming initially (simpler), add streaming if latency is a concern

3. **Interleaved thinking feature**
   - What we know: Beta feature for thinking between tool calls
   - What's unclear: Whether it helps for parsing (no tool use in parser)
   - Recommendation: Not needed for this phase (single-turn parsing, no tools)

## Sources

### Primary (HIGH confidence)
- platform.claude.com/docs/en/docs/build-with-claude/extended-thinking - Extended thinking documentation
- platform.claude.com/docs/en/api/messages - Messages API reference
- github.com/anthropics/anthropic-sdk-typescript - Official TypeScript SDK

### Secondary (MEDIUM confidence)
- lib/ai/gemini-parser.ts (local) - Existing pattern to follow
- lib/ai/anthropic.ts (local) - Existing client setup

### Tertiary (LOW confidence)
- WebSearch results for migration patterns - General guidance only

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - SDK already installed, API well-documented
- Architecture: HIGH - Clear patterns from official docs and existing code
- Pitfalls: HIGH - Well-documented in Anthropic docs

**Research date:** 2026-01-31
**Valid until:** 30 days (stable API, model version locked)
