// app/api/ai/parse/route.ts
// Migrated from Gemini to Claude Sonnet 4.5 in v3.1
import { NextRequest, NextResponse } from 'next/server';
import { parseJobWithClaude } from '@/lib/ai/claude-parser';
import type { ConversationMessage } from '@/lib/types/job';

interface ParseRequest {
  messages: ConversationMessage[];
  folders: string[];
  fileCountByFolder: Record<string, number>;
  promptMode?: 'global' | 'per-folder';
}

/**
 * Validate per-folder mode requirements.
 * When promptMode='per-folder', each folder should have an operation.
 * Returns warnings for folders missing operations (doesn't fail, just warns).
 */
function validatePerFolderMode(
  promptMode: 'global' | 'per-folder',
  parsedJob: { folders?: Array<{ folderPath: string; operation?: string }> },
  uploadedFolders: string[]
): { warnings: string[]; adjustedConfidence: number } {
  const warnings: string[] = [];
  let confidenceReduction = 0;

  if (promptMode !== 'per-folder') {
    return { warnings, adjustedConfidence: 0 };
  }

  const parsedFolders = parsedJob.folders || [];
  const parsedPaths = new Set(parsedFolders.map(f => f.folderPath));

  // Check 1: All uploaded folders should be in parsed result
  for (const folder of uploadedFolders) {
    if (!parsedPaths.has(folder)) {
      warnings.push(`Folder "${folder}" missing from per-folder parse - needs operation`);
      confidenceReduction += 0.1;
    }
  }

  // Check 2: All parsed folders should have operations
  for (const folder of parsedFolders) {
    if (!folder.operation || folder.operation.trim() === '') {
      warnings.push(`Folder "${folder.folderPath}" has no operation in per-folder mode`);
      confidenceReduction += 0.1;
    }
  }

  return { warnings, adjustedConfidence: Math.min(confidenceReduction, 0.3) };
}

export async function POST(request: NextRequest) {
  try {
    const body: ParseRequest = await request.json();
    const { messages, folders, fileCountByFolder, promptMode = 'global' } = body;

    // console.log('[AI Parse] Using Claude Sonnet 4.5 with extended thinking');
    // console.log('[AI Parse] promptMode:', promptMode);
    // console.log('[AI Parse] folders:', folders);

    // Validate request
    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { error: 'Messages array is required' },
        { status: 400 }
      );
    }

    if (!folders || folders.length === 0) {
      return NextResponse.json(
        { error: 'Folders array is required - upload files first' },
        { status: 400 }
      );
    }

    // Parse with Claude (makes one API call per folder)
    const { parsed, usage } = await parseJobWithClaude(
      messages,
      folders,
      fileCountByFolder,
      promptMode
    );

    // Validate per-folder mode requirements
    const { warnings, adjustedConfidence } = validatePerFolderMode(
      promptMode,
      parsed.job || {},
      folders
    );

    if (warnings.length > 0) {
      console.warn('[AI Parse] Per-folder validation warnings:', warnings);
      // Reduce confidence if validation issues found
      if (parsed.confidence !== undefined && adjustedConfidence > 0) {
        parsed.confidence = Math.max(0, parsed.confidence - adjustedConfidence);
        // console.log('[AI Parse] Adjusted confidence to:', parsed.confidence);
      }
    }

    return NextResponse.json({
      parsed,
      usage,
    });
  } catch (error) {
    console.error('[AI Parse] Error:', error);

    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      // Handle rate limiting
      if (message.includes('429') || message.includes('rate limit') || message.includes('quota')) {
        return NextResponse.json(
          { error: 'Rate limited. Please wait a moment and try again.' },
          { status: 429 }
        );
      }

      // Handle network errors
      if (message.includes('fetch failed') || message.includes('network') || message.includes('econnrefused')) {
        return NextResponse.json(
          { error: 'Network error connecting to AI service. Please check your internet connection and try again.' },
          { status: 503 }
        );
      }

      // Handle model not found (invalid model ID)
      if (message.includes('404') || message.includes('not found') || message.includes('model')) {
        console.error('[AI Parse] Model error - check CLAUDE_MODEL constant');
        return NextResponse.json(
          { error: 'AI model configuration error. Please contact support.' },
          { status: 500 }
        );
      }

      // Handle overloaded API (Claude-specific)
      if (message.includes('overloaded') || message.includes('529')) {
        return NextResponse.json(
          { error: 'AI service is temporarily overloaded. Please try again in a few seconds.' },
          { status: 503 }
        );
      }

      // Handle API key issues
      if (message.includes('api key') || message.includes('unauthorized') || message.includes('401')) {
        return NextResponse.json(
          { error: 'AI service authentication error. Please check API key configuration.' },
          { status: 401 }
        );
      }
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to parse prompt' },
      { status: 500 }
    );
  }
}
