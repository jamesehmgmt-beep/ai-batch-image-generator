'use client';

import * as Progress from '@radix-ui/react-progress';
import type { ProgressStats } from '@/lib/hooks/use-job-progress';
import type { ETAResult } from '@/lib/hooks/use-eta-calculator';
import { CheckCircle2, XCircle, Loader2, Clock, RefreshCw } from 'lucide-react';

interface ProgressTrackerProps {
  stats: ProgressStats & {
    totalRetryAttempts?: number;
    generationsCurrentlyRetrying?: number;
  };
  eta: ETAResult;
  isConnected: boolean;
}

export function ProgressTracker({ stats, eta, isConnected }: ProgressTrackerProps) {
  const { total, completed, failed, processing, pending, percentage, totalRetryAttempts, generationsCurrentlyRetrying } = stats;
  const successful = completed;
  const done = completed + failed;

  return (
    <div className="space-y-4">
      {/* Connection status */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-emerald-500' : 'bg-yellow-500 animate-pulse'
            }`}
          />
          <span className="text-muted-foreground">
            {isConnected ? 'Live updates' : 'Connecting...'}
          </span>
        </div>
        <span className="font-medium">
          {done} of {total} complete
        </span>
      </div>

      {/* Progress bar */}
      <Progress.Root
        className="relative h-4 overflow-hidden rounded-full bg-gray-800"
        value={percentage}
        max={100}
      >
        <Progress.Indicator
          className="h-full bg-emerald-500 transition-all duration-500 ease-out"
          style={{ width: `${percentage}%` }}
        />
        {/* Failed portion overlay */}
        {failed > 0 && (
          <div
            className="absolute top-0 h-full bg-red-500 transition-all duration-500"
            style={{
              left: `${Math.floor((successful / total) * 100)}%`,
              width: `${Math.floor((failed / total) * 100)}%`,
            }}
          />
        )}
      </Progress.Root>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2 text-center text-sm">
        <div className="flex flex-col items-center p-2 rounded-lg bg-gray-800/50">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 mb-1" />
          <span className="font-medium">{successful}</span>
          <span className="text-xs text-muted-foreground">Complete</span>
        </div>
        <div className="flex flex-col items-center p-2 rounded-lg bg-gray-800/50">
          <Loader2 className="w-4 h-4 text-blue-400 mb-1 animate-spin" />
          <span className="font-medium">{processing}</span>
          <span className="text-xs text-muted-foreground">Processing</span>
        </div>
        <div className="flex flex-col items-center p-2 rounded-lg bg-gray-800/50">
          <Clock className="w-4 h-4 text-gray-400 mb-1" />
          <span className="font-medium">{pending}</span>
          <span className="text-xs text-muted-foreground">Queued</span>
        </div>
        <div className="flex flex-col items-center p-2 rounded-lg bg-gray-800/50">
          <XCircle className="w-4 h-4 text-red-400 mb-1" />
          <span className="font-medium">{failed}</span>
          <span className="text-xs text-muted-foreground">Failed</span>
        </div>
      </div>

      {/* Retry summary - show if there have been any retries */}
      {(totalRetryAttempts ?? 0) > 0 && (
        <div className="flex items-center justify-between text-sm px-2 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          <div className="flex items-center text-yellow-400">
            <RefreshCw className="w-4 h-4 mr-2" />
            <span>{totalRetryAttempts} total retry attempts</span>
          </div>
          {(generationsCurrentlyRetrying ?? 0) > 0 && (
            <div className="flex items-center text-yellow-400">
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              <span>{generationsCurrentlyRetrying} retrying</span>
            </div>
          )}
        </div>
      )}

      {/* ETA display */}
      {pending > 0 && (
        <div className="flex items-center justify-between text-sm border-t border-gray-800 pt-4">
          <span className="text-muted-foreground">
            {eta.isCalculating ? 'Estimating time...' : 'Estimated time remaining'}
          </span>
          <span className="font-medium text-lg">
            {eta.formattedETA}
          </span>
        </div>
      )}

      {/* Completion message */}
      {pending === 0 && processing === 0 && total > 0 && (
        <div className="text-center py-4 border-t border-gray-800">
          <p className="text-lg font-medium text-emerald-400">
            Generation Complete
          </p>
          <p className="text-sm text-muted-foreground">
            {successful} successful, {failed} failed
          </p>
        </div>
      )}
    </div>
  );
}
