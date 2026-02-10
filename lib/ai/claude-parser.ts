// lib/ai/claude-parser.ts
// Claude Sonnet 4.5 parser with extended thinking
import { getAnthropicClient, CLAUDE_MODEL, withRetry } from './anthropic';
import { ParsedJobSchema } from './schemas/job';
import type { ConversationMessage } from '@/lib/types/job';
import { z } from 'zod';

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
    imageOperations?: Array<{
      fileName: string;
      model?: string;
      operation?: string;
      resolution?: string;
      quality?: string;
      imageSize?: string;
      photoMode?: string;
      aspectRatio?: string;
      generationCount?: number;
    }>;
    generationCount?: number;
  };
}

/**
 * Build comprehensive system prompt for parsing a single folder
 */
function buildFolderParserPrompt(
  folderPath: string,
  fileCount: number,
  userPrompt: string
): string {
  return `You are an AI assistant that parses natural language prompts into structured image generation jobs for a bulk image processing tool.

## Current Folder
You are parsing instructions for folder "${folderPath}" which contains ${fileCount} images.

## User's Full Prompt
"${userPrompt}"

## Your Task
Extract the instructions that apply to folder "${folderPath}" from the user's prompt. Match folder references flexibly - "folder 5", "folder named '5'", "the 5 folder" all refer to folder "5".

## Photo Modes
There are two modes for how source images are used:

**Reference Mode** (photoMode: "reference")
- The source photo is sent directly to the API as a visual reference image
- Use for: face swapping, style transfer, pose matching, background replacement
- Example: "swap faces in folder 5 to Arab women" → reference

**Analysis Mode** (photoMode: "analysis")
- AI analyzes each source photo first and describes what's in it
- That description becomes part of the prompt sent to the API
- Use for: "put this [item] on a model", "describe and recreate"
- Example: "put the dress from this photo onto a model" → analysis

**Mode Inference Rules:**
- "swap faces", "face swap" → reference
- "same pose as", "use face from" → reference
- "put [item] on model" → analysis
- "replace background", "change setting" → reference
- When unclear, default to "reference"

## Models Available

### nano-banana-pro (Default)
- **resolution**: "1K", "2K", or "4K" (default: "2K")
- **aspectRatio**: "1:1", "3:4", "4:3", "9:16", "16:9", "auto", etc.
- Good for: face swaps, general editing
- DO NOT include quality or imageSize fields

### seedream-4.5-edit
- **quality**: "basic" or "high" (default: "basic")
- **imageSize**: "square_1_1", "portrait_3_4", "portrait_9_16", "landscape_4_3", "landscape_16_9"
- Good for: product photos, detailed compositions
- DO NOT include resolution field
- When user says "4k" or "high quality", set quality: "high"
- When user says "3:4", set imageSize: "portrait_3_4"

**Aspect Ratio to imageSize mapping for Seedream:**
- 1:1 → "square_1_1"
- 3:4 → "portrait_3_4"
- 9:16 → "portrait_9_16"
- 4:3 → "landscape_4_3"
- 16:9 → "landscape_16_9"

## File Exclusions
If user says "except X.jpg" or "skip Y.jpg" or "not X.jpg", add those files to excludedFiles array.
Parse ALL excluded files mentioned for this folder. Examples:
- "except no.jpg and test.jpg" → excludedFiles: ["no.jpg", "test.jpg"]
- "skip the first image" → ask for clarification (can't determine filename)

## Generation Count (IMPORTANT for variations)
Set generationCount when user wants multiple outputs per input image:
- "4 variations" or "create 4 different poses" → generationCount: 4
- "1) front, 2) back, 3) side, 4) sitting" → generationCount: 4 (count the items!)
- "front, back, and side views" → generationCount: 3
- "make 5 images per photo" → generationCount: 5
- "generate 3 angles" → generationCount: 3

If not specified, leave generationCount as null (system will default to 1 per input image).

CRITICAL: When you see numbered lists like "1) X, 2) Y, 3) Z, 4) W" or comma-separated variations, COUNT THEM and set generationCount accordingly.

## Response Format
You MUST respond with ONLY a valid JSON object. No markdown, no code blocks, no explanations outside the JSON.

{
  "understood": true,
  "confidence": 0.95,
  "interpretation": "Process all ${fileCount} images in folder '${folderPath}', [describe operation]. Using [model] at [settings].",
  "folderOperation": {
    "folderPath": "${folderPath}",
    "operation": "The actual prompt/operation to perform",
    "model": "nano-banana-pro",
    "photoMode": "reference",
    "aspectRatio": "auto",
    "resolution": "2K",
    "excludedFiles": [],
    "generationCount": null
  }
}

For Seedream model, use this structure instead:
{
  "folderOperation": {
    "folderPath": "${folderPath}",
    "operation": "The actual prompt/operation to perform",
    "model": "seedream-4.5-edit",
    "photoMode": "analysis",
    "aspectRatio": "3:4",
    "quality": "basic",
    "imageSize": "portrait_3_4",
    "excludedFiles": [],
    "generationCount": null
  }
}

## When to set understood=false
Set understood=false and provide clarifyingQuestions if:
- The prompt doesn't mention this folder at all
- The operation is unclear (e.g., "process the images" - process how?)
- A referenced file for exclusion doesn't make sense

**IMPORTANT: If the user's prompt doesn't mention folder "${folderPath}" at all, you MUST return:**
{
  "understood": false,
  "confidence": 0.1,
  "interpretation": "The prompt does not specify what to do with folder '${folderPath}'.",
  "clarifyingQuestions": [
    {
      "question": "What would you like to do with folder '${folderPath}' (${fileCount} images)?",
      "options": ["Swap faces", "Replace background", "Create product photos", "Skip this folder"]
    }
  ]
}

**Do NOT return undefined or null for the interpretation. Always provide a clear message.**

Example clarifying question for unclear operation:
{
  "understood": false,
  "confidence": 0.3,
  "interpretation": "You want to process folder '${folderPath}' but the operation is unclear.",
  "clarifyingQuestions": [
    {
      "question": "What operation would you like to perform on folder '${folderPath}'?",
      "options": ["Swap faces", "Replace background", "Put on model", "Other"]
    }
  ]
}

IMPORTANT:
- Respond with ONLY the JSON object. No other text.
- NEVER set interpretation to null or undefined. Always provide a string.`;
}

/**
 * Parse a single folder's instructions using Claude Sonnet 4.5 with extended thinking
 */
async function parseSingleFolderWithClaude(
  folderPath: string,
  fileCount: number,
  userPrompt: string
): Promise<FolderParseResult> {
  const client = getAnthropicClient();
  const prompt = buildFolderParserPrompt(folderPath, fileCount, userPrompt);

  // console.log(`[Claude] Parsing folder "${folderPath}" (${fileCount} images)`);

  const response = await withRetry(async () => {
    return client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      thinking: {
        type: "enabled",
        budget_tokens: 10000
      },
      // Note: temperature is NOT set - incompatible with extended thinking
      messages: [{
        role: "user",
        content: prompt
      }]
    });
  }, `Parse folder ${folderPath}`);

  // Extract text content from response (skip thinking blocks)
  let textContent = '';
  for (const block of response.content) {
    if (block.type === "text") {
      textContent = block.text;
      break;
    }
  }

  // console.log(`[Claude] Raw response for folder "${folderPath}":`, textContent.substring(0, 500));

  try {
    // Clean up the response - remove any markdown code blocks if present
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

    // Normalize the response
    if (parsed.folderOperation) {
      // Ensure folderPath is set
      parsed.folderOperation.folderPath = folderPath;

      // Default model if not set
      if (!parsed.folderOperation.model) {
        parsed.folderOperation.model = 'nano-banana-pro';
      }

      // Apply model-specific defaults
      if (parsed.folderOperation.model === 'nano-banana-pro') {
        if (!parsed.folderOperation.resolution) {
          parsed.folderOperation.resolution = '2K';
        }
        // Normalize resolution to uppercase
        parsed.folderOperation.resolution = parsed.folderOperation.resolution.toUpperCase();
        // Clear Seedream-specific fields
        parsed.folderOperation.quality = undefined;
        parsed.folderOperation.imageSize = undefined;
      } else if (parsed.folderOperation.model === 'seedream-4.5-edit') {
        if (!parsed.folderOperation.quality) {
          parsed.folderOperation.quality = 'basic';
        }
        if (!parsed.folderOperation.imageSize) {
          // Map aspectRatio to imageSize
          const aspectToSize: Record<string, string> = {
            '1:1': 'square_1_1',
            '3:4': 'portrait_3_4',
            '9:16': 'portrait_9_16',
            '4:3': 'landscape_4_3',
            '16:9': 'landscape_16_9',
            'auto': 'landscape_16_9',
          };
          parsed.folderOperation.imageSize = aspectToSize[parsed.folderOperation.aspectRatio || 'auto'] || 'landscape_16_9';
        }
        // Clear Nano-specific fields
        parsed.folderOperation.resolution = undefined;
      }

      // Default photoMode
      if (!parsed.folderOperation.photoMode) {
        parsed.folderOperation.photoMode = 'reference';
      }

      // Default aspectRatio
      if (!parsed.folderOperation.aspectRatio) {
        parsed.folderOperation.aspectRatio = 'auto';
      }

      // Ensure excludedFiles is an array
      if (!parsed.folderOperation.excludedFiles) {
        parsed.folderOperation.excludedFiles = [];
      }

      // Normalize excludedFiles - ensure it's always an array of strings
      if (!Array.isArray(parsed.folderOperation.excludedFiles)) {
        parsed.folderOperation.excludedFiles = [];
      }

      // Convert null generationCount to undefined (Zod schema expects number | undefined, not null)
      if (parsed.folderOperation.generationCount === null) {
        parsed.folderOperation.generationCount = undefined;
      }
    }

    // Ensure interpretation is never undefined
    if (!parsed.interpretation || parsed.interpretation === 'undefined') {
      if (parsed.understood && parsed.folderOperation) {
        parsed.interpretation = `Process folder '${folderPath}' with operation: ${parsed.folderOperation.operation}`;
      } else {
        parsed.interpretation = `Unable to determine what to do with folder '${folderPath}'. Please clarify.`;
        parsed.understood = false;
        parsed.clarifyingQuestions = parsed.clarifyingQuestions || [{
          question: `What would you like to do with folder "${folderPath}"?`,
          options: ['Face swap', 'Background replacement', 'Product photo', 'Skip this folder']
        }];
      }
    }

    // console.log(`[Claude] Parsed folder "${folderPath}": understood=${parsed.understood}, confidence=${parsed.confidence}`);
    return parsed;
  } catch (e) {
    console.error(`[Claude] Failed to parse JSON for folder ${folderPath}:`, e);
    console.error(`[Claude] Raw text was:`, textContent);
    return {
      folderPath,
      understood: false,
      confidence: 0,
      interpretation: `Failed to parse AI response for folder ${folderPath}. Please try rephrasing your request.`,
      clarifyingQuestions: [{
        question: `What would you like to do with folder "${folderPath}"?`,
        options: ['Face swap', 'Background replacement', 'Product photo', 'Other']
      }]
    };
  }
}

/**
 * Parse job with per-folder API calls using Claude Sonnet 4.5 with extended thinking
 */
export async function parseJobWithClaude(
  messages: ConversationMessage[],
  folders: string[],
  fileCountByFolder: Record<string, number>,
  promptMode: 'global' | 'per-folder' = 'global'
): Promise<{ parsed: ParsedJob; usage: { inputTokens: number; outputTokens: number } }> {
  // Get the user's prompt from messages
  const userMessages = messages.filter(m => m.role === 'user');
  const userPrompt = userMessages.map(m => m.content).join('\n');

  // console.log(`[Claude] ========================================`);
  // console.log(`[Claude] Parsing ${folders.length} folders with Claude Sonnet 4.5 (Extended Thinking)`);
  // console.log(`[Claude] User prompt: "${userPrompt.substring(0, 200)}..."`);
  // console.log(`[Claude] Folders:`, folders);
  // console.log(`[Claude] ========================================`);

  // Parse each folder individually (one API call per folder)
  // Process sequentially to avoid rate limits
  const folderResults: FolderParseResult[] = [];
  for (const folder of folders) {
    const result = await parseSingleFolderWithClaude(folder, fileCountByFolder[folder] || 0, userPrompt);
    folderResults.push(result);
  }

  // Aggregate results
  const allUnderstood = folderResults.every(r => r.understood);
  const avgConfidence = folderResults.reduce((sum, r) => sum + r.confidence, 0) / folderResults.length;
  const allQuestions = folderResults.flatMap(r => r.clarifyingQuestions || []);

  // Build folder operations
  const folderOperations = folderResults
    .filter(r => r.folderOperation)
    .map(r => r.folderOperation!);

  // Build interpretation
  const interpretations = folderResults.map(r =>
    `${r.folderPath}: ${r.interpretation}`
  ).join('\n');

  // Determine primary model
  const modelCounts = folderOperations.reduce((acc, op) => {
    acc[op.model] = (acc[op.model] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const primaryModel = Object.entries(modelCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'nano-banana-pro';

  // console.log(`[Claude] ========================================`);
  // console.log(`[Claude] Aggregated results:`);
  // console.log(`[Claude] - All understood: ${allUnderstood}`);
  // console.log(`[Claude] - Avg confidence: ${avgConfidence}`);
  // console.log(`[Claude] - Folder operations: ${folderOperations.length}`);
  // console.log(`[Claude] - Primary model: ${primaryModel}`);
  // console.log(`[Claude] ========================================`);

  // Build the raw parsed object for Zod validation
  const rawParsed = {
    understood: allUnderstood && folderOperations.length > 0,
    confidence: avgConfidence,
    interpretation: interpretations,
    clarifyingQuestions: allQuestions.length > 0 ? allQuestions.slice(0, 3) : undefined,
    job: folderOperations.length > 0 ? {
      promptMode,
      folders: folderOperations.map(op => ({
        folderPath: op.folderPath,
        operation: op.operation,
        model: op.model,
        photoMode: op.photoMode,
        aspectRatio: op.aspectRatio || 'auto',
        resolution: op.model === 'nano-banana-pro' ? (op.resolution || '2K') : undefined,
        quality: op.model === 'seedream-4.5-edit' ? (op.quality || 'basic') : undefined,
        imageSize: op.model === 'seedream-4.5-edit' ? (op.imageSize || 'landscape_16_9') : undefined,
        excludedFiles: op.excludedFiles || [],
        imageOperations: op.imageOperations,
        generationCount: op.generationCount,
      })),
      model: primaryModel,
      outputFormat: 'PNG',
    } : undefined,
  };

  // Validate with Zod
  const validated = ParsedJobSchema.safeParse(rawParsed);
  if (!validated.success) {
    console.error('[Claude] Schema validation failed:', validated.error.issues);
    // Return raw with reduced confidence
    return {
      parsed: {
        ...rawParsed,
        confidence: Math.max(0, avgConfidence - 0.3),
      } as ParsedJob,
      usage: {
        inputTokens: folders.length * 500,
        outputTokens: folders.length * 200,
      },
    };
  }

  // console.log(`[Claude] Schema validation passed!`);

  return {
    parsed: validated.data,
    usage: {
      inputTokens: folders.length * 500, // Estimate
      outputTokens: folders.length * 200, // Estimate
    },
  };
}
