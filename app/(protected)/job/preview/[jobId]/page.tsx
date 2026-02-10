'use client';

import { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EditableGenerationItem } from '@/components/job/editable-generation-item';
import { ArrowLeft, Play, Loader2, AlertCircle } from 'lucide-react';

interface Generation {
  id: string;
  jobId: string;
  state: 'pending' | 'processing' | 'completed' | 'failed';
  operation: string;
  prompt?: string; // Per-generation prompt (v4.0+)
  sourceFileName: string;
  referenceImageUrls: string[];
  resolution: string;
  aspectRatio: string;
  photoMode: string;
  folderPath: string;
  model?: string;
  quality?: string | null;
  imageSize?: string | null;
}

interface PreviewPageProps {
  params: Promise<{ jobId: string }>;
}

export default function PreviewPage({ params }: PreviewPageProps) {
  const { jobId } = use(params);
  const router = useRouter();

  const [generations, setGenerations] = useState<Generation[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch job and generations on mount
  useEffect(() => {
    async function loadData() {
      try {
        // console.log(`[Preview] Loading data for job: ${jobId}`);

        // Step 1: Verify job exists and get job details
        const jobRes = await fetch(`/api/job/${jobId}`);
        if (!jobRes.ok) {
          const jobError = await jobRes.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(`Job not found: ${jobError.error || `HTTP ${jobRes.status}`}`);
        }

        const jobData = await jobRes.json();
        // console.log('[Preview] Job data:', jobData);

        if (!jobData.job) {
          throw new Error('Job data missing from API response');
        }

        setSessionId(jobData.job.sessionId || null);
        const expectedCount = jobData.job.totalGenerations || 0;

        // Step 2: Fetch generations
        // console.log(`[Preview] Fetching generations for job ${jobId} (expecting ${expectedCount})`);
        const res = await fetch(`/api/job/${jobId}/generations`);

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
          console.error('[Preview] Generations API error:', errorData);
          throw new Error(
            errorData.error ||
            errorData.message ||
            `Failed to fetch generations (HTTP ${res.status})`
          );
        }

        const data = await res.json();
        // console.log('[Preview] Fetched generations:', data.generations?.length, data);

        // Check for API-level errors even if HTTP status is 200
        if (data.success === false) {
          throw new Error(data.error || 'API returned success: false');
        }

        const generations = data.generations || [];
        setGenerations(generations);

        // Step 3: Check for empty generations and provide context
        if (generations.length === 0) {
          if (expectedCount === 0) {
            setError('No generations were created for this job. This may indicate a folder/file mismatch during job creation.');
          } else {
            setError(`Expected ${expectedCount} generations but found 0. The generation records may have failed to create - check server logs.`);
          }
        }
      } catch (err) {
        console.error('[Preview] Error loading data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load generations');
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [jobId]);

  // Handle saving a generation edit
  const handleSave = useCallback(async (
    id: string,
    updates: {
      operation?: string;
      prompt?: string; // Per-generation prompt (v4.0+)
      resolution?: string;
      aspectRatio?: string;
      photoMode?: string;
      referenceImageUrls?: string[];
      model?: string;
      quality?: string | null;
      imageSize?: string | null;
    }
  ) => {
    const res = await fetch(`/api/generation/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });

    if (!res.ok) {
      const data = await res.json();
      console.error('[Preview] Save failed:', res.status, data);
      throw new Error(data.error || `Failed to save changes (${res.status})`);
    }

    // Optimistic update
    setGenerations((prev) =>
      prev.map((g) => (g.id === id ? { ...g, ...updates } : g))
    );
  }, []);

  // Handle deleting a generation
  const handleDelete = useCallback(async (id: string) => {
    const res = await fetch(`/api/generation/${id}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to delete generation');
    }

    // Remove from state
    setGenerations((prev) => prev.filter((g) => g.id !== id));
  }, []);

  // Start execution
  const handleStartExecution = useCallback(async () => {
    setIsExecuting(true);
    setError(null);

    try {
      const res = await fetch(`/api/job/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to start execution');
      }

      // Navigate to progress page
      router.push(`/job/progress/${jobId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start execution');
      setIsExecuting(false);
    }
  }, [jobId, router]);

  // Count pending generations
  const pendingCount = generations.filter((g) => g.state === 'pending').length;

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/job/cost">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h2 className="text-2xl font-bold">Preview Generations</h2>
            <p className="text-muted-foreground">
              Review and edit {generations.length} generations before execution
            </p>
          </div>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <Card className="border-red-500/20 bg-red-500/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-red-500">Error Loading Generations</p>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
              <div className="flex gap-2 mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.location.reload()}
                >
                  Retry
                </Button>
                <Link href="/job/cost">
                  <Button variant="outline" size="sm">
                    Back to Cost Estimation
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Generation list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Generations ({generations.length})
            {generations.length === 0 && (
              <span className="text-sm font-normal text-muted-foreground ml-2">
                - No generations found. Check console for debugging info.
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 max-h-[600px] overflow-auto">
          {generations.map((generation) => (
            <EditableGenerationItem
              key={generation.id}
              generation={generation}
              onSave={handleSave}
              onDelete={handleDelete}
              sessionId={sessionId || undefined}
            />
          ))}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-between items-center pt-4">
        <Link href="/job/cost">
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Cost
          </Button>
        </Link>
        <Button
          onClick={handleStartExecution}
          size="lg"
          disabled={isExecuting || pendingCount === 0}
        >
          {isExecuting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Starting...
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              Start Generation ({pendingCount} images)
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
