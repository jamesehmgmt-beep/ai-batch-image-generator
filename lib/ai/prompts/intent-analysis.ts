// lib/ai/prompts/intent-analysis.ts
// Purpose: Intent analysis types and system prompt for Phase 26 AI prompt generation

/**
 * IntentMode - Discriminated string union for user intent classification
 *
 * - 'uniform': Same prompt for all images (most common use case)
 * - 'explicit-variations': User specified what varies (e.g., "front, back, side views")
 * - 'implicit-variations': User wants variations but didn't specify what
 */
export type IntentMode = 'uniform' | 'explicit-variations' | 'implicit-variations';

/**
 * IntentAnalysis - Result of analyzing user intent for prompt generation
 */
export interface IntentAnalysis {
  /** The detected intent mode */
  mode: IntentMode;
  /** Confidence score from 0.0 to 1.0 */
  confidence: number;
  /** Core operation extracted from user prompt (without embellishments) */
  basePrompt: string;
  /** Specific variations (only for explicit-variations mode) */
  variations?: string[];
  /** Extended thinking reasoning (for debugging) */
  reasoning?: string;
}

/**
 * Build the system prompt for Claude to analyze user intent
 *
 * Uses XML tags for structured prompting following Claude 4.5 best practices.
 * CRITICAL: Defaults to "uniform" mode when intent is ambiguous.
 *
 * @param folderOperation - The operation string from folder parsing
 * @param userFullPrompt - The complete user prompt
 * @param imageCount - Number of images in the folder
 * @returns Structured prompt for Claude intent analysis
 */
export function buildIntentAnalysisPrompt(
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
UNIFORM examples (mode: "uniform"):
- "put each hijab on a woman's head" -> same prompt for all
- "swap faces to Arab women" -> same prompt for all
- "replace background with cream color" -> same prompt for all
- "make product photos on white background" -> same prompt for all
- "add shadows to each image" -> same prompt for all

EXPLICIT_VARIATIONS examples (mode: "explicit-variations"):
- "front, back, side views" -> variations: ["front view", "back view", "side view"]
- "angles: 0, 45, 90, 135 degrees" -> variations: ["0 degrees", "45 degrees", "90 degrees", "135 degrees"]
- "folder 5: casual, formal, sporty" -> variations: ["casual style", "formal style", "sporty style"]
- "show morning, afternoon, evening lighting" -> variations: ["morning lighting", "afternoon lighting", "evening lighting"]
- "Create 4 variations showing: 1) forward facing pose, 2) back facing pose, 3) side facing pose, 4) sitting down pose" -> variations: ["forward facing pose", "back facing pose", "side facing pose", "sitting down pose"]
- "generate with poses: standing, walking, sitting, lying down" -> variations: ["standing pose", "walking pose", "sitting pose", "lying down pose"]

IMPORTANT for explicit-variations:
- EXTRACT the variation list SEPARATELY from the base operation
- The basePrompt should NOT include the variation list - it should be the operation WITHOUT "1) X, 2) Y, 3) Z"
- Example: "Make product photos with poses: 1) front, 2) back, 3) side"
  - basePrompt: "Make product photos" (WITHOUT the poses list)
  - variations: ["front pose", "back pose", "side pose"]

IMPLICIT_VARIATIONS examples (mode: "implicit-variations"):
- "generate 5 variations" -> AI decides 5 different approaches
- "make different versions" -> AI creates meaningful variations
- "create unique variations for each" -> AI determines what varies
</examples>

<critical_rules>
1. DEFAULT TO "uniform" IF AMBIGUOUS - most users want same operation on all images
2. Only use "explicit-variations" if user CLEARLY lists what varies (e.g., "front, back, side" or "1) X, 2) Y, 3) Z")
3. Only use "implicit-variations" if user explicitly says "variations" or "different versions" without specifying what
4. Extract basePrompt from the folder_operation WITHOUT adding creative embellishments
5. DO NOT add details not present in user's prompt (no hallucinated lighting, poses, clothing, etc.)
6. If confidence < 0.7, the caller will force mode to "uniform" - be conservative
7. CRITICAL FOR EXPLICIT-VARIATIONS: The basePrompt must EXCLUDE the variation list!
   - If user says "Create photos with: 1) front pose, 2) back pose, 3) side pose"
   - basePrompt = "Create photos" (no poses)
   - variations = ["front pose", "back pose", "side pose"]
   - Each generation will get: "Create photos, front pose" or "Create photos, back pose" etc.
8. Look for numbered lists (1), 2), 3) or a), b), c)) as signals for explicit-variations
9. Look for "showing:", "with:", "including:" followed by a list as signals for explicit-variations
</critical_rules>

<confidence_guidance>
- 0.9-1.0: Crystal clear intent, exact match to examples
- 0.7-0.9: Clear intent with minor interpretation needed
- 0.5-0.7: Ambiguous - will be forced to uniform by caller
- Below 0.5: Very unclear - definitely forced to uniform
</confidence_guidance>

<output_format>
Respond with ONLY a valid JSON object. No markdown code blocks. No explanations.

{
  "mode": "uniform" | "explicit-variations" | "implicit-variations",
  "confidence": 0.0-1.0,
  "basePrompt": "exact operation extracted from user prompt",
  "variations": ["var1", "var2", "var3"]  // ONLY for explicit-variations mode, omit otherwise
}
</output_format>

<reminder>
When in doubt, choose "uniform" with high confidence. It's better to apply the same operation consistently than to introduce unwanted variations.
</reminder>`;
}
