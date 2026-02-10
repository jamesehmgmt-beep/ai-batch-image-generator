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

    // console.log(`[Generations API] Fetching generations for job: ${jobId}`);

    // Fetch all generations for this job
    // Try with soft-delete filter first, fall back if column doesn't exist
    let data: any[] | null = null;
    let error: any = null;

    // First try with deleted_at filter (migration 003)
    const result = await supabase
      .from('generations')
      .select('*')
      .eq('job_id', jobId)
      .is('deleted_at', null)  // Exclude soft-deleted generations
      .order('created_at', { ascending: true });

    data = result.data;
    error = result.error;

    // If query failed (e.g., deleted_at column doesn't exist), try without the filter
    if (error) {
      console.warn('[Generations API] Query with deleted_at filter failed, trying fallback:', error.message);
      const fallbackResult = await supabase
        .from('generations')
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: true });

      data = fallbackResult.data;
      error = fallbackResult.error;
    }

    if (error) {
      console.error('[Generations API] Error fetching generations:', error);
      return NextResponse.json(
        {
          success: false,
          error: `Failed to fetch generations: ${error.message}`,
          details: { code: error.code, hint: error.hint }
        },
        { status: 500 }
      );
    }

    // console.log(`[Generations API] Found ${data?.length || 0} generations for job ${jobId}`);

    // Transform to camelCase for frontend consumption
    const transformedGenerations = (data || []).map((g) => ({
      id: g.id,
      jobId: g.job_id,
      folderPath: g.folder_path,
      operation: g.operation,
      prompt: g.prompt, // Per-generation prompt (v4.0+)
      state: g.state,
      taskId: g.task_id,
      resultUrl: g.result_url,
      sourceFileName: g.source_file_name,
      referenceImageUrls: g.reference_image_urls || [],
      resolution: g.resolution,
      aspectRatio: g.aspect_ratio,
      photoMode: g.photo_mode,
      model: g.model,
      quality: g.quality,
      imageSize: g.image_size,
      errorMessage: g.error_message,
      createdAt: g.created_at,
    }));

    return NextResponse.json({
      success: true,
      generations: transformedGenerations,
    });
  } catch (error) {
    console.error('Error in generations endpoint:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    );
  }
}
