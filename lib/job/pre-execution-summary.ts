// lib/job/pre-execution-summary.ts
import { calculateCostEstimate, formatCost } from './cost-estimation';
import type { ParsedJob, FolderOperation } from '@/lib/types/job';

export interface PreExecutionSummary {
  totalPhotoCount: number;
  resolutionBreakdown: {
    '1K': number;
    '2K': number;
    '4K': number;
  };
  aspectRatioBreakdown: Record<string, number>;
  folderBreakdown: Array<{
    folderPath: string;
    photoCount: number;
    resolution: string;
    aspectRatio: string;
    photoMode: 'reference' | 'analysis';
    folderCost: number;
  }>;
  estimatedCost: number;
  estimatedDurationSeconds: number;
  estimatedDurationFormatted: string;
}

/**
 * Format duration in seconds to human-readable string
 * @param seconds - Duration in seconds
 * @returns Human-readable duration string
 */
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  } else {
    return `${remainingSeconds}s`;
  }
}

/**
 * Generate comprehensive pre-execution summary for a job
 * @param parsedJob - The parsed job from Phase 2
 * @param fileCountByFolder - Map of folder path to file count
 * @returns Pre-execution summary with all metrics
 */
export function generatePreExecutionSummary(
  parsedJob: ParsedJob,
  fileCountByFolder: Record<string, number>
): PreExecutionSummary {
  // Extract folder operations from the parsed job
  const operations = parsedJob.job?.folders || [];

  // Calculate cost breakdown
  const costBreakdown = calculateCostEstimate(operations, fileCountByFolder);

  // Build aspect ratio breakdown by iterating folders
  const aspectRatioBreakdown: Record<string, number> = {};
  for (const op of operations) {
    const folderCount = fileCountByFolder[op.folderPath] || 0;
    const excludedCount = op.excludedFiles?.length || 0;
    const effectiveCount = Math.max(0, folderCount - excludedCount);

    const aspectRatio = op.aspectRatio;
    aspectRatioBreakdown[aspectRatio] = (aspectRatioBreakdown[aspectRatio] || 0) + effectiveCount;
  }

  // Build folder breakdown with all details including photoMode
  const folderBreakdown = operations.map((op) => {
    const folderCount = fileCountByFolder[op.folderPath] || 0;
    const excludedCount = op.excludedFiles?.length || 0;
    const effectiveCount = Math.max(0, folderCount - excludedCount);

    // Find corresponding cost breakdown entry
    const folderCostEntry = costBreakdown.byFolder.find(
      (f) => f.folderPath === op.folderPath
    );
    const folderCost = folderCostEntry?.folderCost || 0;

    return {
      folderPath: op.folderPath,
      photoCount: effectiveCount,
      resolution: op.resolution || '2K', // Default to 2K if not specified
      aspectRatio: op.aspectRatio,
      photoMode: op.photoMode,
      folderCost,
    };
  });

  // Calculate estimated duration
  // Assume ~60 seconds per generation on average
  // With 20 concurrent: Math.ceil(totalImages / 20) * 60
  const totalPhotoCount = costBreakdown.totalImages;
  const estimatedDurationSeconds = Math.ceil(totalPhotoCount / 20) * 60;
  const estimatedDurationFormatted = formatDuration(estimatedDurationSeconds);

  return {
    totalPhotoCount,
    resolutionBreakdown: costBreakdown.byResolution,
    aspectRatioBreakdown,
    folderBreakdown,
    estimatedCost: costBreakdown.estimatedCost,
    estimatedDurationSeconds,
    estimatedDurationFormatted,
  };
}
