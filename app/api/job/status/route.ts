// app/api/job/status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import type { JobRecord } from '@/lib/types/generation';

// Type for the selective generation query
interface GenerationStatusRow {
  id: string;
  state: string;
  task_id: string | null;
  result_url: string | null;
  source_file_name: string;
  folder_path: string;
  retry_count: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export async function GET(request: NextRequest) {
  try {
    // Extract jobId from query params
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json(
        { success: false, error: 'jobId is required' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Fetch job record
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

    // Fetch all generations for this job with retry information
    const { data: generations, error: genError } = await supabase
      .from('generations')
      .select('id, state, task_id, result_url, source_file_name, folder_path, retry_count, error_message, started_at, completed_at')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true });

    if (genError) {
      console.error('Error fetching generations:', genError);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch generation details' },
        { status: 500 }
      );
    }

    const jobRecord = job as JobRecord;
    const generationRecords = (generations || []) as GenerationStatusRow[];

    // Calculate retry summary for monitoring
    const retrySummary = generationRecords.reduce((acc, g) => ({
      totalRetries: acc.totalRetries + (g.retry_count || 0),
      generationsRetrying: acc.generationsRetrying + ((g.retry_count || 0) > 0 && g.state !== 'completed' ? 1 : 0),
    }), { totalRetries: 0, generationsRetrying: 0 });

    // Count generations by state
    const stateCounts = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
    };

    for (const gen of generationRecords) {
      if (gen.state in stateCounts) {
        stateCounts[gen.state as keyof typeof stateCounts]++;
      }
    }

    // Calculate progress percentage
    const totalGenerations = jobRecord.total_generations;
    const completedAndFailed = stateCounts.completed + stateCounts.failed;
    const progressPercentage = totalGenerations > 0
      ? Math.round((completedAndFailed / totalGenerations) * 100)
      : 0;

    // Build generation details array with taskId and retry info
    const generationDetails = generationRecords.map((gen) => ({
      id: gen.id,
      state: gen.state,
      taskId: gen.task_id, // Exposed for external tracking (INTG-01)
      resultUrl: gen.result_url,
      sourceFileName: gen.source_file_name,
      folderPath: gen.folder_path,
      retryCount: gen.retry_count ?? 0,
      errorMessage: gen.error_message,
      startedAt: gen.started_at,
      completedAt: gen.completed_at,
    }));

    // If job is completed, include summary of results
    let results: { successfulUrls: string[]; failedCount: number } | undefined;
    if (jobRecord.state === 'completed') {
      const successfulUrls = generationRecords
        .filter((gen) => gen.state === 'completed' && gen.result_url)
        .map((gen) => gen.result_url!);

      results = {
        successfulUrls,
        failedCount: stateCounts.failed,
      };
    }

    return NextResponse.json({
      success: true,
      job: {
        id: jobRecord.id,
        state: jobRecord.state,
        totalGenerations: jobRecord.total_generations,
        completedGenerations: jobRecord.completed_generations,
        failedGenerations: jobRecord.failed_generations,
        startedAt: jobRecord.started_at,
        completedAt: jobRecord.completed_at,
      },
      progress: {
        percentage: progressPercentage,
        completed: stateCounts.completed,
        failed: stateCounts.failed,
        processing: stateCounts.processing,
        pending: stateCounts.pending,
        totalRetryAttempts: retrySummary.totalRetries,
        generationsCurrentlyRetrying: retrySummary.generationsRetrying,
      },
      generations: generationDetails,
      results,
    });
  } catch (error) {
    console.error('Error in job status endpoint:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
