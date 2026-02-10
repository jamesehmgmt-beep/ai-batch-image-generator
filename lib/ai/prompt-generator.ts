// lib/ai/prompt-generator.ts
// Purpose: Centralized per-generation prompt creation
// Phase 25: Simple pass-through implementation
// Phase 26: Enhanced with intent analysis

import { getAnthropicClient, CLAUDE_MODEL, withRetry } from './anthropic';
import { IntentAnalysis, IntentMode, buildIntentAnalysisPrompt } from './prompts/intent-analysis';

export interface PromptGenerationOptions {
  /** Base prompt from folder operation */
  folderOperation: string;
  /** Source file name for this generation */
  fileName: string;
  /** Image URL for analysis (optional) */
  imageUrl?: string;
  /** Photo mode: reference or analysis */
  photoMode: 'reference' | 'analysis';
  // Phase 26: Added for intent-based generation
  /** Full user prompt for intent analysis */
  userFullPrompt?: string;
  /** Total images in folder */
  imageCount?: number;
  /** 0-based index of current image */
  imageIndex?: number;
  /** Pre-analyzed intent (to avoid repeated analysis) */
  cachedIntent?: IntentAnalysis;
}

// Re-export for consumers
export type { IntentAnalysis, IntentMode };

// =============================================================================
// Intent Cache - Prevents redundant API calls for same folder
// =============================================================================

/**
 * Cache intent analysis per folder operation to avoid redundant API calls
 * Key: folderOperation::userFullPrompt (truncated to 200 chars), Value: IntentAnalysis
 */
const intentCache = new Map<string, IntentAnalysis>();

/**
 * Generate cache key from folder operation and user prompt
 */
function getIntentCacheKey(folderOperation: string, userFullPrompt: string): string {
  return `${folderOperation}::${userFullPrompt}`.substring(0, 200);
}

/**
 * Get cached intent or analyze and cache the result
 *
 * @param folderOperation - The operation string from folder parsing
 * @param userFullPrompt - The complete user prompt
 * @param imageCount - Number of images in the folder
 * @returns Cached or freshly analyzed IntentAnalysis
 */
async function getOrAnalyzeIntent(
  folderOperation: string,
  userFullPrompt: string,
  imageCount: number
): Promise<IntentAnalysis> {
  const cacheKey = getIntentCacheKey(folderOperation, userFullPrompt);

  if (intentCache.has(cacheKey)) {
    return intentCache.get(cacheKey)!;
  }

  const intent = await analyzeUserIntent(folderOperation, userFullPrompt, imageCount);
  intentCache.set(cacheKey, intent);
  return intent;
}

/**
 * Clear intent cache - call between jobs to prevent memory buildup
 */
export function clearIntentCache(): void {
  intentCache.clear();
}

// =============================================================================
// JSON Parsing Utilities
// =============================================================================

/**
 * Clean JSON response from Claude by removing markdown code blocks
 *
 * @param text - Raw text response from Claude
 * @returns Cleaned JSON string ready for parsing
 */
function cleanJsonResponse(text: string): string {
  let cleaned = text.trim();

  // Remove markdown code block markers
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

/**
 * Parse JSON response with error handling
 *
 * @param text - Raw text to parse
 * @returns Parsed object
 * @throws Error with clear message if parsing fails
 */
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

/**
 * Analyze user intent to determine prompt generation strategy
 *
 * Uses Claude Sonnet 4.5 with extended thinking (budget_tokens: 3000)
 * to analyze whether the user wants:
 * - uniform: Same prompt for all images (most common)
 * - explicit-variations: User specified what varies
 * - implicit-variations: User wants variations but didn't specify what
 *
 * CRITICAL: If confidence < 0.7, mode is forced to 'uniform'
 *
 * @param folderOperation - The operation string from folder parsing
 * @param userFullPrompt - The complete user prompt
 * @param imageCount - Number of images in the folder
 * @returns IntentAnalysis with mode, confidence, basePrompt, and optionally variations
 */
export async function analyzeUserIntent(
  folderOperation: string,
  userFullPrompt: string,
  imageCount: number
): Promise<IntentAnalysis> {
  try {
    const client = getAnthropicClient();
    const prompt = buildIntentAnalysisPrompt(folderOperation, userFullPrompt, imageCount);

    const response = await withRetry(async () => {
      return client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 4000,
        thinking: {
          type: "enabled",
          budget_tokens: 3000
        },
        messages: [{
          role: "user",
          content: prompt
        }]
      });
    }, 'Analyze user intent');

    // Extract thinking block for debugging (log first 200 chars)
    let reasoning: string | undefined;
    for (const block of response.content) {
      if (block.type === 'thinking') {
        reasoning = block.thinking.substring(0, 200);
        // console.log('[Intent Analysis] Reasoning:', reasoning);
        break;
      }
    }

    // Extract text response
    let textContent = '';
    for (const block of response.content) {
      if (block.type === 'text') {
        textContent = block.text;
        break;
      }
    }

    if (!textContent) {
      throw new Error('No text response from intent analysis');
    }

    // Parse JSON response
    const parsed = parseJsonResponse<{
      mode: IntentMode;
      confidence: number;
      basePrompt: string;
      variations?: string[];
    }>(textContent);

    // Log raw parsed result
    console.log(`[Intent Analysis] Raw result: mode=${parsed.mode}, confidence=${parsed.confidence.toFixed(2)}`);
    console.log(`[Intent Analysis] BasePrompt: "${parsed.basePrompt.substring(0, 100)}..."`);
    if (parsed.variations && parsed.variations.length > 0) {
      console.log(`[Intent Analysis] Variations (${parsed.variations.length}): ${JSON.stringify(parsed.variations)}`);
    } else {
      console.log(`[Intent Analysis] No variations extracted`);
    }

    // Build result with reasoning
    const result: IntentAnalysis = {
      mode: parsed.mode,
      confidence: parsed.confidence,
      basePrompt: parsed.basePrompt,
      variations: parsed.variations,
      reasoning
    };

    // Force uniform mode if confidence is low
    // Lowered threshold from 0.7 to 0.5 to be more permissive
    if (result.confidence < 0.5) {
      console.warn(
        `[Intent Analysis] LOW CONFIDENCE (${result.confidence.toFixed(2)}) - forcing to uniform mode. ` +
        `Original mode: ${result.mode}, variations: ${JSON.stringify(result.variations)}`
      );
      result.mode = 'uniform';
      // Clear variations since we're now uniform
      result.variations = undefined;
    } else {
      console.log(
        `[Intent Analysis] CONFIDENCE OK (${result.confidence.toFixed(2)}) - keeping mode: ${result.mode}`
      );
    }

    return result;

  } catch (error) {
    // On any failure, return safe default (uniform mode)
    console.error(
      '[Intent Analysis] Failed, using default uniform mode:',
      error instanceof Error ? error.message : error
    );

    return {
      mode: 'uniform',
      confidence: 0.5,
      basePrompt: folderOperation,
      reasoning: `Fallback due to error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

// =============================================================================
// Mode Handlers - Build prompts based on intent mode
// =============================================================================

/**
 * Build prompt for uniform mode - same prompt for all images
 *
 * @param intent - Analyzed intent with basePrompt
 * @returns The base prompt (unchanged for all images)
 */
function buildUniformPrompt(intent: IntentAnalysis): string {
  // Simple: use base prompt for all images
  // No embellishments, just what user asked for
  return intent.basePrompt;
}

/**
 * Build prompt for explicit variations mode - cycle through user-specified variations
 *
 * @param intent - Analyzed intent with variations array
 * @param imageIndex - 0-based index of current image
 * @returns Prompt combining base with variation at imageIndex
 */
function buildExplicitVariationPrompt(
  intent: IntentAnalysis,
  imageIndex: number
): string {
  // Use variation at imageIndex, cycling if more images than variations
  const variations = intent.variations || [];
  if (variations.length === 0) {
    // Fallback to base prompt if no variations
    console.warn('[Prompt Generator] explicit-variations mode but no variations array - falling back to basePrompt');
    return intent.basePrompt;
  }

  const variationIndex = imageIndex % variations.length;
  const variation = variations[variationIndex];

  // Put variation at the BEGINNING so it's obvious and can't be missed
  // Format: "[VARIATION X: description] base prompt"
  const combinedPrompt = `[POSE: ${variation}] ${intent.basePrompt}`;

  console.log(`[Prompt Generator] ===== VARIATION ${variationIndex + 1}/${variations.length} =====`);
  console.log(`[Prompt Generator] variation = "${variation}"`);
  console.log(`[Prompt Generator] basePrompt = "${intent.basePrompt.substring(0, 50)}..."`);
  console.log(`[Prompt Generator] RESULT = "${combinedPrompt.substring(0, 80)}..."`);

  return combinedPrompt;
}

/**
 * Build prompt for implicit variations mode - use Claude to generate unique variation
 *
 * @param intent - Analyzed intent with basePrompt
 * @param imageIndex - 0-based index of current image
 * @param imageCount - Total number of images
 * @returns AI-generated prompt variation
 */
async function buildImplicitVariationPrompt(
  intent: IntentAnalysis,
  imageIndex: number,
  imageCount: number
): Promise<string> {
  // Use Claude to generate a unique variation
  const client = getAnthropicClient();

  const variationPrompt = `Generate variation ${imageIndex + 1} of ${imageCount} for this prompt: "${intent.basePrompt}"

Keep the core operation EXACTLY the same, but vary ONE aspect to make this variation unique.
Options for variation: angle, pose, lighting, composition, style emphasis.

CRITICAL RULES:
- Do NOT add details not in the original prompt
- Keep it concise (1-2 sentences max)
- Make each variation meaningfully different from others

Respond with ONLY the varied prompt, no explanation or formatting.`;

  try {
    const response = await withRetry(async () => {
      return client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 500,
        messages: [{
          role: "user",
          content: variationPrompt
        }]
      });
    }, `Generate implicit variation ${imageIndex + 1}/${imageCount}`);

    const textBlock = response.content.find(b => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return intent.basePrompt; // Fallback
    }

    return textBlock.text.trim();
  } catch (error) {
    console.error(`[Prompt Generator] Failed to generate implicit variation ${imageIndex + 1}:`, error);
    return intent.basePrompt; // Fallback
  }
}

// =============================================================================
// Main Prompt Generator
// =============================================================================

/**
 * Generate a per-generation prompt based on user intent.
 *
 * Phase 26 Implementation:
 * - UNIFORM: Returns same basePrompt for all images
 * - EXPLICIT_VARIATIONS: Cycles through user-specified variations
 * - IMPLICIT_VARIATIONS: Calls Claude to generate unique variation per image
 *
 * Fallback behavior:
 * - If no userFullPrompt provided: returns folderOperation (Phase 25 behavior)
 * - On any error: returns folderOperation (safe default)
 *
 * @param options - Prompt generation configuration
 * @returns Generated prompt text
 */
export async function generatePerImagePrompt(
  options: PromptGenerationOptions
): Promise<string> {
  const {
    folderOperation,
    userFullPrompt,
    imageCount = 1,
    imageIndex = 0,
    cachedIntent
  } = options;

  try {
    // If no userFullPrompt provided, fall back to Phase 25 behavior
    if (!userFullPrompt) {
      return folderOperation;
    }

    // Get or analyze intent (uses cache)
    const intent = cachedIntent || await getOrAnalyzeIntent(
      folderOperation,
      userFullPrompt,
      imageCount
    );

    // Log intent analysis result
    console.log(`[Prompt Generator] ========== INTENT DEBUG ==========`);
    console.log(`[Prompt Generator] mode=${intent.mode}`);
    console.log(`[Prompt Generator] confidence=${intent.confidence.toFixed(2)}`);
    console.log(`[Prompt Generator] variations count=${intent.variations?.length || 0}`);
    console.log(`[Prompt Generator] variations=${JSON.stringify(intent.variations)}`);
    console.log(`[Prompt Generator] basePrompt (first 60)="${intent.basePrompt?.substring(0, 60)}..."`);
    console.log(`[Prompt Generator] imageIndex=${imageIndex}, imageCount=${imageCount}`);
    console.log(`[Prompt Generator] ===================================`);

    // Generate prompt based on intent mode
    let generatedPrompt: string;
    switch (intent.mode) {
      case 'uniform':
        generatedPrompt = buildUniformPrompt(intent);
        console.log(`[Prompt Generator] UNIFORM mode - returning basePrompt`);
        break;

      case 'explicit-variations':
        generatedPrompt = buildExplicitVariationPrompt(intent, imageIndex);
        console.log(`[Prompt Generator] EXPLICIT mode - variation ${imageIndex}`);
        break;

      case 'implicit-variations':
        generatedPrompt = await buildImplicitVariationPrompt(intent, imageIndex, imageCount);
        console.log(`[Prompt Generator] IMPLICIT mode - variation ${imageIndex}`);
        break;

      default:
        // Exhaustive check - should never reach
        console.warn(`[Prompt Generator] Unknown intent mode: ${(intent as IntentAnalysis).mode}`);
        generatedPrompt = folderOperation;
    }

    console.log(`[Prompt Generator] FINAL PROMPT (first 80): "${generatedPrompt.substring(0, 80)}..."`);
    console.log(`[Prompt Generator] STARTS WITH [POSE: ${generatedPrompt.startsWith('[POSE:') ? 'YES' : 'NO'}`);
    return generatedPrompt;
  } catch (error) {
    // Fallback: Phase 25 behavior (pass-through)
    console.error('[Prompt Generator] Failed, using fallback:', error);
    return folderOperation;
  }
}
