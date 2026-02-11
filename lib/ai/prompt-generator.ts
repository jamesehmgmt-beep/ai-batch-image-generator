// lib/ai/prompt-generator.ts
// Purpose: Centralized per-generation prompt creation
// Phase 27: ONE Claude call generates ALL unique prompts per folder

import { getAnthropicClient, CLAUDE_MODEL, withRetry } from './anthropic';

// =============================================================================
// JSON Parsing Utilities
// =============================================================================

function cleanJsonResponse(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  return cleaned.trim();
}

function parseJsonResponse<T>(text: string): T {
  const cleaned = cleanJsonResponse(text);
  try {
    return JSON.parse(cleaned) as T;
  } catch (error) {
    throw new Error(
      `Failed to parse JSON response: ${error instanceof Error ? error.message : 'Unknown error'}. ` +
      `Cleaned text (first 200 chars): ${cleaned.substring(0, 200)}`
    );
  }
}

// =============================================================================
// Batch Prompt Generator - ONE Claude call per folder
// =============================================================================

/**
 * Generate ALL unique prompts for a folder in ONE Claude call.
 *
 * This ensures all prompts are truly distinct because Claude sees all of them
 * at once and can make each one meaningfully different.
 *
 * @param folderOperation - The operation string from folder parsing (what to do)
 * @param userFullPrompt - The complete user prompt (full context)
 * @param count - How many unique prompts to generate
 * @returns Array of unique prompt strings, length === count
 */
export async function generateAllFolderPrompts(
  folderOperation: string,
  userFullPrompt: string,
  count: number
): Promise<string[]> {
  // If only 1 prompt needed, no need for variations - just clean up the operation
  if (count <= 1) {
    const single = await generateSinglePrompt(folderOperation, userFullPrompt);
    return [single];
  }

  try {
    const client = getAnthropicClient();

    const prompt = `You are generating image generation prompts for an AI image tool.

<user_request>
${userFullPrompt}
</user_request>

<folder_operation>
${folderOperation}
</folder_operation>

<task>
Generate exactly ${count} UNIQUE image generation prompts based on the user's request above.

Each prompt should be a complete, standalone instruction for an AI image generator.
The prompts are for the SAME source image but each should produce a DISTINCTLY DIFFERENT result.

CRITICAL RULES:
1. Each prompt MUST be meaningfully different from every other prompt
2. Stay faithful to what the user asked for - do NOT add details they didn't request
3. Vary things the user asked to vary (angles, poses, styles, etc.)
4. If the user specified specific variations (e.g., "front view, back view, side view"), use those EXACTLY
5. If the user wants variations but didn't specify what, vary: angle, pose, composition, or styling
6. Each prompt should be 1-3 sentences, clear and direct
7. Do NOT include numbering, labels, or prefixes - just the prompt text
8. Preserve all user requirements (background color, style, resolution, etc.) in EVERY prompt
</task>

<output_format>
Respond with ONLY a JSON array of ${count} prompt strings. No markdown, no explanation.
Example: ["prompt 1 text here", "prompt 2 text here", "prompt 3 text here"]
</output_format>`;

    const response = await withRetry(async () => {
      return client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 16000,
        thinking: {
          type: "enabled",
          budget_tokens: 5000
        },
        messages: [{
          role: "user",
          content: prompt
        }]
      });
    }, `Generate ${count} folder prompts`);

    // Extract text response
    let textContent = '';
    for (const block of response.content) {
      if (block.type === 'text') {
        textContent = block.text;
        break;
      }
    }

    if (!textContent) {
      throw new Error('No text response from batch prompt generation');
    }

    // Parse JSON array
    const prompts = parseJsonResponse<string[]>(textContent);

    // Validate we got the right number
    if (!Array.isArray(prompts) || prompts.length === 0) {
      throw new Error(`Expected array of ${count} prompts, got: ${typeof prompts}`);
    }

    // Log results
    console.log(`[Prompt Generator] Generated ${prompts.length} unique prompts for folder`);
    prompts.forEach((p, i) => {
      console.log(`[Prompt Generator]   ${i + 1}. "${p.substring(0, 80)}..."`);
    });

    // If we got fewer than requested, pad by cycling
    while (prompts.length < count) {
      prompts.push(prompts[prompts.length % prompts.length]);
    }

    // If we got more than requested, trim
    return prompts.slice(0, count);

  } catch (error) {
    console.error('[Prompt Generator] Batch generation failed, using fallback:', error);
    // Fallback: return the operation repeated (uniform)
    return Array(count).fill(folderOperation);
  }
}

/**
 * Generate a single cleaned-up prompt from user request (for uniform/single-image cases)
 */
async function generateSinglePrompt(
  folderOperation: string,
  userFullPrompt: string
): Promise<string> {
  try {
    const client = getAnthropicClient();

    const prompt = `You are generating an image generation prompt for an AI image tool.

<user_request>
${userFullPrompt}
</user_request>

<folder_operation>
${folderOperation}
</folder_operation>

<task>
Create ONE clear, complete image generation prompt based on the user's request.
Stay faithful to what the user asked for. Do NOT add details they didn't request.
Keep it 1-3 sentences, clear and direct.
</task>

Respond with ONLY the prompt text. No quotes, no explanation, no formatting.`;

    const response = await withRetry(async () => {
      return client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 500,
        messages: [{
          role: "user",
          content: prompt
        }]
      });
    }, 'Generate single prompt');

    const textBlock = response.content.find(b => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return folderOperation;
    }

    return textBlock.text.trim();
  } catch (error) {
    console.error('[Prompt Generator] Single prompt generation failed:', error);
    return folderOperation;
  }
}

/**
 * Legacy function - kept for backward compatibility but simplified.
 * New code should use generateAllFolderPrompts() instead.
 */
export async function generatePerImagePrompt(options: {
  folderOperation: string;
  fileName: string;
  imageUrl?: string;
  photoMode: 'reference' | 'analysis';
  userFullPrompt?: string;
  imageCount?: number;
  imageIndex?: number;
  cachedPrompts?: string[];
}): Promise<string> {
  const {
    folderOperation,
    userFullPrompt,
    imageCount = 1,
    imageIndex = 0,
    cachedPrompts
  } = options;

  // If we have pre-generated prompts from generateAllFolderPrompts, use them
  if (cachedPrompts && cachedPrompts.length > 0) {
    const promptIndex = imageIndex % cachedPrompts.length;
    const prompt = cachedPrompts[promptIndex];
    console.log(`[Prompt Generator] Using cached prompt ${promptIndex + 1}/${cachedPrompts.length}: "${prompt.substring(0, 80)}..."`);
    return prompt;
  }

  // Fallback: no pre-generated prompts
  if (!userFullPrompt) {
    return folderOperation;
  }

  // Generate on the fly (shouldn't happen with new flow, but safe fallback)
  const prompts = await generateAllFolderPrompts(folderOperation, userFullPrompt, imageCount);
  const promptIndex = imageIndex % prompts.length;
  return prompts[promptIndex];
}

// Legacy exports for backward compatibility
export function clearIntentCache(): void {
  // No-op - intent cache no longer used
}
