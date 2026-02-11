// app/api/job/execute/route.ts
import { NextRequest, NextResponse, after } from 'next/server';
import { getQueueManager } from '@/lib/queue/generation-queue';
import { getRecoveryManager } from '@/lib/queue/recovery-manager';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { GenerationJob } from '@/lib/types/generation';
import { DEFAULT_MODEL } from '@/lib/models';

/**
 * POST /api/job/execute
 * Start job execution - fetches existing generations and queues them
 *
 * Generations are created at job creation time (in /api/job/create),
 * so this endpoint just starts processing the existing generation records.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { jobId } = body;

    // Validation: jobId
    if (!jobId || typeof jobId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid jobId' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Step 1: Fetch job record
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }

    // Step 2: Validate job state is 'pending'
    if (job.state !== 'pending') {
      return NextResponse.json(
        {
          success: false,
          error: `Job is not in pending state (current state: ${job.state})`,
        },
        { status: 400 }
      );
    }

    // Step 3: Fetch existing generation records for this job
    const { data: generations, error: genError } = await supabase
      .from('generations')
      .select('*')
      .eq('job_id', jobId)
      .eq('state', 'pending')
      .order('created_at', { ascending: true });

    if (genError) {
      console.error('[Execute] Error fetching generations:', genError);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch generations' },
        { status: 500 }
      );
    }

    if (!generations || generations.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No pending generations found for this job. Generations may have already been processed or none were created.' },
        { status: 400 }
      );
    }

    console.log(`[Execute] Found ${generations.length} pending generations for job ${jobId}`);
    // Debug: Check if prompt field is present in database records
    const sampleGen = generations[0];
    console.log(`[Execute] Sample generation fields: prompt=${sampleGen?.prompt ? 'EXISTS' : 'NULL/MISSING'}`);
    if (sampleGen?.prompt) {
      console.log(`[Execute] Sample prompt: "${sampleGen.prompt.substring(0, 60)}..."`);
    }

    // Debug: Check uniqueness of prompts across all generations
    const uniquePrompts = new Set(generations.map(g => g.prompt?.substring(0, 50)));
    console.log(`[Execute] Unique prompt prefixes: ${uniquePrompts.size} out of ${generations.length} generations`);
    if (uniquePrompts.size < generations.length && generations.length > 1) {
      console.warn(`[Execute] WARNING: Some generations have duplicate prompts!`);
    }

    // Debug: Show first 3 prompts from database
    console.log(`[Execute] ========== DB PROMPTS ==========`);
    generations.slice(0, 3).forEach((g, i) => {
      console.log(`[Execute] Gen ${i + 1}: prompt="${g.prompt?.substring(0, 80)}..."`);
      console.log(`[Execute] Gen ${i + 1}: starts with [POSE: ${g.prompt?.startsWith('[POSE:') ? 'YES' : 'NO'}`);
    });
    console.log(`[Execute] ==================================`);

    // Step 4: Update job state to 'processing', set started_at
    const { error: updateError } = await supabase
      .from('jobs')
      .update({
        state: 'processing',
        started_at: new Date().toISOString(),
        total_generations: generations.length,
      })
      .eq('id', jobId);

    if (updateError) {
      throw new Error(`Failed to update job state: ${updateError.message}`);
    }

    // Step 5: Start recovery manager if not already running
    // This will periodically check for and recover orphaned generations
    const recoveryManager = getRecoveryManager();
    if (!recoveryManager.isActive()) {
      recoveryManager.start();
      // console.log('[Execute] Started recovery manager for orphaned job detection');
    }

    // Step 6: Transform database records to GenerationJob format
    // Extract outputFormat from parsed_job (stored at job level)
    const outputFormat = (job.parsed_job?.job?.outputFormat as 'PNG' | 'JPG') || 'PNG';

    const generationJobs: GenerationJob[] = generations.map((g) => ({
      id: g.id,
      jobId: g.job_id,
      folderPath: g.folder_path,
      operation: g.operation,
      prompt: g.prompt || undefined, // Per-generation prompt (v4.0+)
      model: g.model || DEFAULT_MODEL, // Use stored model or fallback to default
      resolution: g.resolution as '1K' | '2K' | '4K',
      aspectRatio: g.aspect_ratio,
      photoMode: g.photo_mode as 'reference' | 'analysis',
      outputFormat: outputFormat,
      referenceImageUrls: g.reference_image_urls || [],
      sourceFileName: g.source_file_name,
      // Seedream-specific fields
      quality: g.quality as 'basic' | 'high' | undefined,
      imageSize: g.image_size || undefined,
    }));

    // Step 7: Get queue manager instance and queue all generations
    const queueManager = getQueueManager();

    // Start queue processing - use after() to keep alive after response is sent
    // Without after(), Next.js App Router terminates background work when the response is sent
    const batchPromise = queueManager.addBatch(generationJobs);

    after(async () => {
      try {
        console.log(`[Execute] after() - Queue processing started for job ${jobId} (${generationJobs.length} generations)`);
        await batchPromise;
        console.log(`[Execute] after() - Queue processing completed for job ${jobId}`);
      } catch (error) {
        console.error(`[Execute] after() - Queue processing error for job ${jobId}:`, error);
      }
    });

    // Step 8: Return immediately with job summary
    const queueStatus = queueManager.getStatus();

    return NextResponse.json(
      {
        success: true,
        message: 'Job execution started',
        job: {
          id: jobId,
          totalGenerations: generationJobs.length,
          state: 'processing',
        },
        queueStatus: {
          pending: queueStatus.pending,
          queued: queueStatus.queued,
          total: queueStatus.total,
        },
        recoveryManagerActive: recoveryManager.isActive(),
      },
      { status: 202 } // 202 Accepted
    );
  } catch (error) {
    console.error('[Execute] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
