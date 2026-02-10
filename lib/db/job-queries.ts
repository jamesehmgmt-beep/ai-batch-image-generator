// lib/db/job-queries.ts
// Database queries for orphaned job detection and recovery
import { createServerSupabaseClient } from '@/lib/supabase-server';

/**
 * Structure for an orphaned generation (stuck in 'processing' state too long)
 */
export interface OrphanedGeneration {
  id: string;
  job_id: string;
  started_at: string;
  operation: string;
  retry_count: number;
  source_file_name: string;
}

/**
 * Find generations stuck in 'processing' state beyond the timeout threshold
 * Used for orphaned job detection - jobs that crashed/timed out during processing
 *
 * @param timeoutMinutes - How long a job can be in 'processing' before considered orphaned (default 15)
 * @returns Array of orphaned generations, oldest first. Empty array on error.
 */
export async function findOrphanedGenerations(
  timeoutMinutes: number = 15
): Promise<OrphanedGeneration[]> {
  try {
    const supabase = createServerSupabaseClient();

    // Calculate threshold timestamp
    const threshold = new Date(Date.now() - timeoutMinutes * 60 * 1000);

    const { data, error } = await supabase
      .from('generations')
      .select('id, job_id, started_at, operation, retry_count, source_file_name')
      .eq('state', 'processing')
      .lt('started_at', threshold.toISOString())
      .order('started_at', { ascending: true });

    if (error) {
      console.error('[Recovery] Failed to query orphaned generations:', error);
      return [];
    }

    const orphaned = data || [];

    if (orphaned.length > 0) {
      // console.log(`[Recovery] Found ${orphaned.length} orphaned generation(s) (stuck for ${timeoutMinutes}+ minutes)`);
    }

    return orphaned;
  } catch (err) {
    console.error('[Recovery] Unexpected error finding orphaned generations:', err);
    return [];
  }
}

/**
 * Reset an orphaned generation back to 'pending' state for retry
 * Clears started_at, sets error_message to indicate recovery, increments retry_count
 *
 * @param generationId - UUID of the generation to reset
 * @returns true on success, false on error
 */
export async function resetGenerationToPending(
  generationId: string
): Promise<boolean> {
  try {
    const supabase = createServerSupabaseClient();

    // Use RPC or raw update - Supabase doesn't support increment directly
    // So we need to fetch current retry_count first, then update
    const { data: current, error: fetchError } = await supabase
      .from('generations')
      .select('retry_count')
      .eq('id', generationId)
      .single();

    if (fetchError || !current) {
      console.error(`[Recovery] Failed to fetch generation ${generationId}:`, fetchError);
      return false;
    }

    const { error: updateError } = await supabase
      .from('generations')
      .update({
        state: 'pending',
        started_at: null,
        error_message: 'Recovered from orphaned state',
        retry_count: current.retry_count + 1,
      })
      .eq('id', generationId);

    if (updateError) {
      console.error(`[Recovery] Failed to reset generation ${generationId}:`, updateError);
      return false;
    }

    // console.log(`[Recovery] Reset generation ${generationId} to pending (retry count: ${current.retry_count + 1})`);
    return true;
  } catch (err) {
    console.error(`[Recovery] Unexpected error resetting generation ${generationId}:`, err);
    return false;
  }
}

/**
 * Summary of stuck jobs for monitoring purposes
 */
export interface StuckJobsSummary {
  stuckCount: number;
  oldestStuckMinutes: number;
}

/**
 * Get a summary of jobs currently stuck in 'processing' state
 * Useful for monitoring dashboards and health checks
 *
 * @returns Summary with count of stuck jobs and age of oldest one
 */
export async function getStuckJobsSummary(): Promise<StuckJobsSummary> {
  try {
    const supabase = createServerSupabaseClient();

    // Get all generations in 'processing' state
    const { data, error } = await supabase
      .from('generations')
      .select('started_at')
      .eq('state', 'processing')
      .order('started_at', { ascending: true });

    if (error) {
      console.error('[Recovery] Failed to query stuck jobs summary:', error);
      return { stuckCount: 0, oldestStuckMinutes: 0 };
    }

    const processing = data || [];

    if (processing.length === 0) {
      return { stuckCount: 0, oldestStuckMinutes: 0 };
    }

    // Calculate how long the oldest one has been processing
    const oldestStartedAt = processing[0].started_at;
    const oldestStuckMinutes = oldestStartedAt
      ? Math.floor((Date.now() - new Date(oldestStartedAt).getTime()) / 60000)
      : 0;

    return {
      stuckCount: processing.length,
      oldestStuckMinutes,
    };
  } catch (err) {
    console.error('[Recovery] Unexpected error getting stuck jobs summary:', err);
    return { stuckCount: 0, oldestStuckMinutes: 0 };
  }
}
