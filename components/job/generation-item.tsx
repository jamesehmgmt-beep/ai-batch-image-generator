'use client';

import { memo } from 'react';
import { StatusBadge } from './status-badge';
import { ExternalLink, ImageIcon, RefreshCw, Loader2 } from 'lucide-react';

interface GenerationItemProps {
  generation: {
    id: string;
    state: 'pending' | 'processing' | 'completed' | 'failed';
    sourceFileName: string;
    resultUrl?: string;
    errorMessage?: string;
    taskId?: string;
    retryCount?: number;
    folderPath?: string;
  };
}

// CRITICAL: Wrap in memo to prevent re-render on unrelated updates
// This is essential for 500+ items updating in real-time
export const GenerationItem = memo(function GenerationItem({
  generation,
}: GenerationItemProps) {
  const { id, state, sourceFileName, resultUrl, errorMessage, taskId, retryCount } = generation;

  return (
    <div className="border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-colors bg-gray-900/50">
      <div className="flex items-start justify-between gap-4">
        {/* Left: File info */}
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="p-2 rounded-md bg-gray-800">
            <ImageIcon className="w-4 h-4 text-gray-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" title={sourceFileName}>
              {sourceFileName}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              ID: {id.slice(0, 8)}...
            </p>
            {taskId && (
              <p className="text-xs text-muted-foreground">
                Task: {taskId.slice(0, 8)}...
              </p>
            )}
          </div>
        </div>

        {/* Right: Status and retry count */}
        <div className="flex items-center gap-2">
          <StatusBadge state={state} />
          {/* Retry count indicator - show if > 0 */}
          {retryCount && retryCount > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
              <RefreshCw className="w-3 h-3 mr-1" />
              Retry #{retryCount}
            </span>
          )}
        </div>
      </div>

      {/* Retrying indicator - shows when pending with previous retry */}
      {state === 'pending' && retryCount && retryCount > 0 && (
        <div className="mt-2 flex items-center text-yellow-400 text-xs">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          Retrying...
        </div>
      )}

      {/* Result link */}
      {state === 'completed' && resultUrl && (
        <a
          href={resultUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 hover:underline mt-3"
        >
          <ExternalLink className="w-3 h-3" />
          View result
        </a>
      )}

      {/* Error message */}
      {state === 'failed' && errorMessage && (
        <div className="mt-3 p-2 rounded bg-red-500/10 border border-red-500/20">
          <p className="text-xs text-red-400">{errorMessage}</p>
        </div>
      )}
    </div>
  );
});
