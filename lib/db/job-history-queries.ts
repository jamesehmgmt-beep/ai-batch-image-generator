// lib/db/job-history-queries.ts
import { createServerSupabaseClient } from '@/lib/supabase-server';

/**
 * Job history item for display
 */
export interface JobHistoryItem {
  id: string;
  createdAt: string;
  completedAt: string | null;
  state: string;
  totalGenerations: number;
  completedGenerations: number;
  failedGenerations: number;
  estimatedCost: number;
  thumbnailUrl: string | null;
  firstFileName: string | null;
}

/**
 * Paginated result for job history
 */
export interface JobHistoryResult {
  jobs: JobHistoryItem[];
  totalCount: number;
  hasMore: boolean;
}

/**
 * Fetch paginated job history with first completed thumbnail
 * @param limit - Number of jobs per page (default 20)
 * @param offset - Number of jobs to skip (default 0)
 * @returns Paginated job history with thumbnails
 */
export async function getJobHistory(
  limit: number = 20,
  offset: number = 0
): Promise<JobHistoryResult> {
  const supabase = createServerSupabaseClient();

  // Get total count for pagination
  const { count, error: countError } = await supabase
    .from('jobs')
    .select('*', { count: 'exact', head: true });

  if (countError) {
    console.error('[JobHistory] Count query failed:', countError);
    throw new Error('Failed to fetch job count');
  }

  // Fetch jobs ordered by creation date (newest first)
  const { data: jobs, error: jobsError } = await supabase
    .from('jobs')
    .select(`
      id,
      created_at,
      completed_at,
      state,
      total_generations,
      completed_generations,
      failed_generations,
      estimated_cost
    `)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (jobsError) {
    console.error('[JobHistory] Jobs query failed:', jobsError);
    throw new Error('Failed to fetch jobs');
  }

  if (!jobs || jobs.length === 0) {
    return { jobs: [], totalCount: count || 0, hasMore: false };
  }

  // Fetch first completed generation for each job (for thumbnail)
  const jobsWithThumbnails: JobHistoryItem[] = await Promise.all(
    jobs.map(async (job) => {
      const { data: gen } = await supabase
        .from('generations')
        .select('result_url, source_file_name')
        .eq('job_id', job.id)
        .eq('state', 'completed')
        .not('result_url', 'is', null)
        .order('completed_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      return {
        id: job.id,
        createdAt: job.created_at,
        completedAt: job.completed_at,
        state: job.state,
        totalGenerations: job.total_generations,
        completedGenerations: job.completed_generations,
        failedGenerations: job.failed_generations,
        estimatedCost: job.estimated_cost,
        thumbnailUrl: gen?.result_url || null,
        firstFileName: gen?.source_file_name || null,
      };
    })
  );

  const totalCount = count || 0;
  const hasMore = offset + jobs.length < totalCount;

  return {
    jobs: jobsWithThumbnails,
    totalCount,
    hasMore,
  };
}
