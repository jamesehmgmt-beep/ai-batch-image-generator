// app/api/job/create/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createJob } from '@/lib/job/job-manager';
import { ParsedJobSchema } from '@/lib/ai/schemas/job';
import { ParsedJob } from '@/lib/types/job';
import { v4 as uuidv4 } from 'uuid';
import { generatePerImagePrompt, clearIntentCache } from '@/lib/ai/prompt-generator';

/**
 * POST /api/job/create
 * Create a job from ParsedJob and insert generation records with reference photos
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // Phase 26: Extract userPrompt for intent analysis (backward compatible - defaults to empty string)
    const { sessionId, parsedJob, fileCountByFolder, filesByFolder, referencePhotoUrls, userPrompt } = body;

    // Validation: sessionId
    if (!sessionId || typeof sessionId !== 'string' || sessionId.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid sessionId' },
        { status: 400 }
      );
    }

    // Validation: fileCountByFolder
    if (!fileCountByFolder || typeof fileCountByFolder !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid fileCountByFolder' },
        { status: 400 }
      );
    }

    // Validation: filesByFolder
    if (!filesByFolder || typeof filesByFolder !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid filesByFolder' },
        { status: 400 }
      );
    }

    // Check that filesByFolder has at least some files
    const totalFiles = Object.values(filesByFolder as Record<string, string[]>).flat().length;
    if (totalFiles === 0) {
      console.error('[Job Create] filesByFolder is empty:', filesByFolder);
      return NextResponse.json(
        { success: false, error: 'filesByFolder contains no files. Make sure files were uploaded and folder paths match.' },
        { status: 400 }
      );
    }

    // Validation: referencePhotoUrls (optional array of strings)
    const validatedReferenceUrls: string[] = Array.isArray(referencePhotoUrls)
      ? referencePhotoUrls.filter((url: unknown) => typeof url === 'string' && url.startsWith('http'))
      : [];

    // Validation: parsedJob against schema
    const validation = ParsedJobSchema.safeParse(parsedJob);
    if (!validation.success) {
      console.error('[Job Create] Zod validation failed:', validation.error.issues);
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid parsedJob schema',
          details: validation.error.issues,
        },
        { status: 400 }
      );
    }

    const validatedParsedJob: ParsedJob = validation.data;

    // Ensure parsedJob.understood === true
    if (!validatedParsedJob.understood) {
      return NextResponse.json(
        {
          success: false,
          error: 'Cannot create job: ParsedJob not understood (understood=false)',
        },
        { status: 400 }
      );
    }

    // Ensure parsedJob.job.folders.length > 0
    if (!validatedParsedJob.job || validatedParsedJob.job.folders.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Cannot create job: No folders in ParsedJob',
        },
        { status: 400 }
      );
    }

    // Create the job
    const job = await createJob({
      sessionId,
      parsedJob: validatedParsedJob,
      fileCountByFolder,
    });

    // After creating the job record, create generation records
    // CRITICAL: Populate reference_image_urls NOW so preview page can show them
    const generationRecords: Array<{
      id: string;
      job_id: string;
      folder_path: string;
      operation: string;
      prompt: string;
      state: string;
      source_file_name: string;
      reference_image_urls: string[];
      model: string;
      resolution: string | null;
      aspect_ratio: string;
      photo_mode: string;
      quality: string | null;
      image_size: string | null;
    }> = [];

    // For each folder in the parsed job
    for (const folder of validatedParsedJob.job.folders) {
      // Try exact match first
      let folderFiles = filesByFolder[folder.folderPath] || [];

      // If no match, try case-insensitive matching
      if (folderFiles.length === 0) {
        const lowerFolderPath = folder.folderPath.toLowerCase();
        const matchingKey = Object.keys(filesByFolder).find(
          k => k.toLowerCase() === lowerFolderPath
        );
        if (matchingKey) {
          // console.log(`[Job Create] Case-insensitive match: "${folder.folderPath}" -> "${matchingKey}"`);
          folderFiles = filesByFolder[matchingKey] || [];
        }
      }

      // console.log(`[Job Create] Folder "${folder.folderPath}" has ${folderFiles.length} files`);

      if (folderFiles.length === 0) {
        console.warn(`[Job Create] WARNING: No files found for folder "${folder.folderPath}". Available keys: ${Object.keys(filesByFolder).join(', ')}`);
      }

      // BUGF-04: Filter out excluded files before creating generation records
      const excludedFileNames = folder.excludedFiles || [];
      const validFiles = folderFiles.filter((url: string) => {
        const fileName = url.split('/').pop() || '';
        const isExcluded = excludedFileNames.includes(fileName);
        if (isExcluded) {
          // console.log(`[Job Create] Excluding file "${fileName}" from folder "${folder.folderPath}"`);
        }
        return !isExcluded;
      });

      // console.log(`[Job Create] Folder "${folder.folderPath}": ${folderFiles.length} total files, ${validFiles.length} after exclusions`);

      const photoMode = folder.photoMode || 'reference';

      // Get model from folder config - cast to access model-specific fields
      const folderAny = folder as typeof folder & {
        model?: string;
        quality?: string;
        imageSize?: string;
        generationCount?: number;
      };
      const model = folderAny.model || validatedParsedJob.job?.model || 'nano-banana-pro';
      const isNanoBanana = model === 'nano-banana-pro';

      // Phase 26: Check for generationCount (e.g., "4 variations per image")
      // If set, create that many generations per file (for variations)
      // If not set, default to 1 generation per file
      const generationsPerFile = folderAny.generationCount || 1;

      console.log(`[Job Create] Folder "${folder.folderPath}": ${validFiles.length} files × ${generationsPerFile} variations = ${validFiles.length * generationsPerFile} generations`);
      console.log(`[Job Create] User prompt: "${(userPrompt || '').substring(0, 100)}..."`);

      // Phase 26: imageCount for intent analysis = number of variations requested
      // This tells the prompt generator how many unique prompts to cycle through
      const imageCount = generationsPerFile;

      // For ANALYSIS mode: Include ALL folder files as context for EACH generation
      // This gives kie.ai full context of what's being analyzed
      // For REFERENCE mode: Only include the individual source file

      for (const fileUrl of validFiles) {
        // Extract filename from URL
        const fileName = fileUrl.split('/').pop() || 'unknown';

        let allReferenceUrls: string[];

        if (photoMode === 'analysis') {
          // ANALYSIS MODE: Include ALL valid folder files (excluding excluded ones) as references for context
          // Source file first, then all other files from folder, then user's extra references
          const otherValidFiles = validFiles.filter((f: string) => f !== fileUrl);
          allReferenceUrls = [fileUrl, ...otherValidFiles, ...validatedReferenceUrls].slice(0, 8);
        } else {
          // REFERENCE MODE: Only the source file + user's extra references
          allReferenceUrls = [fileUrl, ...validatedReferenceUrls].slice(0, 8);
        }

        // Create generationsPerFile generations for this file (for variations)
        for (let variationIndex = 0; variationIndex < generationsPerFile; variationIndex++) {
          // Generate per-generation prompt (Phase 26)
          // Intent-based prompt generation with fallback to Phase 25 behavior
          // variationIndex tells the prompt generator which variation to use (0, 1, 2, 3 for 4 variations)
          const generationPrompt = await generatePerImagePrompt({
            folderOperation: folder.operation,
            fileName: fileName,
            imageUrl: fileUrl,
            photoMode: photoMode,
            // Phase 26: Full context for intent analysis
            userFullPrompt: userPrompt || '',
            imageCount: imageCount,
            imageIndex: variationIndex,
          });

          // Log generated prompt for debugging - show end of prompt where variation is
          if (variationIndex === 0 || generationsPerFile > 1) {
            const promptEnd = generationPrompt.length > 80
              ? `...${generationPrompt.substring(generationPrompt.length - 80)}`
              : generationPrompt;
            console.log(`[Job Create] Prompt for ${fileName} var ${variationIndex + 1}: ${promptEnd}`);
          }

          // Log what we're about to store
          console.log(`[Job Create] STORING prompt for ${fileName} var ${variationIndex + 1}:`);
          console.log(`[Job Create]   prompt length: ${generationPrompt.length}`);
          console.log(`[Job Create]   prompt ends with: "...${generationPrompt.slice(-60)}"`);

          generationRecords.push({
            id: uuidv4(), // Explicitly generate UUID
            job_id: job.id,
            folder_path: folder.folderPath,
            operation: folder.operation,
            prompt: generationPrompt,
            state: 'pending',
            source_file_name: fileName,
            // Include appropriate reference images based on photo mode
            reference_image_urls: allReferenceUrls,
            model: model,
            // resolution is NOT NULL in database - use '2K' as default for both models
            resolution: folder.resolution || '2K',
            aspect_ratio: folder.aspectRatio || '1:1',
            photo_mode: photoMode,
            // Seedream-specific fields (nullable in database)
            quality: !isNanoBanana ? (folderAny.quality || 'basic') : null,
            image_size: !isNanoBanana ? (folderAny.imageSize || 'landscape_16_9') : null,
          });
        }
      }
    }

    // Phase 26: Clear intent cache to prevent memory buildup across jobs
    clearIntentCache();

    // Insert all generation records
    const actualGenerationCount = generationRecords.length;
    // console.log(`[Job Create] Total generation records to insert: ${actualGenerationCount}`);

    // Validate we have generations to create
    if (actualGenerationCount === 0) {
      console.error('[Job Create] No generation records created. Folder/file mismatch likely.');
      console.error('[Job Create] parsedJob folders:', validatedParsedJob.job.folders.map(f => f.folderPath));
      console.error('[Job Create] filesByFolder keys:', Object.keys(filesByFolder));

      return NextResponse.json(
        {
          success: false,
          error: 'No generations could be created. Folder paths in your prompt may not match uploaded folders.',
          jobId: job.id,
          details: {
            parsedFolders: validatedParsedJob.job.folders.map(f => f.folderPath),
            uploadedFolders: Object.keys(filesByFolder)
          }
        },
        { status: 400 }
      );
    }

    if (actualGenerationCount > 0) {
      // VERIFY prompts are different before insert
      console.log('[Job Create] ===== VERIFYING PROMPTS BEFORE INSERT =====');
      const promptSample = generationRecords.slice(0, 8).map((r, i) =>
        `  ${i + 1}. ${r.folder_path}/${r.source_file_name}: "${r.prompt?.substring(0, 50)}..."`
      );
      console.log('[Job Create] First 8 prompts:\n' + promptSample.join('\n'));

      const { createServerSupabaseClient } = await import('@/lib/supabase-server');
      const supabase = createServerSupabaseClient();
      // console.log('[Job Create] Inserting generations...');
      const { error: genError } = await supabase
        .from('generations')
        .insert(generationRecords);

      if (genError) {
        console.error('[Job Create] Error creating generations:', genError);
        return NextResponse.json(
          {
            success: false,
            error: `Failed to create generation records: ${genError.message}`,
            jobId: job.id,
            details: {
              attempted: actualGenerationCount,
              errorCode: genError.code
            }
          },
          { status: 500 }
        );
      } else {
        // console.log(`[Job Create] Successfully inserted ${actualGenerationCount} generations`);
      }

      // Update job with accurate generation count (in case it differs from estimate)
      if (actualGenerationCount !== job.total_generations) {
        await supabase
          .from('jobs')
          .update({ total_generations: actualGenerationCount })
          .eq('id', job.id);
      }
    }

    // Return created job with summary (use actual count)
    return NextResponse.json(
      {
        success: true,
        job: {
          id: job.id,
          sessionId: job.session_id,
          totalGenerations: actualGenerationCount,
          estimatedCost: job.estimated_cost,
          state: job.state,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[POST /api/job/create] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
