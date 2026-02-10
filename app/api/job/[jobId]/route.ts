// app/api/job/[jobId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

interface RouteContext {
  params: Promise<{ jobId: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { jobId } = await context.params;

    if (!jobId) {
      return NextResponse.json(
        { success: false, error: 'jobId is required' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Fetch job record
    const { data: job, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error || !job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }

    // Extract outputFormat from parsed_job
    const parsedJob = job.parsed_job as { job?: { outputFormat?: string } } | null;
    const outputFormat = parsedJob?.job?.outputFormat || 'PNG';

    return NextResponse.json({
      success: true,
      job: {
        id: job.id,
        sessionId: job.session_id,
        state: job.state,
        totalGenerations: job.total_generations,
        completedGenerations: job.completed_generations,
        failedGenerations: job.failed_generations,
        estimatedCost: job.estimated_cost,
        createdAt: job.created_at,
        startedAt: job.started_at,
        completedAt: job.completed_at,
        outputFormat,
      },
    });
  } catch (error) {
    console.error('Error in job endpoint:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
