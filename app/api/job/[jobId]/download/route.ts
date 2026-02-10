// app/api/job/[jobId]/download/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createStreamingZip, ZipEntry } from '@/lib/export/zip-builder';

interface RouteContext {
  params: Promise<{ jobId: string }>;
}

/**
 * GET /api/job/[jobId]/download
 * Download all completed generations as a ZIP file organized by folder
 *
 * Query params:
 * - folder: Optional folder path to download only that folder
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { jobId } = await context.params;
    const { searchParams } = new URL(request.url);
    const folderFilter = searchParams.get('folder');

    if (!jobId) {
      return NextResponse.json(
        { success: false, error: 'jobId is required' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Fetch completed generations
    // Try with soft-delete filter first, fall back if column doesn't exist
    let generations: any[] | null = null;
    let fetchError: any = null;

    // First try with deleted_at filter (migration 003)
    let query = supabase
      .from('generations')
      .select('id, source_file_name, result_url, folder_path')
      .eq('job_id', jobId)
      .eq('state', 'completed')
      .is('deleted_at', null)
      .not('result_url', 'is', null);

    if (folderFilter) {
      query = query.eq('folder_path', folderFilter);
    }

    const result = await query;
    generations = result.data;
    fetchError = result.error;

    // If query failed (e.g., deleted_at column doesn't exist), try without the filter
    if (fetchError) {
      console.warn('[Download] Query with deleted_at filter failed, trying fallback:', fetchError.message);
      let fallbackQuery = supabase
        .from('generations')
        .select('id, source_file_name, result_url, folder_path')
        .eq('job_id', jobId)
        .eq('state', 'completed')
        .not('result_url', 'is', null);

      if (folderFilter) {
        fallbackQuery = fallbackQuery.eq('folder_path', folderFilter);
      }

      const fallbackResult = await fallbackQuery;
      generations = fallbackResult.data;
      fetchError = fallbackResult.error;
    }

    if (fetchError) {
      console.error('Error fetching generations:', fetchError);
      return NextResponse.json(
        { success: false, error: `Failed to fetch generations: ${fetchError.message}` },
        { status: 500 }
      );
    }

    if (!generations || generations.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No completed generations found' },
        { status: 404 }
      );
    }

    // Fetch job to get outputFormat
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('parsed_job')
      .eq('id', jobId)
      .single();

    if (jobError) {
      console.error('Error fetching job:', jobError);
      // Continue with default format if job fetch fails
    }

    // Get output format from job, default to png
    const outputFormat = (job?.parsed_job as { job?: { outputFormat?: string } })?.job?.outputFormat?.toLowerCase() || 'png';
    const extension = outputFormat === 'jpg' ? 'jpg' : 'png';

    // console.log(`[Download] Creating streaming ZIP for ${generations.length} images with ${extension} extension`);

    // Build ZIP entries with folder structure
    // Use random IDs for filenames to prevent collisions when extracting multiple jobs
    const entries: ZipEntry[] = generations
      .filter(gen => gen.result_url)
      .map(gen => {
        const folderPath = gen.folder_path || 'default';
        const randomId = Math.random().toString(36).substring(2, 10);
        const fileName = `${randomId}.${extension}`;
        return {
          name: `${folderPath}/${fileName}`,
          url: gen.result_url!,
          skipOnError: true,
        };
      });

    // Create streaming ZIP
    const stream = createStreamingZip(entries, {
      compressionLevel: 6,
      onProgress: (processed, total) => {
        if (processed % 10 === 0 || processed === total) {
          // console.log(`[Download] Progress: ${processed}/${total}`);
        }
      },
      onError: (entry, err) => {
        console.error(`[Download] Failed to include ${entry.name}: ${err.message}`);
      },
    });

    // Create filename
    const zipFileName = folderFilter
      ? `${folderFilter.replace(/\//g, '_')}-results.zip`
      : `job-${jobId.slice(0, 8)}-results.zip`;

    // Return streaming response
    return new NextResponse(stream, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${zipFileName}"`,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('[Download] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create download' },
      { status: 500 }
    );
  }
}
