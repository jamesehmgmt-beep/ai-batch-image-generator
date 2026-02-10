'use client';

import { useState, use } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useJobProgress } from '@/lib/hooks/use-job-progress';
import { useETACalculator } from '@/lib/hooks/use-eta-calculator';
import { ProgressTracker } from '@/components/job/progress-tracker';
import { GenerationList } from '@/components/job/generation-list';
import { ArrowLeft, Download, RefreshCw } from 'lucide-react';

interface ProgressPageProps {
  params: Promise<{ jobId: string }>;
}

export default function ProgressPage({ params }: ProgressPageProps) {
  const { jobId } = use(params);
  const { stats, generations, isConnected, startTime } = useJobProgress(jobId);
  const eta = useETACalculator(stats.completed + stats.failed, stats.total, startTime);
  const [filterState, setFilterState] = useState<'all' | 'pending' | 'processing' | 'completed' | 'failed'>('all');

  // Calculate counts for filter tabs
  const filterCounts = {
    all: generations.length,
    pending: stats.pending,
    processing: stats.processing,
    completed: stats.completed,
    failed: stats.failed,
  };

  // Check if job is complete
  const isComplete = stats.pending === 0 && stats.processing === 0 && stats.total > 0;

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
            <h2 className="text-2xl font-bold">Generation Progress</h2>
            <p className="text-muted-foreground text-sm">
              Job ID: {jobId.slice(0, 8)}...
            </p>
          </div>
        </div>
        {isComplete && (
          <Button variant="outline" asChild>
            <Link href={`/job/results/${jobId}`}>
              <Download className="w-4 h-4 mr-2" />
              View Results
            </Link>
          </Button>
        )}
      </div>

      {/* Progress tracker card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <ProgressTracker stats={stats} eta={eta} isConnected={isConnected} />
        </CardContent>
      </Card>

      {/* Generation list card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Generations</CardTitle>
            {!isConnected && (
              <Button variant="ghost" size="sm" onClick={() => window.location.reload()}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Reconnect
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Filter tabs */}
          <Tabs
            value={filterState}
            onValueChange={(v) => setFilterState(v as typeof filterState)}
            className="mb-4"
          >
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="all">
                All ({filterCounts.all})
              </TabsTrigger>
              <TabsTrigger value="processing">
                Processing ({filterCounts.processing})
              </TabsTrigger>
              <TabsTrigger value="pending">
                Queued ({filterCounts.pending})
              </TabsTrigger>
              <TabsTrigger value="completed">
                Complete ({filterCounts.completed})
              </TabsTrigger>
              <TabsTrigger value="failed">
                Failed ({filterCounts.failed})
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Generation list */}
          <GenerationList generations={generations} filterState={filterState} />
        </CardContent>
      </Card>

      {/* Actions when complete */}
      {isComplete && (
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardContent className="p-6 text-center">
            <h3 className="text-lg font-semibold text-emerald-400 mb-2">
              Generation Complete!
            </h3>
            <p className="text-muted-foreground mb-4">
              {stats.completed} images generated successfully
              {stats.failed > 0 && `, ${stats.failed} failed`}
            </p>
            <div className="flex gap-4 justify-center">
              <Button asChild>
                <Link href={`/job/results/${jobId}`}>
                  <Download className="w-4 h-4 mr-2" />
                  Download Results
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/create-job">
                  Start New Job
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
