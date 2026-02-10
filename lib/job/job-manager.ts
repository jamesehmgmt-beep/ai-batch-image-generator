// lib/job/job-manager.ts
import { v4 as uuidv4 } from 'uuid';
import { ParsedJob } from '@/lib/types/job';
import { JobRecord, GenerationJob, GenerationRecord } from '@/lib/types/generation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { calculateCostEstimate } from './cost-estimation';
import { DEFAULT_MODEL, getModelStrategy } from '@/lib/models';
import { ModelId } from '@/lib/models/types';
import { buildFinalPrompt, PromptCombinationMode } from './prompt-builder';
import { calculateGenerationCount } from './generation-count';

/**
 * Build Supabase storage URL for a file
 */
function buildStorageUrl(sessionId: string, folderPath: string, fileName: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  // Clean and encode path components
  const encodedFolder = encodeURIComponent(folderPath);
  const encodedFile = encodeURIComponent(fileName);
  return `${supabaseUrl}/storage/v1/object/public/images/${sessionId}/${encodedFolder}/${encodedFile}`;
}

/**
 * Create a job record from ParsedJob
 * @returns Created job record with id
 */
export async function createJob(params: {
  sessionId: string;
  parsedJob: ParsedJob;
  fileCountByFolder: Record<string, number>;
}): Promise<JobRecord> {
  const { sessionId, parsedJob, fileCountByFolder } = params;
  const supabase = createServerSupabaseClient();

  // Validate that job is understood and has folders
  if (!parsedJob.understood || !parsedJob.job) {
    throw new Error('Cannot create job: ParsedJob not understood or missing job data');
  }

  // Calculate cost estimate
  const costBreakdown = calculateCostEstimate(parsedJob.job.folders, fileCountByFolder);

  // Calculate total generations using shared logic
  let totalGenerations = 0;
  for (const folder of parsedJob.job.folders) {
    totalGenerations += calculateGenerationCount(
      {
        generationCount: (folder as any).generationCount,
        imageOperations: (folder as any).imageOperations,
        excludedFiles: folder.excludedFiles,
      },
      fileCountByFolder[folder.folderPath] || 0
    );
  }

  // Insert into jobs table
  const { data, error } = await supabase
    .from('jobs')
    .insert({
      session_id: sessionId,
      parsed_job: parsedJob as any, // JSONB type
      estimated_cost: costBreakdown.estimatedCost,
      total_generations: totalGenerations,
      state: 'pending',
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create job: ${error.message}`);
  }

  return data as JobRecord;
}

/**
 * Type assertion interface for job with prompt mode fields
 */
interface JobWithPromptMode {
  promptMode?: 'global' | 'per-folder';
  globalPromptMode?: string;
  globalPrompt?: string;
  outputFormat?: string;
  folders: Array<{
    folderPath: string;
    operation?: string;
    excludedFiles?: string[];
    model?: string;
    resolution?: string;
    aspectRatio?: string;
    photoMode?: string;
    // Seedream-specific fields
    quality?: 'basic' | 'high';
    imageSize?: string;
    // Per-image operations (PIMG-03)
    imageOperations?: Array<{
      fileName: string;
      model: string;
      operation?: string;
      // Nano Banana fields
      resolution?: string;
      // Seedream fields
      quality?: 'basic' | 'high';
      imageSize?: string;
    }>;
  }>;
}

/**
 * Expand job into individual generation records
 * @param params.additionalReferenceUrls - Extra reference photos (e.g., face for swapping) to add to all generations
 * @returns Array of GenerationJob objects created
 */
export async function expandJobToGenerations(params: {
  jobId: string;
  parsedJob: ParsedJob;
  filesByFolder: Record<string, string[]>;
  additionalReferenceUrls?: string[]; // User-uploaded reference photos for face swapping, etc.
}): Promise<GenerationJob[]> {
  const { jobId, parsedJob, filesByFolder, additionalReferenceUrls = [] } = params;
  const supabase = createServerSupabaseClient();

  // Validate that job exists
  if (!parsedJob.job) {
    throw new Error('Cannot expand job: Missing job data in ParsedJob');
  }

  const generationJobs: GenerationJob[] = [];
  const generationRecords: any[] = [];

  // Get prompt mode and combination mode from parsed job with proper type assertion
  const jobWithMode = parsedJob.job as unknown as JobWithPromptMode;
  const promptMode = jobWithMode.promptMode || 'global';
  const combinationMode: PromptCombinationMode = (jobWithMode.globalPromptMode as PromptCombinationMode) || 'prefix';

  // console.log(`[JobManager] promptMode=${promptMode}, combinationMode=${combinationMode}, hasGlobalPrompt=${!!jobWithMode.globalPrompt}`);

  // Process each folder
  for (const folder of parsedJob.job.folders) {
    const folderPath = folder.folderPath;
    const fileUrls = filesByFolder[folderPath] || [];

    // Cast to access imageOperations
    const folderWithOps = folder as any;

    // PIMG-03: Handle per-image operations BEFORE other logic
    if (folderWithOps.imageOperations && Array.isArray(folderWithOps.imageOperations)) {
      const previousCount = generationJobs.length;

      // Build final operation for folder (used as fallback if imageOperation doesn't specify operation)
      const folderOperation = buildFinalPrompt(
        jobWithMode.globalPrompt,
        folder.operation,
        combinationMode
      );

      // Process each imageOperation
      for (const imgOp of folderWithOps.imageOperations) {
        // Find matching file URL (case-insensitive)
        const matchingUrl = fileUrls.find((url) => {
          const fileName = url.split('/').pop() || '';
          return fileName.toLowerCase() === imgOp.fileName.toLowerCase();
        });

        if (!matchingUrl) {
          console.warn(`[JobManager] imageOperation file not found: ${imgOp.fileName} in folder ${folderPath}`);
          continue;
        }

        // Get model from imageOperation
        const model: ModelId = imgOp.model || DEFAULT_MODEL;
        const strategy = getModelStrategy(model);
        const maxRefs = strategy.capabilities.maxReferenceImages;

        // Use imageOperation's operation if specified, otherwise fall back to folder operation
        const operation = imgOp.operation || folderOperation;

        if (!operation || operation.trim() === '') {
          console.warn(`[JobManager] Empty operation for imageOperation ${imgOp.fileName} - skipping`);
          continue;
        }

        // Build generation with per-image settings
        const generationId = uuidv4();
        const fileName = matchingUrl.split('/').pop() || '';
        const allReferenceUrls = [matchingUrl, ...additionalReferenceUrls].slice(0, maxRefs);

        const generationJob: GenerationJob = {
          id: generationId,
          jobId,
          folderPath,
          operation,
          model,
          // Use imageOperation settings with folder fallbacks
          resolution: imgOp.resolution || folder.resolution,
          aspectRatio: folder.aspectRatio,
          photoMode: folder.photoMode,
          outputFormat: (jobWithMode.outputFormat as 'PNG' | 'JPG') || 'PNG',
          referenceImageUrls: allReferenceUrls,
          sourceFileName: fileName,
          quality: imgOp.quality || folder.quality,
          imageSize: imgOp.imageSize || folder.imageSize,
        };

        generationJobs.push(generationJob);

        generationRecords.push({
          id: generationId,
          job_id: jobId,
          folder_path: folderPath,
          operation,
          state: 'pending',
          source_file_name: fileName,
          reference_image_urls: allReferenceUrls,
          model,
          resolution: imgOp.resolution || folder.resolution,
          aspect_ratio: folder.aspectRatio,
          photo_mode: folder.photoMode,
          quality: imgOp.quality || folder.quality,
          image_size: imgOp.imageSize || folder.imageSize,
          retry_count: 0,
        });
      }

      const generatedCount = generationJobs.length - previousCount;
      // console.log(`[JobManager] Folder ${folderPath}: processed ${folderWithOps.imageOperations.length} imageOperations, created ${generatedCount} generations`);

      // Skip normal folder processing when imageOperations is specified
      continue;
    }

    // Filter out excluded files
    const excludedFileNames = folder.excludedFiles || [];
    const validUrls = fileUrls.filter((url) => {
      const fileName = url.split('/').pop() || '';
      return !excludedFileNames.includes(fileName);
    });

    // PRMT-01: Enforce mutual exclusivity
    // In per-folder mode, folders MUST have their own operations
    // globalPrompt can still exist (for combination) but folder.operation is required
    if (promptMode === 'per-folder' && !folder.operation) {
      console.warn(`[JobManager] PRMT-01 violation: Folder "${folderPath}" in per-folder mode has no operation - skipping`);
      continue; // Skip folders without operations in per-folder mode
    }

    // Validate we have at least one prompt source (for any mode)
    if (!jobWithMode.globalPrompt && !folder.operation) {
      console.warn(`[JobManager] Folder ${folderPath} has no operation and no globalPrompt - skipping`);
      continue;
    }

    // Build final operation using prompt combination logic
    // This replaces simple fallback (||) with explicit combination modes
    const operation = buildFinalPrompt(
      jobWithMode.globalPrompt,
      folder.operation,
      combinationMode
    );

    // console.log(`[JobManager] Folder ${folderPath}: operation="${operation.substring(0, 50)}..."`);

    // Sanity check: operation should never be empty after buildFinalPrompt
    if (!operation || operation.trim() === '') {
      throw new Error(`Empty operation for folder ${folderPath} - this should not happen after validation`);
    }

    // Get model from folder config, fall back to DEFAULT_MODEL
    const model: ModelId = (folder as any).model || DEFAULT_MODEL;
    const strategy = getModelStrategy(model);
    const maxRefs = strategy.capabilities.maxReferenceImages;

    // Check if user specified a generation count
    const generationCount = (folder as any).generationCount as number | undefined;

    if (generationCount && generationCount > 0) {
      // User specified exact number of generations (e.g., "make 5 images")
      // Only use explicitly added reference photos, NOT all folder images
      // This prevents folder images from becoming references for wrong generations
      const explicitRefs = additionalReferenceUrls.slice(0, maxRefs);

      for (let i = 0; i < generationCount; i++) {
        const generationId = uuidv4();
        const sourceFileName = `generation-${i + 1}`;

        const generationJob: GenerationJob = {
          id: generationId,
          jobId,
          folderPath,
          operation,
          model,
          resolution: folder.resolution,
          aspectRatio: folder.aspectRatio,
          photoMode: folder.photoMode,
          outputFormat: (jobWithMode.outputFormat as 'PNG' | 'JPG') || 'PNG',
          referenceImageUrls: explicitRefs, // Only user-added references
          sourceFileName,
          quality: folder.quality,
          imageSize: folder.imageSize,
        };

        generationJobs.push(generationJob);

        generationRecords.push({
          id: generationId,
          job_id: jobId,
          folder_path: folderPath,
          operation,
          state: 'pending',
          source_file_name: sourceFileName,
          reference_image_urls: explicitRefs, // Only user-added references
          model,
          resolution: folder.resolution,
          aspect_ratio: folder.aspectRatio,
          photo_mode: folder.photoMode,
          quality: folder.quality,
          image_size: folder.imageSize,
          retry_count: 0,
        });
      }
    } else {
      // Default behavior: 1 generation per input image
      for (const fileUrl of validUrls) {
        const fileName = fileUrl.split('/').pop() || '';
        const generationId = uuidv4();

        // Combine source file URL with additional reference URLs
        // Slice to model-specific max reference images
        const allReferenceUrls = [fileUrl, ...additionalReferenceUrls].slice(0, maxRefs);

        const generationJob: GenerationJob = {
          id: generationId,
          jobId,
          folderPath,
          operation,
          model,
          resolution: folder.resolution,
          aspectRatio: folder.aspectRatio,
          photoMode: folder.photoMode,
          outputFormat: (jobWithMode.outputFormat as 'PNG' | 'JPG') || 'PNG',
          referenceImageUrls: allReferenceUrls,
          sourceFileName: fileName,
          quality: folder.quality,
          imageSize: folder.imageSize,
        };

        generationJobs.push(generationJob);

        generationRecords.push({
          id: generationId,
          job_id: jobId,
          folder_path: folderPath,
          operation,
          state: 'pending',
          source_file_name: fileName,
          reference_image_urls: allReferenceUrls,
          model,
          resolution: folder.resolution,
          aspect_ratio: folder.aspectRatio,
          photo_mode: folder.photoMode,
          quality: folder.quality,
          image_size: folder.imageSize,
          retry_count: 0,
        });
      }
    }
  }

  // Batch insert all generation records
  if (generationRecords.length > 0) {
    const { error } = await supabase.from('generations').insert(generationRecords);

    if (error) {
      throw new Error(`Failed to insert generation records: ${error.message}`);
    }
  }

  // console.log(`[JobManager] Expanded job: ${generationJobs.length} generations, promptMode=${promptMode}`);

  return generationJobs;
}

/**
 * Get job summary with generation counts
 */
export async function getJobSummary(jobId: string): Promise<{
  job: JobRecord;
  generations: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  };
}> {
  const supabase = createServerSupabaseClient();

  // Query job record
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (jobError) {
    throw new Error(`Failed to fetch job: ${jobError.message}`);
  }

  // Query generation counts by state
  const { data: generations, error: genError } = await supabase
    .from('generations')
    .select('state')
    .eq('job_id', jobId);

  if (genError) {
    throw new Error(`Failed to fetch generations: ${genError.message}`);
  }

  // Count by state
  const counts = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
  };

  for (const gen of generations || []) {
    if (gen.state in counts) {
      counts[gen.state as keyof typeof counts]++;
    }
  }

  return {
    job: job as JobRecord,
    generations: counts,
  };
}

/**
 * Get all generation records for a job
 */
export async function getJobGenerations(jobId: string): Promise<GenerationRecord[]> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from('generations')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch job generations: ${error.message}`);
  }

  return data as GenerationRecord[];
}

/**
 * Look up a generation record by its kie.ai taskId
 * Enables external systems to correlate taskIds with generation records (INTG-01)
 *
 * @param taskId - The kie.ai task ID
 * @returns GenerationRecord if found, null otherwise
 */
export async function getGenerationByTaskId(
  taskId: string
): Promise<GenerationRecord | null> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from('generations')
    .select('*')
    .eq('task_id', taskId)
    .single();

  if (error || !data) {
    return null;
  }

  return data as GenerationRecord;
}
