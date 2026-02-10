'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { GenerationRecord } from '@/lib/types/generation';

export interface ProgressStats {
  total: number;
  completed: number;
  failed: number;
  processing: number;
  pending: number;
  percentage: number;
  totalRetryAttempts: number;
  generationsCurrentlyRetrying: number;
}

export interface GenerationUpdate {
  id: string;
  state: 'pending' | 'processing' | 'completed' | 'failed';
  sourceFileName: string;
  resultUrl?: string;
  errorMessage?: string;
  taskId?: string;
  referenceImageUrls?: string[];
  operation?: string;
  folderPath?: string;
  retryCount?: number;
}

export function useJobProgress(jobId: string) {
  const [stats, setStats] = useState<ProgressStats>({
    total: 0,
    completed: 0,
    failed: 0,
    processing: 0,
    pending: 0,
    percentage: 0,
    totalRetryAttempts: 0,
    generationsCurrentlyRetrying: 0,
  });
  const [generations, setGenerations] = useState<GenerationUpdate[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [startTime, setStartTime] = useState<string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastFetchRef = useRef<string>('');

  // Fetch generations from database
  const fetchGenerations = useCallback(async () => {
    const { data: generationsData } = await supabase
      .from('generations')
      .select('id, state, source_file_name, result_url, error_message, task_id, reference_image_urls, operation, folder_path, retry_count')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true });

    if (generationsData) {
      // Check if data actually changed to avoid unnecessary re-renders
      const newDataStr = JSON.stringify(generationsData.map(g => ({ id: g.id, state: g.state, result_url: g.result_url })));
      if (newDataStr === lastFetchRef.current) {
        return; // No change, skip update
      }
      lastFetchRef.current = newDataStr;

      const updates: GenerationUpdate[] = generationsData.map((g) => ({
        id: g.id,
        state: g.state as GenerationUpdate['state'],
        sourceFileName: g.source_file_name,
        resultUrl: g.result_url || undefined,
        errorMessage: g.error_message || undefined,
        taskId: g.task_id || undefined,
        referenceImageUrls: g.reference_image_urls || undefined,
        operation: g.operation || undefined,
        folderPath: g.folder_path || undefined,
        retryCount: g.retry_count || 0,
      }));
      setGenerations(updates);

      // Calculate stats
      const counts = countByState(updates);
      setStats(counts);

      // Stop polling if job is complete
      if (counts.pending === 0 && counts.processing === 0 && counts.total > 0) {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      }
    }
  }, [jobId]);

  useEffect(() => {
    let channel: RealtimeChannel | null = null;

    async function setupSubscription() {
      // Fetch initial state - job and all generations
      const { data: job } = await supabase
        .from('jobs')
        .select('started_at')
        .eq('id', jobId)
        .single();

      if (job?.started_at) {
        setStartTime(job.started_at);
      }

      // Initial fetch
      await fetchGenerations();

      // Subscribe to generation changes (real-time)
      channel = supabase
        .channel(`job-progress-${jobId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'generations',
            filter: `job_id=eq.${jobId}`,
          },
          (payload) => {
            const updated = payload.new as GenerationRecord;

            setGenerations((prev) => {
              const index = prev.findIndex((g) => g.id === updated.id);
              if (index === -1) return prev;

              const newGenerations = [...prev];
              newGenerations[index] = {
                id: updated.id,
                state: updated.state as GenerationUpdate['state'],
                sourceFileName: updated.source_file_name,
                resultUrl: updated.result_url || undefined,
                errorMessage: updated.error_message || undefined,
                taskId: updated.task_id || undefined,
                referenceImageUrls: updated.reference_image_urls || undefined,
                operation: updated.operation || undefined,
                folderPath: updated.folder_path || undefined,
                retryCount: updated.retry_count || 0,
              };

              // Recalculate stats
              const counts = countByState(newGenerations);
              setStats(counts);

              return newGenerations;
            });
          }
        )
        .subscribe((status) => {
          setIsConnected(status === 'SUBSCRIBED');
        });

      // FALLBACK: Poll every 3 seconds in case realtime fails
      // This ensures updates are shown even if WebSocket disconnects
      pollIntervalRef.current = setInterval(() => {
        fetchGenerations();
      }, 3000);
    }

    setupSubscription();

    // CRITICAL: Cleanup to prevent memory leaks
    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [jobId, fetchGenerations]);

  return { stats, generations, isConnected, startTime };
}

function countByState(generations: GenerationUpdate[]): ProgressStats {
  const counts = {
    total: generations.length,
    completed: 0,
    failed: 0,
    processing: 0,
    pending: 0,
    percentage: 0,
    totalRetryAttempts: 0,
    generationsCurrentlyRetrying: 0,
  };

  for (const g of generations) {
    if (g.state === 'completed') counts.completed++;
    else if (g.state === 'failed') counts.failed++;
    else if (g.state === 'processing') counts.processing++;
    else if (g.state === 'pending') counts.pending++;

    // Sum all retry counts for total retry attempts
    counts.totalRetryAttempts += g.retryCount || 0;

    // Count generations that are pending/processing with retry > 0 (currently retrying)
    if ((g.state === 'pending' || g.state === 'processing') && (g.retryCount || 0) > 0) {
      counts.generationsCurrentlyRetrying++;
    }
  }

  // Include failed in "done" for percentage (failed items are processed, just not successful)
  const done = counts.completed + counts.failed;
  counts.percentage = counts.total > 0 ? Math.floor((done / counts.total) * 100) : 0;

  return counts;
}
