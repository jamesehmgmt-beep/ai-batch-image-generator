# Phase 2: Job Creation & Prompt Parsing - Research

**Researched:** 2026-01-24
**Domain:** Anthropic Claude API Integration, Natural Language Prompt Parsing, Conversational UI
**Confidence:** HIGH

## Summary

This research covers the technical requirements for implementing AI-powered prompt parsing using Claude Sonnet 4.5 via the Anthropic API. The phase involves building a conversational interface where users write natural language prompts that the AI parses into structured generation jobs, with clarifying question loops until understanding is confirmed.

The recommended approach uses the official `@anthropic-ai/sdk` package with structured outputs (via Zod schemas) to guarantee type-safe JSON responses. For the conversational UI, shadcn/ui components with custom chat styling provide a clean integration with the existing design system. Job state should be stored in Supabase using a simple table-based state machine pattern rather than the newer pgmq extension (which is overkill for this use case).

**Primary recommendation:** Use Anthropic SDK's structured outputs feature with Zod schemas to guarantee valid parsed job structures, implement a multi-turn conversation pattern with message history, and store jobs in a Supabase `jobs` table with JSONB columns for flexible schema evolution.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @anthropic-ai/sdk | latest | Claude API client | Official Anthropic SDK with TypeScript support |
| zod | ^3.x | Schema validation | Type-safe schema definitions, works with Anthropic structured outputs |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @ai-sdk/anthropic | latest | Vercel AI SDK provider | Alternative if using Vercel AI SDK patterns (useChat hook) |
| ai | ^6.0+ | Vercel AI SDK Core | For streaming UI helpers (optional) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @anthropic-ai/sdk | @ai-sdk/anthropic (Vercel) | Vercel adds useChat hook but adds abstraction layer; direct SDK gives more control |
| Custom chat UI | shadcn-chat | shadcn-chat is no longer maintained; better to build custom with shadcn/ui primitives |

**Installation:**
```bash
npm install @anthropic-ai/sdk zod
```

## Architecture Patterns

### Recommended Project Structure
```
lib/
├── ai/
│   ├── anthropic.ts           # Anthropic client singleton
│   ├── schemas/
│   │   ├── job.ts             # Zod schema for parsed job
│   │   └── clarification.ts   # Zod schema for clarifying questions
│   └── prompts/
│       └── job-parser.ts      # System prompt for job parsing
├── types/
│   ├── job.ts                 # Job-related TypeScript types
│   └── conversation.ts        # Conversation/message types
app/
├── api/
│   └── ai/
│       └── parse/
│           └── route.ts       # POST handler for AI parsing
components/
├── job/
│   ├── prompt-input.tsx       # User prompt textarea
│   ├── conversation.tsx       # Message list display
│   ├── parsed-job-review.tsx  # Editable job preview
│   └── cost-estimate.tsx      # Cost breakdown display
```

### Pattern 1: Multi-Turn Conversation with Message History
**What:** Maintain full conversation history and send to Claude on each turn
**When to use:** Always - Claude API is stateless, requires full context each call
**Example:**
```typescript
// Source: Anthropic SDK documentation
import Anthropic from '@anthropic-ai/sdk';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

const client = new Anthropic();

async function parsePromptWithClarification(
  systemPrompt: string,
  messages: ConversationMessage[]
) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 4096,
    system: systemPrompt,
    messages: messages,
  });

  return response;
}
```

### Pattern 2: Structured Output with Zod
**What:** Use structured outputs to guarantee schema-compliant JSON responses
**When to use:** For final job parsing output and clarifying question structure
**Example:**
```typescript
// Source: Anthropic structured outputs documentation
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';

// Define the parsed job schema
const ParsedJobSchema = z.object({
  understood: z.boolean(),
  clarifyingQuestions: z.array(z.object({
    question: z.string(),
    options: z.array(z.string()).optional(),
  })).optional(),
  job: z.object({
    folders: z.array(z.object({
      folderPath: z.string(),
      operation: z.string(),
      excludedFiles: z.array(z.string()).optional(),
      photoMode: z.enum(['reference', 'analysis']),
      resolution: z.enum(['1K', '2K', '4K']),
      aspectRatio: z.string(),
    })),
    globalSettings: z.object({
      outputFormat: z.enum(['PNG', 'JPG']),
    }).optional(),
  }).optional(),
});

const client = new Anthropic();

const response = await client.beta.messages.parse({
  model: 'claude-sonnet-4-5',
  max_tokens: 4096,
  betas: ['structured-outputs-2025-11-13'],
  messages: [{ role: 'user', content: userPrompt }],
  output_format: betaZodOutputFormat(ParsedJobSchema),
});

// Automatically parsed and validated
const parsed = response.parsed_output;
```

### Pattern 3: Streaming for Long Responses
**What:** Stream AI responses for better UX during clarification
**When to use:** When displaying AI responses in real-time
**Example:**
```typescript
// Source: Anthropic SDK streaming example
const stream = await client.messages.create({
  model: 'claude-sonnet-4-5-20250929',
  max_tokens: 2048,
  messages: [{ role: 'user', content: prompt }],
  stream: true,
});

for await (const event of stream) {
  if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
    // Send chunk to client
    yield event.delta.text;
  }
}
```

### Pattern 4: State Machine for Conversation Flow
**What:** Use explicit states to manage the prompt parsing flow
**When to use:** To track conversation progress and handle transitions
**Example:**
```typescript
type ConversationState =
  | 'awaiting_prompt'      // User hasn't entered a prompt yet
  | 'parsing'              // AI is processing
  | 'clarifying'           // AI is asking questions
  | 'awaiting_confirmation' // Showing parsed job for review
  | 'confirmed'            // User confirmed, ready for execution
  | 'editing';             // User is editing the parsed job

interface ConversationContext {
  state: ConversationState;
  messages: ConversationMessage[];
  parsedJob: ParsedJob | null;
  uploadedFiles: FolderNode[];  // From Phase 1
}
```

### Anti-Patterns to Avoid
- **Single API call expecting perfect parsing:** Always design for multi-turn clarification
- **Storing sensitive API keys client-side:** Keep Anthropic API key in server-side route handlers only
- **Unbounded conversation history:** Trim or summarize long conversations to stay within context limits
- **Blocking UI during AI processing:** Always stream or show loading states

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON schema validation | Custom validators | Zod | Type inference, runtime validation, Anthropic SDK integration |
| API error handling | Custom retry logic | SDK built-in patterns | Anthropic SDK handles retries, exposes error types |
| Message streaming | Manual SSE parsing | Anthropic SDK stream helpers | Built-in event handling, proper cleanup |
| Rate limit handling | Custom throttling | `retry-after` header | Server tells you exactly when to retry |
| JSON output parsing | Regex/string parsing | Structured outputs | Guaranteed valid JSON matching schema |

**Key insight:** The Anthropic SDK provides structured outputs that eliminate the need for prompt engineering to get valid JSON. This is a game-changer for reliability.

## Common Pitfalls

### Pitfall 1: Not Using Structured Outputs Beta
**What goes wrong:** Prompting Claude to return JSON often results in malformed output, missing fields, or inconsistent types
**Why it happens:** LLMs generate text token-by-token; JSON structure isn't guaranteed without constrained decoding
**How to avoid:** Always use `structured-outputs-2025-11-13` beta with Zod schemas
**Warning signs:** `JSON.parse()` errors, TypeScript type mismatches, retry loops for schema violations

### Pitfall 2: Forgetting Conversation State is Server-Side
**What goes wrong:** Conversation resets on page refresh, state lost
**Why it happens:** Claude API is stateless; state must be persisted
**How to avoid:** Store conversation state in Supabase or session storage; reload on mount
**Warning signs:** Users losing conversation progress, having to restart clarification flows

### Pitfall 3: Rate Limit Errors in Production
**What goes wrong:** 429 errors during peak usage, degraded user experience
**Why it happens:** Tier 1 limits are low (50 RPM, 30,000 ITPM for Sonnet)
**How to avoid:**
  - Use `retry-after` header for backoff
  - Implement request queuing
  - Monitor `anthropic-ratelimit-*` response headers
  - Consider prompt caching for repeated system prompts
**Warning signs:** Intermittent failures, users reporting "AI not responding"

### Pitfall 4: Overly Complex Clarification Loops
**What goes wrong:** AI asks endless questions, user frustrated
**Why it happens:** System prompt doesn't guide Claude on when to stop clarifying
**How to avoid:**
  - Set explicit rules: "Ask at most 3 clarifying questions per turn"
  - Include "If uncertain about minor details, make reasonable assumptions"
  - Give Claude examples of when to proceed vs. when to clarify
**Warning signs:** Conversations exceeding 5-6 turns without resolution

### Pitfall 5: Not Validating File References Against Uploaded Files
**What goes wrong:** Parsed job references folders/files that don't exist
**Why it happens:** Claude parses user text literally without context of actual uploads
**How to avoid:**
  - Include uploaded file structure in system prompt context
  - Validate parsed folder/file references before confirmation
  - Show warnings for unmatched references
**Warning signs:** Jobs failing at execution because referenced files don't exist

## Code Examples

Verified patterns from official sources:

### Anthropic Client Setup (Server-Side Only)
```typescript
// lib/ai/anthropic.ts
// Source: Anthropic SDK documentation
import Anthropic from '@anthropic-ai/sdk';

// Singleton pattern for server-side usage
let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!client) {
    client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return client;
}
```

### Job Parsing Schema
```typescript
// lib/ai/schemas/job.ts
import { z } from 'zod';

export const PhotoModeSchema = z.enum(['reference', 'analysis']);
export const ResolutionSchema = z.enum(['1K', '2K', '4K']);
export const AspectRatioSchema = z.enum([
  '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9', 'auto'
]);

export const FolderOperationSchema = z.object({
  folderPath: z.string().describe('Path to the folder, e.g., "5" or "products/summer"'),
  operation: z.string().describe('What to do with images in this folder'),
  excludedFiles: z.array(z.string()).optional().describe('Files to exclude, e.g., ["no.jpg", "test.jpg"]'),
  photoMode: PhotoModeSchema.describe('reference = use photo as-is, analysis = AI examines content'),
  resolution: ResolutionSchema.describe('Output resolution'),
  aspectRatio: AspectRatioSchema.describe('Output aspect ratio'),
});

export const ParsedJobSchema = z.object({
  understood: z.boolean().describe('True if AI fully understands the request'),
  clarifyingQuestions: z.array(z.object({
    question: z.string(),
    options: z.array(z.string()).optional(),
  })).optional().describe('Questions to ask if not fully understood'),
  job: z.object({
    folders: z.array(FolderOperationSchema),
    globalPrompt: z.string().optional().describe('Prompt applied to all generations'),
  }).optional().describe('Parsed job structure, only present if understood=true'),
});

export type ParsedJob = z.infer<typeof ParsedJobSchema>;
export type FolderOperation = z.infer<typeof FolderOperationSchema>;
```

### System Prompt for Job Parsing
```typescript
// lib/ai/prompts/job-parser.ts
export function buildJobParserSystemPrompt(uploadedStructure: string): string {
  return `You are an AI assistant that parses natural language prompts into structured image generation jobs.

## Uploaded File Structure
The user has uploaded the following folders and files:
${uploadedStructure}

## Your Task
Parse the user's prompt into a structured job. The user may reference:
- Folder names (e.g., "folder named '5'", "the products folder")
- File exclusions (e.g., "except no.jpg and test.jpg")
- Operations (e.g., "swap faces to Arab women", "replace background with cream")
- Resolution (1K, 2K, or 4K) - default to 2K if not specified
- Aspect ratio (1:1, 2:3, 3:2, etc.) - default to "auto" if not specified

## Photo Modes
- **Reference mode**: The photo is used as-is in the generation (e.g., "use this as reference")
- **Analysis mode**: AI examines the photo content to understand what's in it (e.g., "analyze what's in the photo")

Infer the mode from context:
- "put dress on model" = analysis (needs to understand the dress)
- "use face from this photo" = reference (use photo directly)
- "swap background" = analysis (needs to understand what to keep)

## Rules
1. If the prompt is ambiguous, ask clarifying questions (max 3 per response)
2. If you can make reasonable assumptions for minor details, do so
3. Match folder/file references to the uploaded structure
4. If a referenced folder doesn't exist, ask for clarification
5. Default to reference mode unless context clearly indicates analysis needed

Respond with understood=true only when you have enough information to create the job.`;
}
```

### API Route Handler
```typescript
// app/api/ai/parse/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAnthropicClient } from '@/lib/ai/anthropic';
import { ParsedJobSchema } from '@/lib/ai/schemas/job';
import { buildJobParserSystemPrompt } from '@/lib/ai/prompts/job-parser';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';

export async function POST(request: NextRequest) {
  try {
    const { messages, uploadedStructure } = await request.json();

    const client = getAnthropicClient();
    const systemPrompt = buildJobParserSystemPrompt(uploadedStructure);

    const response = await client.beta.messages.parse({
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
      betas: ['structured-outputs-2025-11-13'],
      system: systemPrompt,
      messages: messages,
      output_format: betaZodOutputFormat(ParsedJobSchema),
    });

    return NextResponse.json({
      parsed: response.parsed_output,
      usage: response.usage,
    });
  } catch (error) {
    if (error instanceof Error && 'status' in error) {
      const apiError = error as { status: number; message: string };
      if (apiError.status === 429) {
        return NextResponse.json(
          { error: 'Rate limited. Please try again shortly.' },
          { status: 429 }
        );
      }
    }
    console.error('AI parsing error:', error);
    return NextResponse.json(
      { error: 'Failed to parse prompt' },
      { status: 500 }
    );
  }
}
```

### Database Schema for Jobs
```sql
-- Supabase migration for jobs table
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,  -- From password auth session
  session_id TEXT NOT NULL,  -- Links to upload session

  -- Conversation state
  conversation JSONB NOT NULL DEFAULT '[]',
  state TEXT NOT NULL DEFAULT 'awaiting_prompt'
    CHECK (state IN ('awaiting_prompt', 'parsing', 'clarifying', 'awaiting_confirmation', 'confirmed', 'editing')),

  -- Parsed job data (populated when understood)
  parsed_job JSONB,

  -- Cost estimation
  estimated_cost DECIMAL(10, 4),
  photo_count INTEGER,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ  -- When user confirmed the job
);

-- Index for querying user's jobs
CREATE INDEX idx_jobs_user_id ON jobs(user_id);
CREATE INDEX idx_jobs_session_id ON jobs(session_id);
CREATE INDEX idx_jobs_state ON jobs(state);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
```

### Cost Estimation Logic
```typescript
// lib/job/cost-estimation.ts

interface CostBreakdown {
  totalImages: number;
  byResolution: {
    '1K': number;
    '2K': number;
    '4K': number;
  };
  estimatedCost: number;
  perImageCost: {
    '1K': number;
    '2K': number;
    '4K': number;
  };
}

// kie.ai Nano Banana Pro pricing (approximate)
const COST_PER_IMAGE = {
  '1K': 0.134,
  '2K': 0.134,
  '4K': 0.24,
} as const;

export function calculateCostEstimate(
  operations: FolderOperation[],
  fileCountByFolder: Record<string, number>
): CostBreakdown {
  const byResolution = { '1K': 0, '2K': 0, '4K': 0 };

  for (const op of operations) {
    const folderCount = fileCountByFolder[op.folderPath] || 0;
    const excludedCount = op.excludedFiles?.length || 0;
    const effectiveCount = Math.max(0, folderCount - excludedCount);

    byResolution[op.resolution] += effectiveCount;
  }

  const totalImages = byResolution['1K'] + byResolution['2K'] + byResolution['4K'];
  const estimatedCost =
    byResolution['1K'] * COST_PER_IMAGE['1K'] +
    byResolution['2K'] * COST_PER_IMAGE['2K'] +
    byResolution['4K'] * COST_PER_IMAGE['4K'];

  return {
    totalImages,
    byResolution,
    estimatedCost,
    perImageCost: COST_PER_IMAGE,
  };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Prompt engineering for JSON | Structured outputs with constrained decoding | Nov 2025 | Guaranteed valid JSON, no retries needed |
| Manual tool calling | `betaZodTool` with automatic type safety | 2025 | Type-safe tool definitions with Zod |
| Custom streaming parsing | SDK stream helpers | 2025 | Built-in event handling, proper cleanup |
| Simple JSON prompting | `output_format` parameter | Nov 2025 | Schema enforcement at decoding level |

**Deprecated/outdated:**
- Older Claude models (3.x series) - Use Claude Sonnet 4.5 for best tool/structured output support
- `client.messages.create` for structured outputs - Use `client.beta.messages.parse` with beta flag
- Manual JSON parsing from response - Use Zod-parsed `response.parsed_output`

## Open Questions

Things that couldn't be fully resolved:

1. **Exact kie.ai pricing for this project**
   - What we know: General pricing ~$0.134/image (1K/2K), ~$0.24/image (4K)
   - What's unclear: Whether the user has a subscription tier with different pricing
   - Recommendation: Make cost display configurable, allow user to update pricing in settings

2. **Conversation length limits**
   - What we know: Claude has 200K context window (1M in beta for Tier 4)
   - What's unclear: Practical limits for conversation history with file structure context
   - Recommendation: Implement conversation summarization if history exceeds ~50K tokens

3. **Photo mode inference accuracy**
   - What we know: Claude can infer from context with good prompting
   - What's unclear: Edge cases where inference fails
   - Recommendation: Always show inferred mode and allow user override

## Sources

### Primary (HIGH confidence)
- [Anthropic SDK TypeScript](https://github.com/anthropics/anthropic-sdk-typescript) - Installation, streaming, error handling
- [Claude Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) - JSON schema, Zod integration, beta usage
- [Claude API Rate Limits](https://platform.claude.com/docs/en/api/rate-limits) - Tier limits, headers, retry strategies

### Secondary (MEDIUM confidence)
- [Vercel AI SDK Anthropic Provider](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic) - Alternative integration pattern
- [Supabase Queues](https://supabase.com/docs/guides/queues/quickstart) - Queue pattern (decided against for this use case)
- [Zod Documentation](https://zod.dev/) - Schema definition patterns

### Tertiary (LOW confidence)
- [kie.ai/Nano Banana Pro pricing](https://www.aifreeapi.com/en/posts/nano-banana-pricing-calculator) - Third-party pricing analysis, may not be current
- [shadcn-chat](https://github.com/jakobhoeg/shadcn-chat) - No longer maintained, referenced for patterns only

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Official Anthropic SDK documentation and examples
- Architecture: HIGH - Based on official patterns and verified documentation
- Pitfalls: MEDIUM - Combination of documented issues and inferred from architecture
- Cost estimation: LOW - Third-party sources, user should verify with kie.ai

**Research date:** 2026-01-24
**Valid until:** 2026-02-24 (30 days - stable libraries, structured outputs is new feature so may evolve)
