'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  History,
  Loader2,
  ImageIcon,
  ExternalLink,
  Clock,
  DollarSign,
  Images,
  CheckCircle2,
  XCircle,
  AlertCircle
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

interface JobHistoryItem {
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

interface JobHistoryResponse {
  success: boolean;
  jobs: JobHistoryItem[];
  totalCount: number;
  hasMore: boolean;
  error?: string;
}

export default function JobHistoryPage() {
  const [jobs, setJobs] = useState<JobHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Initial load
  useEffect(() => {
    loadJobs(0);
  }, []);

  async function loadJobs(offset: number) {
    try {
      const response = await fetch(`/api/job/history?offset=${offset}&limit=20`);
      if (!response.ok) throw new Error('Failed to fetch');
      const data: JobHistoryResponse = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to load history');
      }

      if (offset === 0) {
        setJobs(data.jobs);
      } else {
        setJobs(prev => [...prev, ...data.jobs]);
      }
      setHasMore(data.hasMore);
      setTotalCount(data.totalCount);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }

  function handleLoadMore() {
    setIsLoadingMore(true);
    loadJobs(jobs.length);
  }

  function getStateBadge(state: string) {
    const variants: Record<
      string,
      { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string; icon: React.ReactNode }
    > = {
      completed: {
        variant: 'default',
        label: 'Completed',
        icon: <CheckCircle2 className="w-3 h-3" />
      },
      processing: {
        variant: 'secondary',
        label: 'Processing',
        icon: <Loader2 className="w-3 h-3 animate-spin" />
      },
      failed: {
        variant: 'destructive',
        label: 'Failed',
        icon: <XCircle className="w-3 h-3" />
      },
      pending: {
        variant: 'outline',
        label: 'Pending',
        icon: <Clock className="w-3 h-3" />
      },
      cancelled: {
        variant: 'outline',
        label: 'Cancelled',
        icon: <AlertCircle className="w-3 h-3" />
      },
    };
    const config = variants[state] || {
      variant: 'outline' as const,
      label: state,
      icon: <AlertCircle className="w-3 h-3" />
    };
    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        {config.icon}
        {config.label}
      </Badge>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <History className="w-8 h-8" />
            Job History
          </h1>
          <p className="text-muted-foreground mt-2">
            Browse your past generation jobs
          </p>
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <History className="w-8 h-8" />
            Job History
          </h1>
        </div>
        <Card className="border-red-500/20 bg-red-500/5">
          <CardContent className="p-8 text-center">
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <p className="text-red-500 text-lg mb-4">{error}</p>
            <Button onClick={() => {
              setIsLoading(true);
              setError(null);
              loadJobs(0);
            }}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Empty state
  if (jobs.length === 0) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <History className="w-8 h-8" />
            Job History
          </h1>
          <p className="text-muted-foreground mt-2">
            Browse your past generation jobs
          </p>
        </div>
        <Card>
          <CardContent className="p-12 text-center">
            <History className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">No jobs yet</h2>
            <p className="text-muted-foreground mb-6">
              Start your first job to see it here
            </p>
            <Link href="/create-job">
              <Button>
                Create Your First Job
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Job list
  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <History className="w-8 h-8" />
          Job History
        </h1>
        <p className="text-muted-foreground mt-2">
          {totalCount} {totalCount === 1 ? 'job' : 'jobs'} total
        </p>
      </div>

      {/* Job grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {jobs.map((job) => (
          <Card key={job.id} className="overflow-hidden hover:border-primary/50 transition-colors">
            <CardHeader className="p-0">
              {/* Thumbnail */}
              <div className="relative w-full aspect-video bg-muted flex items-center justify-center">
                {job.thumbnailUrl ? (
                  <img
                    src={job.thumbnailUrl}
                    alt={job.firstFileName || 'Job thumbnail'}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <ImageIcon className="w-12 h-12 text-muted-foreground/50" />
                )}
                {/* State badge overlay */}
                <div className="absolute top-2 right-2">
                  {getStateBadge(job.state)}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {/* Date */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="w-4 h-4" />
                <span>
                  {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}
                </span>
              </div>

              {/* Generation stats */}
              <div className="flex items-center gap-2 text-sm">
                <Images className="w-4 h-4 text-muted-foreground" />
                <span>
                  <span className="font-semibold text-foreground">
                    {job.completedGenerations}
                  </span>
                  <span className="text-muted-foreground">
                    {' '}/ {job.totalGenerations} completed
                  </span>
                </span>
              </div>

              {/* Failed count if any */}
              {job.failedGenerations > 0 && (
                <div className="flex items-center gap-2 text-sm text-red-400">
                  <XCircle className="w-4 h-4" />
                  <span>{job.failedGenerations} failed</span>
                </div>
              )}

              {/* Cost */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <DollarSign className="w-4 h-4" />
                <span>${job.estimatedCost.toFixed(2)}</span>
              </div>

              {/* Completion date */}
              {job.completedAt && (
                <div className="text-xs text-muted-foreground border-t border-border pt-3">
                  Completed {format(new Date(job.completedAt), 'MMM d, yyyy h:mm a')}
                </div>
              )}

              {/* View Results button */}
              <Link href={`/job/results/${job.id}`} className="block">
                <Button className="w-full" variant="outline">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  View Results
                </Button>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Load More button */}
      {hasMore && (
        <div className="flex justify-center">
          <Button
            onClick={handleLoadMore}
            disabled={isLoadingMore}
            variant="outline"
            size="lg"
          >
            {isLoadingMore ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                Load More ({jobs.length} of {totalCount})
              </>
            )}
          </Button>
        </div>
      )}

      {/* New Job CTA */}
      <div className="mt-12 text-center">
        <Link href="/create-job">
          <Button size="lg">
            Create New Job
          </Button>
        </Link>
      </div>
    </div>
  );
}
